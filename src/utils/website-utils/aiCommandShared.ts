/**
 * AI Command Service — Shared Infrastructure
 *
 * Plumbing shared by every AI Command public function in
 * `aiCommandService.ts`: the Anthropic client singleton, the model id,
 * the manual cost-logging helper, the cached prompt loaders, and the
 * small response-parsing helpers.
 *
 * Extracted from `aiCommandService.ts` as a behavior-preserving
 * structural split (file-size ceiling). Signatures and logic are
 * unchanged.
 *
 * Direct SDK calls — instrumented manually via `safeLogAiCostEvent`. Each
 * public function accepts an optional `costContext` carrying the project id
 * and metadata; when omitted, no cost row is written.
 */

import Anthropic from "@anthropic-ai/sdk";
import { loadPrompt } from "../../agents/service.prompt-loader";
import { safeLogAiCostEvent } from "../../services/ai-cost/service.ai-cost";

export const MODEL = "claude-sonnet-4-6";

/** Optional cost-accounting context passed by callers that have a project. */
export interface AiCommandCostContext {
  projectId: string;
  eventType?: string;
  metadata?: Record<string, unknown>;
}

/** Internal helper — logs one row per Anthropic response. Never throws. */
export async function logAnthropicCost(
  ctx: AiCommandCostContext | undefined,
  defaultEventType: string,
  response: { model?: string; usage?: { input_tokens?: number; output_tokens?: number } },
  extraMetadata?: Record<string, unknown>,
): Promise<void> {
  if (!ctx?.projectId) return;
  await safeLogAiCostEvent({
    projectId: ctx.projectId,
    eventType: ctx.eventType || defaultEventType,
    vendor: "anthropic",
    model: response.model || MODEL,
    usage: {
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
    },
    metadata: { ...(ctx.metadata || {}), ...(extraMetadata || {}) },
  });
}

// Load prompts from .md files (cached after first read)
export const getAnalysisPrompt = () => loadPrompt("websiteAgents/aiCommand/Analysis");
export const getStructuralPrompt = () => loadPrompt("websiteAgents/aiCommand/Structural");
export const getExecutionPrompt = () => loadPrompt("websiteAgents/aiCommand/Execution");
export const getSectionPlannerPrompt = () => loadPrompt("websiteAgents/aiCommand/SectionPlanner");
export const getSectionGeneratorPrompt = () => loadPrompt("websiteAgents/aiCommand/SectionGenerator");
export const getVisualAnalysisPrompt = () => loadPrompt("websiteAgents/aiCommand/VisualAnalysis");
export const getPostContentPrompt = () => loadPrompt("websiteAgents/aiCommand/PostContent");

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function extractText(response: Anthropic.Message): string {
  const block = response.content[0];
  if (!block || block.type !== "text") {
    throw new Error("No text response from Claude");
  }
  return block.text;
}

export function tryParseJson(text: string): any | null {
  try {
    let cleaned = text.trim();

    // Strip markdown fences
    const fenceMatch = cleaned.match(/```\w*\n([\s\S]*?)```/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export function cleanHtmlOutput(text: string): string {
  let cleaned = text.trim();

  // Strip markdown fences
  const fenceMatch = cleaned.match(/```\w*\n([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  return cleaned;
}
