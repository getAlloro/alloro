import { AiVisibilityEngine, AiVisibilityEngineAdapter } from "./types";
import { GeminiVisibilityAdapter } from "./adapters/geminiAdapter";
import { PerplexityVisibilityAdapter } from "./adapters/perplexityAdapter";
import { SerpApiAiOverviewAdapter } from "./adapters/serpApiAdapter";

/** Every known engine (for honest "skipped" reporting). */
export const KNOWN_ENGINES: AiVisibilityEngine[] = [
  "gemini",
  "perplexity",
  "google_ai_overview",
];

/**
 * All known adapters, preferred order. Gemini is live + verified; Perplexity and
 * SerpApi are written but activate only when their key is present.
 */
function allAdapters(): AiVisibilityEngineAdapter[] {
  return [
    new GeminiVisibilityAdapter(),
    new PerplexityVisibilityAdapter(),
    new SerpApiAiOverviewAdapter(),
  ];
}

let injected: AiVisibilityEngineAdapter[] | null = null;

/** Test seam: inject fakes; pass null to restore the real adapters. */
export function setAiVisibilityAdapters(
  adapters: AiVisibilityEngineAdapter[] | null
): void {
  injected = adapters;
}

/** Only adapters that are configured (have their key) run — the rest are skipped. */
export function getConfiguredAdapters(): AiVisibilityEngineAdapter[] {
  const adapters = injected ?? allAdapters();
  return adapters.filter((a) => a.isConfigured());
}
