import { GoogleGenAI } from "@google/genai";
import { getOsKnowledgeBaseConfig } from "../../../config/osKnowledgeBase";
import {
  AiVisibilityEngine,
  AiVisibilityEngineAdapter,
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
    const citationSources = (gm?.groundingChunks ?? [])
      .map((c) => c.web?.title || c.web?.uri || "")
      .filter((s) => s.length > 0);
    return { answerText, citationSources, captureMethod: "api_grounded" };
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
