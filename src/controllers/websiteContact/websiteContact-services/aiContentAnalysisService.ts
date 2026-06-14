/**
 * AI Content Analysis Service
 *
 * Uses Anthropic Haiku to classify form submissions.
 * Fail-open: if the AI call fails, submissions are not flagged.
 */

import { loadPrompt } from "../../../agents/service.prompt-loader";
import { runAgent } from "../../../agents/service.llm-runner";
import logger from "../../../lib/logger";

const MODEL = process.env.FORM_ANALYSIS_MODEL || "claude-haiku-4-5-20251001";

export interface AnalysisResult {
  flagged: boolean;
  category: string;
  reason: string;
}

export async function analyzeContent(
  formName: string,
  contents: Record<string, string>,
): Promise<AnalysisResult> {
  try {
    const systemPrompt = loadPrompt("websiteAgents/FormClassifier");
    const userMessage = JSON.stringify({ formName, fields: contents });

    const result = await runAgent({
      systemPrompt,
      userMessage,
      model: MODEL,
      maxTokens: 256,
    });

    const parsed = result.parsed;

    if (
      !parsed ||
      typeof parsed.flagged !== "boolean" ||
      typeof parsed.category !== "string" ||
      typeof parsed.reason !== "string"
    ) {
      throw new Error("Invalid AI response shape");
    }

    return {
      flagged: parsed.flagged,
      category: parsed.category,
      reason: parsed.reason,
    };
  } catch (err) {
    // Fail-open: don't block legitimate submissions if AI fails
    logger.error({ err: err }, "[AI Content Analysis] Error:");
    return { flagged: false, category: "unknown", reason: "AI analysis unavailable" };
  }
}
