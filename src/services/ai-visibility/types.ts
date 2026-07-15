/**
 * AI-Answer Visibility (AEO) observation — types + the engine-adapter interface.
 * Alloro Funnel Engine A3. The system is engine-agnostic: each AI engine is a
 * pluggable adapter behind ONE interface, carrying a mandatory capture_method
 * flag so a reading is never mistaken for "what the customer sees."
 *
 * Honesty (binding, research/aeo-measurement-spec.md + Value #6): observe
 * MENTION/CITATION, never a rank; `position` is stored raw for analysis and
 * NEVER surfaced as a rank; every reading is per-engine and proxy-labeled.
 */

/** How a reading was captured — mandatory on every observation. */
export type CaptureMethod = "api_grounded" | "api_proxy" | "serp_scrape";

/** Supported engines (extensible — add an adapter, not a rebuild). */
export type AiVisibilityEngine = "gemini" | "perplexity" | "google_ai_overview";

/** The practice the detector matches on. Sourced from PracticeFactModel / location. */
export interface PracticeIdentity {
  name: string;
  /** e.g. "brightsmiles.com" — used to detect a citation of the practice's own site. */
  domain?: string | null;
  gbpTitle?: string | null;
}

export interface EnginePrompt {
  /** Stable id for idempotency (location+promptKey+engine+run-date is unique). */
  key: string;
  text: string;
  kind: "generic" | "contextualized";
}

/** Raw adapter output, BEFORE detection. */
export interface EngineRawResult {
  answerText: string;
  /** Source titles/domains from citations/grounding. May be partial (e.g. Gemini redirect URLs → title only). */
  citationSources: string[];
  captureMethod: CaptureMethod;
}

/**
 * One engine adapter. `isConfigured()` gates execution (e.g. an API key must be
 * present) so an unconfigured engine is skipped, never run half-built.
 */
export interface AiVisibilityEngineAdapter {
  readonly engine: AiVisibilityEngine;
  isConfigured(): boolean;
  query(prompt: EnginePrompt): Promise<EngineRawResult>;
}

/** Deterministic detection over a raw result. */
export interface AppearanceDetection {
  mentioned: boolean;
  cited: boolean;
  /** Which source matched the practice domain, if any. */
  citedSource: string | null;
  /** Raw ordinal (1-based line where the name first appears). NEVER a rank. */
  position: number | null;
}
