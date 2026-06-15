/**
 * LLM Runner Service
 *
 * Generic Anthropic Claude caller. Takes a system prompt + user message,
 * calls the API, and returns the raw + parsed response.
 *
 * Does NOT persist anything — the calling code decides what to do
 * with the result (save to agent_results, return to client, etc.).
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ZodTypeAny } from "zod";
import { safeLogAiCostEvent } from "../services/ai-cost/service.ai-cost";
import logger from "../lib/logger";

const DEFAULT_MODEL = process.env.AGENTS_LLM_MODEL || "claude-sonnet-4-6";

/**
 * Optional cost-accounting context. When provided, the runner fires
 * `safeLogAiCostEvent` after every successful Anthropic call. Nested tool
 * turns inside `runWithTools` chain onto the top-level event via
 * `parent_event_id` so a single logical run rolls up.
 */
export interface CostContext {
  /** Project id for `ai_cost_events.project_id`. Null is allowed. */
  projectId: string | null;
  /** Event type label (e.g. `page-generate`, `warmup`, `critic`). */
  eventType: string;
  /** Free-form metadata row — merged with any caller-provided values. */
  metadata?: Record<string, unknown> | null;
  /** Parent event id — used to nest repeated tool turns under a top-level run. */
  parentEventId?: string | null;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

// =====================================================================
// TYPES
// =====================================================================

export interface LlmRunnerOptions {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Optional assistant prefill to steer output format (e.g. "{" for JSON) */
  prefill?: string;
  /** Optional images to send alongside userMessage (multimodal input) */
  images?: Array<{
    mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
    base64: string;
  }>;
  /**
   * Optional cached system blocks prepended to the systemPrompt. When present,
   * the system is structured as an array of blocks with `cache_control: ephemeral`
   * set on the cached prefix so Claude's prompt cache (5-min TTL) can skip
   * reprocessing on subsequent calls within the window.
   */
  cachedSystemBlocks?: string[];
  /**
   * Optional cost-accounting context. When set, the runner fires
   * `safeLogAiCostEvent` after a successful call. Never throws.
   */
  costContext?: CostContext;
  /**
   * Optional Zod schema. When provided, the runner runs `safeParse` on the
   * extracted JSON. On failure, it issues ONE corrective follow-up call
   * (same model/system/cache/temperature/maxTokens) embedding the schema
   * errors and asks for a strictly valid JSON object. On success, the
   * second parsed object is returned. On second failure, the first parsed
   * object is returned and a `[zod-retry] failed both attempts` line is
   * logged so the outer caller's legacy validation still gets a chance.
   *
   * Backward compat: when undefined, behaviour is identical to pre-Zod.
   */
  outputSchema?: ZodTypeAny;
}

export interface LlmRunnerResult {
  /** Raw text response from the model */
  raw: string;
  /** JSON-parsed response if parseable, null otherwise */
  parsed: any | null;
  /** Model used */
  model: string;
  /** Token usage */
  inputTokens: number;
  outputTokens: number;
  /** Prompt cache metrics (when cachedSystemBlocks was used) */
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  /** Why the model stopped: "end_turn", "max_tokens", "stop_sequence" */
  stopReason: string;
}

// =====================================================================
// CORE: RUN AGENT
// =====================================================================

/**
 * Call Claude with a system prompt and user message.
 * Returns the raw text and attempts JSON parsing.
 */
export async function runAgent(
  options: LlmRunnerOptions
): Promise<LlmRunnerResult> {
  const {
    systemPrompt,
    userMessage,
    model = DEFAULT_MODEL,
    maxTokens = 16384,
    temperature = 0,
    prefill,
    images,
    cachedSystemBlocks,
    costContext,
    outputSchema,
  } = options;

  const messages: Anthropic.MessageParam[] = [];

  if (images && images.length > 0) {
    const userContent: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [
      ...images.map((img) => ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: img.mediaType,
          data: stripDataUrlPrefix(img.base64),
        },
      })),
      { type: "text" as const, text: userMessage },
    ];
    messages.push({ role: "user", content: userContent });
  } else {
    messages.push({ role: "user", content: userMessage });
  }

  // Claude 4.x models (Sonnet 4.6, Opus 4.7, Haiku 4.5) dropped support for
  // assistant-message prefill: the conversation MUST end with a user message.
  // Silently strip any prefill with a warning so legacy callers don't 400.
  // The `extractJson` helper handles markdown fences + brace matching, so
  // prefill is no longer needed for JSON-shape steering.
  if (prefill) {
    logger.warn(
      `[LLM] prefill="${prefill}" ignored — Claude 4.x rejects assistant prefill. ` +
        `Remove prefill from your runAgent call; extractJson handles JSON parsing.`,
    );
  }

  const imgSizeKB = images
    ? Math.round(
        images.reduce(
          (sum, i) => sum + stripDataUrlPrefix(i.base64).length * 0.75,
          0
        ) / 1024
      )
    : 0;
  const imgCount = images?.length ?? 0;
  logger.info(
    `[LLM] → ${model} system=${systemPrompt.length}ch user=${userMessage.length}ch ` +
      `images=${imgCount}${imgCount ? ` (${imgSizeKB}kB)` : ""} maxTokens=${maxTokens}`
  );

  // Build system param. If cachedSystemBlocks provided, structure system as
  // an array of blocks with cache_control: ephemeral on the cached prefix.
  let systemParam: any;
  if (cachedSystemBlocks !== undefined) {
    systemParam = [
      ...cachedSystemBlocks.map((text) => ({
        type: "text",
        text,
        cache_control: { type: "ephemeral" },
      })),
      // The main systemPrompt is also cached — it's stable per template
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ];
  } else {
    systemParam = systemPrompt;
  }

  const callStart = Date.now();
  let response: any;
  try {
    response = await (getClient() as any).messages.create(
      {
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemParam,
        messages,
      },
      cachedSystemBlocks !== undefined
        ? { headers: { "anthropic-beta": "prompt-caching-2024-07-31" } }
        : undefined,
    );
  } catch (err: any) {
    const status = err?.status ?? err?.response?.status ?? "?";
    const body = err?.error ?? err?.response?.data ?? err?.body;
    logger.error(
      `[LLM] ✗ API error (${Date.now() - callStart}ms) status=${status} message="${err?.message}"`
    );
    if (body) {
      logger.error(
        `[LLM]   body: ${typeof body === "string" ? body : JSON.stringify(body).slice(0, 500)}`
      );
    }
    throw err;
  }

  const textBlock = response.content.find(
    (b: any): b is Anthropic.TextBlock => b.type === "text"
  );

  let raw = textBlock?.text || "";

  // prefill was stripped earlier for Claude 4.x compat — extractJson handles
  // unprefilled JSON via direct parse, fence strip, and brace matching.
  let parsed = extractJson(raw);

  let cacheCreationTokens = response.usage?.cache_creation_input_tokens ?? 0;
  let cacheReadTokens = response.usage?.cache_read_input_tokens ?? 0;
  let inputTokensTotal = response.usage.input_tokens;
  let outputTokensTotal = response.usage.output_tokens;
  let responseModel = response.model;
  const cacheSuffix = cacheCreationTokens || cacheReadTokens
    ? ` cacheWrite=${cacheCreationTokens} cacheRead=${cacheReadTokens}`
    : "";

  const stopReason = response.stop_reason ?? "unknown";
  logger.info(
    `[LLM] ✓ ${response.model} (${Date.now() - callStart}ms) ` +
      `tokens=${response.usage.input_tokens}/${response.usage.output_tokens}${cacheSuffix} ` +
      `stop=${stopReason} parsed=${parsed ? "ok" : "null"} raw=${raw.length}ch`
  );

  if (stopReason === "max_tokens" && !parsed) {
    logger.warn(
      `[LLM] ⚠ Output truncated at max_tokens=${maxTokens} — JSON likely incomplete. ` +
      `Consider increasing maxTokens for this agent.`
    );
  }

  if (costContext) {
    await safeLogAiCostEvent({
      projectId: costContext.projectId,
      eventType: costContext.eventType,
      vendor: "anthropic",
      model: response.model,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_creation_tokens: cacheCreationTokens,
        cache_read_tokens: cacheReadTokens,
      },
      metadata: costContext.metadata ?? null,
      parentEventId: costContext.parentEventId ?? null,
    });
  }

  // ---------------------------------------------------------------
  // Optional Zod validation + corrective single-retry.
  //
  // Cap: ONE corrective retry per outer attempt. If the second
  // response still fails Zod, return the first parsed object and
  // let the outer caller's existing legacy `isValidAgentOutput`
  // fallback handle it.
  // ---------------------------------------------------------------
  if (outputSchema && parsed !== null) {
    const firstResult = outputSchema.safeParse(parsed);
    if (!firstResult.success) {
      const issues = JSON.stringify(firstResult.error.issues, null, 2).slice(
        0,
        2000,
      );
      logger.warn(
        `[zod-retry] first attempt failed schema validation. issues: ${issues}`,
      );

      const correctiveMessage =
        `Your previous response failed schema validation. Errors:\n` +
        `${issues}\n\n` +
        `Respond again with ONLY a valid JSON object matching the schema ` +
        `described in the system prompt. No markdown fences, no ` +
        `explanation, no text before or after.`;

      const retryMessages: Anthropic.MessageParam[] = [
        { role: "user", content: userMessage },
        { role: "assistant", content: raw },
        { role: "user", content: correctiveMessage },
      ];

      const retryStart = Date.now();
      let retryResponse: any;
      try {
        retryResponse = await (getClient() as any).messages.create(
          {
            model,
            max_tokens: maxTokens,
            temperature,
            system: systemParam,
            messages: retryMessages,
          },
          cachedSystemBlocks !== undefined
            ? { headers: { "anthropic-beta": "prompt-caching-2024-07-31" } }
            : undefined,
        );
      } catch (err: any) {
        const status = err?.status ?? err?.response?.status ?? "?";
        logger.error(
          `[zod-retry] ✗ API error (${Date.now() - retryStart}ms) status=${status} message="${err?.message}"`,
        );
        // Swallow retry errors — we still have a usable first parsed payload.
        retryResponse = null;
      }

      if (retryResponse) {
        const retryTextBlock = retryResponse.content.find(
          (b: any): b is Anthropic.TextBlock => b.type === "text",
        );
        const raw2 = retryTextBlock?.text || "";
        const retryCacheCreation =
          retryResponse.usage?.cache_creation_input_tokens ?? 0;
        const retryCacheRead =
          retryResponse.usage?.cache_read_input_tokens ?? 0;
        const retryCacheSuffix = retryCacheCreation || retryCacheRead
          ? ` cacheWrite=${retryCacheCreation} cacheRead=${retryCacheRead}`
          : "";
        const parsed2 = extractJson(raw2);

        logger.info(
          `[LLM] ✓ ${retryResponse.model} (${Date.now() - retryStart}ms) ` +
            `tokens=${retryResponse.usage.input_tokens}/${retryResponse.usage.output_tokens}${retryCacheSuffix} ` +
            `parsed=${parsed2 ? "ok" : "null"} raw=${raw2.length}ch [zod-retry]`,
        );

        if (costContext) {
          await safeLogAiCostEvent({
            projectId: costContext.projectId,
            eventType: costContext.eventType,
            vendor: "anthropic",
            model: retryResponse.model,
            usage: {
              input_tokens: retryResponse.usage.input_tokens,
              output_tokens: retryResponse.usage.output_tokens,
              cache_creation_tokens: retryCacheCreation,
              cache_read_tokens: retryCacheRead,
            },
            metadata: {
              ...(costContext.metadata ?? {}),
              zod_retry: true,
            },
            parentEventId: costContext.parentEventId ?? null,
          });
        }

        if (parsed2 !== null) {
          const secondResult = outputSchema.safeParse(parsed2);
          if (secondResult.success) {
            logger.info(`[zod-retry] succeeded on second attempt`);
            // Promote second-attempt outputs as the canonical result.
            raw = raw2;
            parsed = parsed2;
            cacheCreationTokens = retryCacheCreation;
            cacheReadTokens = retryCacheRead;
            inputTokensTotal = retryResponse.usage.input_tokens;
            outputTokensTotal = retryResponse.usage.output_tokens;
            responseModel = retryResponse.model;
          } else {
            const issues2 = JSON.stringify(
              secondResult.error.issues,
              null,
              2,
            ).slice(0, 2000);
            logger.warn(
              `[zod-retry] failed both attempts: ${issues2}`,
            );
            // Fall through with first parsed — outer caller's
            // legacy `isValidAgentOutput` will run on it.
          }
        } else {
          logger.warn(
            `[zod-retry] second response did not yield parseable JSON; falling back to first attempt`,
          );
        }
      }
    }
  }

  return {
    cacheCreationInputTokens: cacheCreationTokens,
    cacheReadInputTokens: cacheReadTokens,
    raw,
    parsed,
    model: responseModel,
    inputTokens: inputTokensTotal,
    outputTokens: outputTokensTotal,
    stopReason,
  };
}

function stripDataUrlPrefix(data: string): string {
  const match = data.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.*)$/);
  return match ? match[1] : data;
}

// =====================================================================
// TOOL CALLING
// =====================================================================

export interface ToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface RunWithToolsOptions {
  systemPrompt: string;
  userMessage: string;
  tools: ToolSchema[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * Optional tool choice — "auto" (default), "any" (must call a tool),
   * or a specific tool name.
   */
  toolChoice?: "auto" | "any" | { type: "tool"; name: string };
  /** Optional cached system blocks — see LlmRunnerOptions.cachedSystemBlocks */
  cachedSystemBlocks?: string[];
  /**
   * Conversation continuation — when responding to previous tool calls, pass
   * the full messages array including assistant tool_use and user tool_result
   * blocks. If provided, userMessage is ignored.
   */
  messages?: any[];
  /**
   * Optional cost-accounting context. When set, the runner fires
   * `safeLogAiCostEvent` per turn. Callers handling multi-turn tool loops
   * should pass the first turn's returned `costEventId` as `parentEventId`
   * on follow-up turns to roll usage under a single logical run.
   */
  costContext?: CostContext;
}

export interface RunWithToolsResult {
  toolCalls: ToolCall[];
  textResponse: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
  /** Raw assistant content array (for feeding back into conversations). */
  assistantContent: any[];
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  /**
   * Id of the `ai_cost_events` row persisted for this turn. Callers running
   * multi-turn tool loops should pass this as `parentEventId` on subsequent
   * calls so nested turns chain under the root run.
   */
  costEventId?: string | null;
}

/**
 * Call Claude with a set of tools available. Returns structured tool calls
 * (Claude may call multiple in a single turn) and/or a text response.
 * Used for structured output scenarios (identity chat updates, critique,
 * image selection) where the LLM must pick a structured action.
 */
export async function runWithTools(
  options: RunWithToolsOptions,
): Promise<RunWithToolsResult> {
  const {
    systemPrompt,
    userMessage,
    tools,
    model = DEFAULT_MODEL,
    maxTokens = 4096,
    temperature = 0,
    toolChoice,
    cachedSystemBlocks,
    messages: conversationMessages,
    costContext,
  } = options;

  logger.info(
    `[LLM-TOOLS] → ${model} system=${systemPrompt.length}ch user=${userMessage.length}ch ` +
      `tools=${tools.length} maxTokens=${maxTokens}`,
  );

  // System param with optional cached blocks
  let systemParam: any;
  if (cachedSystemBlocks !== undefined) {
    systemParam = [
      ...cachedSystemBlocks.map((text) => ({
        type: "text",
        text,
        cache_control: { type: "ephemeral" },
      })),
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ];
  } else {
    systemParam = systemPrompt;
  }

  const requestBody: any = {
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemParam,
    messages: conversationMessages && conversationMessages.length > 0
      ? conversationMessages
      : [{ role: "user", content: userMessage }],
    tools,
  };

  if (toolChoice === "auto") {
    requestBody.tool_choice = { type: "auto" };
  } else if (toolChoice === "any") {
    requestBody.tool_choice = { type: "any" };
  } else if (toolChoice && typeof toolChoice === "object") {
    requestBody.tool_choice = toolChoice;
  }

  const callStart = Date.now();
  let response: any;
  try {
    response = await (getClient() as any).beta.tools.messages.create(
      requestBody,
      cachedSystemBlocks !== undefined
        ? { headers: { "anthropic-beta": "prompt-caching-2024-07-31,tools-2024-04-04" } }
        : undefined,
    );
  } catch (err: any) {
    const status = err?.status ?? err?.response?.status ?? "?";
    logger.error(
      `[LLM-TOOLS] ✗ API error (${Date.now() - callStart}ms) status=${status} message="${err?.message}"`,
    );
    throw err;
  }

  const toolCalls: ToolCall[] = [];
  const textParts: string[] = [];

  for (const block of response.content as Array<any>) {
    if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
    } else if (block.type === "text") {
      textParts.push(block.text);
    }
  }

  const textResponse = textParts.length > 0 ? textParts.join("\n") : null;
  const cacheCreationTokens = response.usage?.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = response.usage?.cache_read_input_tokens ?? 0;
  const cacheSuffix = cacheCreationTokens || cacheReadTokens
    ? ` cacheWrite=${cacheCreationTokens} cacheRead=${cacheReadTokens}`
    : "";

  logger.info(
    `[LLM-TOOLS] ✓ ${response.model} (${Date.now() - callStart}ms) ` +
      `tokens=${response.usage.input_tokens}/${response.usage.output_tokens}${cacheSuffix} ` +
      `toolCalls=${toolCalls.length} stop=${response.stop_reason}`,
  );

  let costEventId: string | null = null;
  if (costContext) {
    const logged = await safeLogAiCostEvent({
      projectId: costContext.projectId,
      eventType: costContext.eventType,
      vendor: "anthropic",
      model: response.model,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_creation_tokens: cacheCreationTokens,
        cache_read_tokens: cacheReadTokens,
      },
      metadata: costContext.metadata ?? null,
      parentEventId: costContext.parentEventId ?? null,
    });
    costEventId = logged?.id ?? null;
  }

  return {
    toolCalls,
    textResponse,
    assistantContent: response.content,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    stopReason: response.stop_reason ?? null,
    cacheCreationInputTokens: cacheCreationTokens,
    cacheReadInputTokens: cacheReadTokens,
    costEventId,
  };
}

// =====================================================================
// JSON EXTRACTION
// =====================================================================

/**
 * Try multiple strategies to extract valid JSON from LLM output.
 *
 * 1. Direct parse
 * 2. Strip markdown fences (```json ... ```)
 * 3. Extract first { ... } or [ ... ] block via brace/bracket matching
 */
function extractJson(text: string): any | null {
  const trimmed = text.trim();

  // 1. Direct parse
  try {
    return JSON.parse(trimmed);
  } catch { /* continue */ }

  // 2. Strip markdown fences — handle ```json, ``` with any whitespace/newlines
  const fenceStripped = trimmed
    .replace(/^```[\w]*\s*\n?/i, "")
    .replace(/\n?\s*```\s*$/i, "")
    .trim();
  if (fenceStripped !== trimmed) {
    try {
      return JSON.parse(fenceStripped);
    } catch { /* continue */ }
  }

  // 3. Brace/bracket matched extraction — find the outermost JSON structure
  const startChar = trimmed.indexOf("{") <= trimmed.indexOf("[") || trimmed.indexOf("[") === -1
    ? "{"
    : "[";
  const endChar = startChar === "{" ? "}" : "]";
  const startIdx = trimmed.indexOf(startChar);

  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === startChar) depth++;
    else if (ch === endChar) {
      depth--;
      if (depth === 0) {
        const candidate = trimmed.slice(startIdx, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}
