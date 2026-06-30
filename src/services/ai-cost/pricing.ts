/**
 * AI Model Pricing Table — Anthropic Claude only (MVP).
 *
 * Prices are USD per 1M tokens. These are APPROXIMATE current Anthropic public
 * list prices at time of writing (Apr 2026). They will drift — refresh as
 * Anthropic updates their pricing page. Any rows written with stale prices
 * stay frozen (estimated_cost_usd is persisted at event time).
 *
 * Sources:
 *   - Sonnet 5:           $3 / $15 (standard list rate; ignores the $2/$10
 *                         introductory rate through 2026-08-31 — table has no
 *                         expiry mechanism, so it stays on the durable price)
 *   - Sonnet 4.x family: $3 / $15 (input / output) per 1M
 *   - Opus 4.x family:   $15 / $75
 *   - Haiku 4.x family:  $0.80 / $4
 *   - Cache write:       1.25x input rate
 *   - Cache read:        0.10x input rate
 *
 * TODO (deferred):
 *   - Apify actor cost (per-run pricing, polled post-run).
 *   - Puppeteer self-hosted (infra cost, not per-request).
 *   - OpenAI embeddings (text-embedding-3-small = $0.02/1M).
 *   - Google Places API (flat per-call fees).
 */

export interface ModelRate {
  /** USD per 1M input tokens */
  input: number;
  /** USD per 1M output tokens */
  output: number;
  /** USD per 1M cache-creation input tokens (prompt caching write) */
  cache_creation: number;
  /** USD per 1M cache-read input tokens (prompt caching hit) */
  cache_read: number;
}

/**
 * Model id → rate. Matches the exact strings Anthropic returns in
 * `response.model`. Keys without a version suffix act as family fallbacks.
 */
export const MODEL_PRICING: Record<string, ModelRate> = {
  // Sonnet 5
  "claude-sonnet-5": {
    input: 3.0,
    output: 15.0,
    cache_creation: 3.75,
    cache_read: 0.3,
  },
  // Sonnet 4.x family
  "claude-sonnet-4-6": {
    input: 3.0,
    output: 15.0,
    cache_creation: 3.75,
    cache_read: 0.3,
  },
  "claude-sonnet-4-5": {
    input: 3.0,
    output: 15.0,
    cache_creation: 3.75,
    cache_read: 0.3,
  },
  // Opus 4.x family
  "claude-opus-4-7": {
    input: 15.0,
    output: 75.0,
    cache_creation: 18.75,
    cache_read: 1.5,
  },
  "claude-opus-4-5": {
    input: 15.0,
    output: 75.0,
    cache_creation: 18.75,
    cache_read: 1.5,
  },
  // Haiku 4.x family
  "claude-haiku-4-5": {
    input: 0.8,
    output: 4.0,
    cache_creation: 1.0,
    cache_read: 0.08,
  },
  "claude-haiku-4-5-20251001": {
    input: 0.8,
    output: 4.0,
    cache_creation: 1.0,
    cache_read: 0.08,
  },
};

const FAMILY_FALLBACK: ReadonlyArray<{ needle: string; rate: ModelRate }> = [
  {
    needle: "opus",
    rate: { input: 15.0, output: 75.0, cache_creation: 18.75, cache_read: 1.5 },
  },
  {
    needle: "haiku",
    rate: { input: 0.8, output: 4.0, cache_creation: 1.0, cache_read: 0.08 },
  },
  {
    needle: "sonnet",
    rate: { input: 3.0, output: 15.0, cache_creation: 3.75, cache_read: 0.3 },
  },
];

/** Resolve a rate for a model id with family-based fallback. */
export function getModelRate(model: string): ModelRate | null {
  const exact = MODEL_PRICING[model];
  if (exact) return exact;
  const lower = model.toLowerCase();
  for (const entry of FAMILY_FALLBACK) {
    if (lower.includes(entry.needle)) return entry.rate;
  }
  return null;
}
