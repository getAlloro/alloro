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

/**
 * One citation/grounding source, kept STRUCTURED so a link is never flattened
 * away. Detection needs a HOSTNAME to prove a citation, so any shape that
 * collapses a reference to a single string can silently drop the URL and record
 * a real citation as `cited: false`. Either field may be absent, and which one
 * carries the domain is engine-specific: SerpApi returns `{title, link}`;
 * Gemini returns a title plus a Google *redirect* URI (so the title is what
 * carries the real domain); Perplexity returns a bare URL.
 */
export interface EngineCitation {
  /** Absolute URL of the cited page, when the engine provides one. */
  url: string | null;
  /** Human-readable title of the cited page, when the engine provides one. */
  title: string | null;
  /**
   * TRUE only when THIS engine's contract makes the title the canonical
   * destination itself (Gemini names its grounding chunks by bare domain,
   * because its `uri` is a redirect that hides the real host).
   *
   * DEFAULT-DENY: absent/false means the title is unverified prose metadata and
   * can NEVER prove a citation. A third-party page titled "Directory profile for
   * smiledental.com" is not a citation of smiledental.com — treating it as one
   * fabricates evidence. Only the adapter knows its engine's contract, so only
   * the adapter may set this; the detector still independently requires such a
   * title to BE a bare hostname, never merely to contain one.
   */
  titleIsCanonicalHost?: boolean;
}

/** Raw adapter output, BEFORE detection. */
export interface EngineRawResult {
  answerText: string;
  /** Citation/grounding sources. Structured, so the link survives the adapter. */
  citations: EngineCitation[];
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
