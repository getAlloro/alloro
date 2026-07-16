import {
  AiVisibilityEngine,
  AiVisibilityEngineAdapter,
  EngineCitation,
  EnginePrompt,
  EngineRawResult,
} from "../types";

/**
 * Google AI Overview via SerpApi — ⚠️ WRITTEN, NOT LIVE-VERIFIED.
 * No key was available at build time, so this HTTP path has not run against the
 * live API. It ACTIVATES only when SERPAPI_API_KEY is present (the runner skips
 * it otherwise) and NEEDS A LIVE SMOKE-TEST on first key. It captures the
 * rendered Google AI Overview block → capture_method 'serp_scrape'. (SerpApi
 * scrapes Google under SerpApi's own ToS — a procurement/ToS call for Corey.)
 */
const SERPAPI_URL = "https://serpapi.com/search";

interface SerpApiResponse {
  ai_overview?: {
    text_blocks?: Array<{ snippet?: string }>;
    /** Live shape carries more fields (source, snippet, index); we read these two. */
    references?: Array<{ link?: string; title?: string }>;
  };
}

export class SerpApiAiOverviewAdapter implements AiVisibilityEngineAdapter {
  readonly engine: AiVisibilityEngine = "google_ai_overview";

  isConfigured(): boolean {
    return Boolean(process.env.SERPAPI_API_KEY);
  }

  async query(prompt: EnginePrompt): Promise<EngineRawResult> {
    const apiKey = process.env.SERPAPI_API_KEY;
    if (!apiKey) {
      throw new Error("[AI-VISIBILITY] SERPAPI_API_KEY is not set.");
    }
    const url = new URL(SERPAPI_URL);
    url.searchParams.set("engine", "google_ai_overview");
    url.searchParams.set("q", prompt.text);
    url.searchParams.set("api_key", apiKey);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`[AI-VISIBILITY] SerpApi request failed: ${res.status}`);
    }
    const data = (await res.json()) as SerpApiResponse;
    const answerText = (data.ai_overview?.text_blocks ?? [])
      .map((b) => b.snippet ?? "")
      .filter((s) => s.length > 0)
      .join("\n");
    // Keep BOTH fields: `link` is the real URL and the only thing that can prove
    // a citation by hostname. A reference's title is the page's HEADLINE prose
    // ("Directory profile for smiledental.com") — it names whatever the page
    // talks about, not the host that was cited, so it is NOT canonical and is
    // kept as metadata only.
    const citations: EngineCitation[] = (data.ai_overview?.references ?? [])
      .map((r) => ({
        url: r.link ?? null,
        title: r.title ?? null,
        titleIsCanonicalHost: false,
      }))
      .filter((c) => c.url !== null || c.title !== null);
    return { answerText, citations, captureMethod: "serp_scrape" };
  }
}
