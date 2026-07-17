import { GoogleGenAI } from "@google/genai";
import { getOsKnowledgeBaseConfig } from "../../../config/osKnowledgeBase";
import {
  AiVisibilityEngine,
  AiVisibilityEngineAdapter,
  EngineCitation,
  EnginePrompt,
  EngineRawResult,
} from "../types";

/**
 * Gemini adapter — LIVE, grounded. Uses the `googleSearch` tool (@google/genai
 * 1.43) so the model answers from live Google Search, and reads citation source
 * TITLES from groundingMetadata (the URIs are Google redirect links, so
 * source-title capture is deliberately partial). capture_method = api_grounded:
 * grounded against live search, but an API reading — a proxy, not the exact AI
 * Overview a user sees. Isolated behind this file (the os-llm seam pattern).
 */
const GEMINI_MAX_OUTPUT_TOKENS = 1024;

interface GroundingShape {
  candidates?: Array<{
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { title?: string; uri?: string } }>;
    };
  }>;
}

export class GeminiVisibilityAdapter implements AiVisibilityEngineAdapter {
  readonly engine: AiVisibilityEngine = "gemini";
  private client: GoogleGenAI | null = null;

  isConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  private getClient(): GoogleGenAI {
    if (!this.client) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("[AI-VISIBILITY] GEMINI_API_KEY is not set.");
      }
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }

  async query(prompt: EnginePrompt): Promise<EngineRawResult> {
    const config = getOsKnowledgeBaseConfig();
    const response = await this.getClient().models.generateContent({
      model: config.chatModel,
      contents: prompt.text,
      config: {
        tools: [{ googleSearch: {} }],
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
      },
    });
    const answerText = response.text ?? "";
    const gm = (response as GroundingShape).candidates?.[0]?.groundingMetadata;
    // The `uri` is a Google redirect link that hides the real host, so Gemini
    // names each grounding chunk by its BARE DOMAIN in `title`. Only this
    // adapter knows that contract, so only it may declare the title canonical
    // (`titleIsCanonicalHost`) — every other engine's title is prose and can
    // never prove a citation. The detector still independently requires the
    // title to BE a bare host, so a prose title fabricates nothing even here.
    const citations: EngineCitation[] = (gm?.groundingChunks ?? [])
      .map((c) => ({
        url: c.web?.uri ?? null,
        title: c.web?.title ?? null,
        titleIsCanonicalHost: true,
      }))
      .filter((c) => c.url !== null || c.title !== null);
    return { answerText, citations, captureMethod: "api_grounded" };
  }
}

/** Deterministic fake (no network) for tests — mirrors the os-llm fake pattern. */
export class FakeVisibilityAdapter implements AiVisibilityEngineAdapter {
  constructor(
    readonly engine: AiVisibilityEngine,
    private readonly result: EngineRawResult,
    private readonly configured = true
  ) {}
  isConfigured(): boolean {
    return this.configured;
  }
  async query(_prompt: EnginePrompt): Promise<EngineRawResult> {
    return this.result;
  }
}
