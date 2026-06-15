/**
 * Page Editor Service
 * Handles LLM-powered HTML component editing via the Anthropic Claude SDK.
 *
 * Uses a direct Anthropic SDK call (not service.llm-runner) — cost logging is
 * instrumented manually via `safeLogAiCostEvent`.
 *
 * TODO (deferred): Apify, Puppeteer, OpenAI embeddings, Google Places — left
 * un-instrumented in this MVP pass. See `src/services/ai-cost/pricing.ts`.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getPageEditorPrompt } from "./pageEditorPrompt";
import { safeLogAiCostEvent } from "../../services/ai-cost/service.ai-cost";
import logger from "../../lib/logger";

const MODEL = "claude-haiku-4-5-20251001";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

interface EditRequest {
  alloroClass: string;
  currentHtml: string;
  instruction: string;
  chatHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  mediaContext?: string;
  promptType?: "admin" | "user";
  /** Optional: project + entity context for cost logging. */
  costContext?: {
    projectId: string;
    eventType?: string;
    metadata?: Record<string, unknown>;
  };
}

interface EditDebugInfo {
  model: string;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  inputTokens: number;
  outputTokens: number;
}

interface EditResponse {
  editedHtml: string | null;
  message: string;
  rejected: boolean;
  debug: EditDebugInfo;
}

/**
 * Send a component's HTML + edit instruction to Claude and get back modified HTML.
 */
export async function editHtmlComponent(params: EditRequest): Promise<EditResponse> {
  const { alloroClass, currentHtml, instruction, chatHistory = [], mediaContext = "", promptType = "admin", costContext } = params;
  const ai = getClient();

  // Build the Anthropic messages array from chat history + current instruction
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const msg of chatHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Add the current instruction with the component HTML context
  const userMessage = `Element class: ${alloroClass}

Current HTML:
${currentHtml}

Instruction: ${instruction}${mediaContext}`;

  messages.push({ role: "user", content: userMessage });

  const systemPrompt = await getPageEditorPrompt(promptType);

  logger.info(`[PageEditor] Sending edit request to Claude for class: ${alloroClass}`);
  logger.info(`[PageEditor] Instruction: ${instruction}`);
  logger.info(`[PageEditor] HTML size: ${currentHtml.length} chars, history: ${chatHistory.length} messages`);

  const response = await ai.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  });

  // Extract the text response
  const textBlock = response.content[0];
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }
  const text = textBlock.text;

  const debugInfo: EditDebugInfo = {
    model: MODEL,
    systemPrompt,
    messages,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };

  // Parse the JSON response from the LLM
  let parsed: { error: boolean; message: string; html?: string };
  try {
    let cleaned = text.trim();

    // Extract content from markdown fenced code blocks anywhere in the response.
    // Handles cases where the LLM wraps its output in ```json, ```html, or ```
    // with optional text/headers before and after the fence.
    const fenceMatch = cleaned.match(/```\w*\n([\s\S]*?)```/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    // Try JSON parse first (happy path)
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // If JSON parse fails, check if it looks like raw HTML
      if (cleaned.startsWith("<")) {
        logger.warn("[PageEditor] LLM returned raw HTML instead of JSON — wrapping automatically");
        parsed = {
          error: false,
          message: "Applied edit",
          html: cleaned,
        };
      } else {
        throw new Error("Response is neither valid JSON nor HTML");
      }
    }
  } catch (parseErr) {
    logger.error({ err: text.substring(0, 200) }, "[PageEditor] LLM returned invalid response:");
    throw new Error("LLM returned invalid response — expected JSON or HTML");
  }

  // Log token usage
  logger.info(
    `[PageEditor] ✓ Edit complete. Input tokens: ${debugInfo.inputTokens}, Output tokens: ${debugInfo.outputTokens}`
  );

  // Cost capture (fire-and-forget — never blocks the edit response)
  if (costContext?.projectId) {
    await safeLogAiCostEvent({
      projectId: costContext.projectId,
      eventType: costContext.eventType || "editor-chat",
      vendor: "anthropic",
      model: response.model,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
      metadata: {
        alloro_class: alloroClass,
        prompt_type: promptType,
        ...(costContext.metadata || {}),
      },
    });
  }

  // Handle rejection — LLM flagged the instruction as not allowed
  if (parsed.error) {
    logger.info(`[PageEditor] ✗ Edit rejected: ${parsed.message}`);
    return {
      editedHtml: null,
      message: parsed.message || "This edit is not allowed.",
      rejected: true,
      debug: debugInfo,
    };
  }

  // Validate the returned HTML
  const editedHtml = (parsed.html || "").trim();
  if (!editedHtml) {
    throw new Error("LLM returned empty HTML");
  }

  if (!editedHtml.includes(alloroClass)) {
    logger.error(`[PageEditor] Alloro class "${alloroClass}" missing from LLM response`);
    throw new Error(
      `The edit removed the component identifier class "${alloroClass}". This is not allowed.`
    );
  }

  return {
    editedHtml,
    message: parsed.message || `Applied edit to ${alloroClass}`,
    rejected: false,
    debug: debugInfo,
  };
}
