import {
  AiVisibilityEngine,
  AiVisibilityEngineAdapter,
  EngineCitation,
  EnginePrompt,
  EngineRawResult,
} from "../types";

/**
 * Perplexity Sonar adapter — ⚠️ WRITTEN, NOT LIVE-VERIFIED.
 * No key was available at build time, so this HTTP path has not run against the
 * live API. It ACTIVATES only when PERPLEXITY_API_KEY is present (the runner
 * skips it otherwise) and NEEDS A LIVE SMOKE-TEST on first key before its
 * readings are trusted. Perplexity Sonar returns real link citations; still an
 * API reading → capture_method 'api_proxy'.
 */
const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";

interface PerplexityResponse {
  choices?: Array<{ message?: { content?: string } }>;
  citations?: string[];
}

export class PerplexityVisibilityAdapter implements AiVisibilityEngineAdapter {
  readonly engine: AiVisibilityEngine = "perplexity";

  isConfigured(): boolean {
    return Boolean(process.env.PERPLEXITY_API_KEY);
  }

  async query(prompt: EnginePrompt): Promise<EngineRawResult> {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      throw new Error("[AI-VISIBILITY] PERPLEXITY_API_KEY is not set.");
    }
    const res = await fetch(PERPLEXITY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "user", content: prompt.text }],
      }),
    });
    if (!res.ok) {
      throw new Error(
        `[AI-VISIBILITY] Perplexity request failed: ${res.status}`
      );
    }
    const data = (await res.json()) as PerplexityResponse;
    const answerText = data.choices?.[0]?.message?.content ?? "";
    // Sonar returns bare absolute URLs — the URL IS the citation, no title, so
    // there is no title to declare canonical.
    const citations: EngineCitation[] = (data.citations ?? [])
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .map((url) => ({ url, title: null, titleIsCanonicalHost: false }));
    return { answerText, citations, captureMethod: "api_proxy" };
  }
}
