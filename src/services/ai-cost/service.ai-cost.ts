/**
 * AI Cost Service
 *
 * Writes one row per LLM request to `website_builder.ai_cost_events`.
 * `safeLogAiCostEvent()` is the caller-preferred entry point — it wraps
 * `logAiCostEvent()` in a try/catch so cost logging can NEVER break the LLM
 * pipeline, no matter what goes wrong (DB down, bad input, etc.).
 *
 * Scope for this MVP: Anthropic Claude only.
 *
 * TODO (deferred — do NOT instrument in this pass):
 *   - Apify actor costs (needs post-run cost API polling)
 *   - Puppeteer (self-hosted, no per-call cost)
 *   - OpenAI embeddings (text-embedding-3-small)
 *   - Google Places API (per-call pricing)
 */

import { AiCostEventModel } from "../../models/website-builder/AiCostEventModel";
import { getModelRate, type ModelRate } from "./pricing";
import logger from "../../lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsageBreakdown {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_tokens?: number | null;
  cache_read_tokens?: number | null;
}

export interface AiCostEventInput {
  /** Project this cost belongs to. Null for non-project contexts (e.g. minds-chat). */
  projectId: string | null;
  /** Event type label — page-generate, section-regenerate, warmup, layouts-build, etc. */
  eventType: string;
  /** Vendor label. Default: "anthropic". */
  vendor?: string;
  /** Model id (Anthropic `response.model` value). */
  model: string;
  /** Token usage from the SDK response. */
  usage: UsageBreakdown;
  /** Optional structured metadata (page_id, component_name, mind_id, etc.). */
  metadata?: Record<string, unknown> | null;
  /** Parent event id (for nested tool calls — rolls up under the top-level run). */
  parentEventId?: string | null;
}

export interface LoggedAiCostEvent {
  id: string;
  project_id: string | null;
  event_type: string;
  vendor: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number | null;
  cache_read_tokens: number | null;
  estimated_cost_usd: string; // numeric comes back as string from pg
  metadata: Record<string, unknown> | null;
  parent_event_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Cost Estimation
// ---------------------------------------------------------------------------

/**
 * Estimate the USD cost of a single LLM call given its model + token usage.
 * Returns `0` if the model is unknown (so cost logging still captures the row).
 */
export function estimateCost(model: string, usage: UsageBreakdown): number {
  const rate = getModelRate(model);
  if (!rate) return 0;
  return estimateCostFromRate(rate, usage);
}

function estimateCostFromRate(rate: ModelRate, usage: UsageBreakdown): number {
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheWrite = usage.cache_creation_tokens ?? 0;
  const cacheRead = usage.cache_read_tokens ?? 0;

  const cost =
    (input / 1_000_000) * rate.input +
    (output / 1_000_000) * rate.output +
    (cacheWrite / 1_000_000) * rate.cache_creation +
    (cacheRead / 1_000_000) * rate.cache_read;

  return round6(cost);
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Persist a cost event. May throw. Prefer `safeLogAiCostEvent` for pipeline
 * paths so cost logging failures cannot break the call chain.
 */
export async function logAiCostEvent(
  input: AiCostEventInput,
): Promise<LoggedAiCostEvent> {
  const vendor = input.vendor || "anthropic";
  const cost = estimateCost(input.model, input.usage);

  const row = {
    project_id: input.projectId,
    event_type: input.eventType,
    vendor,
    model: input.model,
    input_tokens: input.usage.input_tokens ?? 0,
    output_tokens: input.usage.output_tokens ?? 0,
    cache_creation_tokens: input.usage.cache_creation_tokens ?? null,
    cache_read_tokens: input.usage.cache_read_tokens ?? null,
    estimated_cost_usd: cost,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    parent_event_id: input.parentEventId ?? null,
  };

  const persisted = await AiCostEventModel.insertReturning(row);
  return persisted as LoggedAiCostEvent;
}

/**
 * Fire-and-forget wrapper. Swallows all errors after a logged warning. Returns
 * the persisted event (or null on failure) for callers that need the id to
 * thread `parent_event_id` through nested tool calls.
 */
export async function safeLogAiCostEvent(
  input: AiCostEventInput,
): Promise<LoggedAiCostEvent | null> {
  try {
    return await logAiCostEvent(input);
  } catch (err: any) {
    logger.warn(
      `[ai-cost] Failed to log event (${input.eventType} / ${input.model}): ${err?.message || err}`,
    );
    return null;
  }
}
