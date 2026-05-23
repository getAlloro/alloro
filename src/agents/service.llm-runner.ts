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

const DEFAULT_MODEL = process.env.AGENTS_LLM_MODEL || "claude-sonnet-4-6";

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
  /**
   * Opt-in: wrap the system prompt with ephemeral cache_control so repeated
   * calls with the same systemPrompt within the cache TTL (5 minutes default)
   * read from cache at 10 percent of the normal input-token cost.
   *
   * Use when the same agent fires multiple times in a short window with the
   * same system prompt (Reviewer Claude per artifact, NARRATOR per customer,
   * SUMMARY per org). Do NOT use when the system prompt varies per call.
   *
   * Minimum cacheable size: 1024 tokens (Sonnet/Haiku/Opus). Short prompts
   * silently skip caching server-side.
   *
   * Anthropic SDK 0.92.0 (installed) supports the TextBlockParam[] form with
   * cache_control. Default false to preserve byte-identical behavior for
   * call sites that have not opted in.
   */
  cacheSystem?: boolean;
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
    cacheSystem = false,
  } = options;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  if (prefill) {
    messages.push({ role: "assistant", content: prefill });
  }

  // System prompt shape: plain string by default; opt into cache_control by
  // passing cacheSystem: true. Anthropic API tolerates short prompts in the
  // array form (caching silently skips below the per-model minimum size).
  const systemField: Anthropic.MessageCreateParams["system"] = cacheSystem
    ? [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ]
    : systemPrompt;

  const response = await getClient().messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemField,
    messages,
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );

  let raw = textBlock?.text || "";

  // If we used a prefill, prepend it to reconstruct the full response
  if (prefill) {
    raw = prefill + raw;
  }

  // Attempt JSON parse with multiple extraction strategies
  const parsed = extractJson(raw);

  return {
    raw,
    parsed,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
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
