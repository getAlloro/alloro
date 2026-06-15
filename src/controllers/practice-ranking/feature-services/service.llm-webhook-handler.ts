/**
 * Ranking LLM Result Persistence
 *
 * Persists LLM analysis output for the practice ranking pipeline. Originally
 * served as an n8n webhook handler; the pipeline now runs Claude inline (see
 * service.ranking-llm.ts) and these helpers are called directly.
 *
 * Task creation moved out: Summary v2 is the sole writer of category="USER"
 * tasks. Ranking output reaches Summary via additional_data.ranking_recommendations
 * on the next monthly run.
 */

import { PracticeRankingModel } from "../../../models/PracticeRankingModel";
import { log } from "../feature-utils/util.ranking-logger";

/**
 * Handle an error response from the LLM webhook.
 * Marks the ranking as completed with error details.
 */
export async function handleErrorResponse(
  practiceRankingId: number,
  errorCode: string | undefined,
  errorMessage: string | undefined,
): Promise<void> {
  await PracticeRankingModel.updateByIdRaw(practiceRankingId, {
    status: "completed",
    status_detail: JSON.stringify({
      currentStep: "done",
      message: `Completed with LLM error: ${errorMessage}`,
      progress: 100,
      stepsCompleted: [
        "queued",
        "fetching_client_gbp",
        "discovering_competitors",
        "scraping_competitors",
        "auditing_website",
        "calculating_scores",
        "awaiting_llm",
      ],
      timestamps: {},
    }),
    error_message: `LLM Error: ${errorCode} - ${errorMessage}`,
    updated_at: new Date(),
  });
}

/**
 * Save the LLM analysis results and mark ranking as completed.
 */
export async function saveLlmAnalysis(
  practiceRankingId: number,
  llmAnalysis: any,
): Promise<void> {
  await PracticeRankingModel.updateByIdRaw(practiceRankingId, {
    llm_analysis: JSON.stringify(llmAnalysis),
    status: "completed",
    status_detail: JSON.stringify({
      currentStep: "done",
      message: "Analysis complete with AI insights",
      progress: 100,
      stepsCompleted: [
        "queued",
        "fetching_client_gbp",
        "discovering_competitors",
        "scraping_competitors",
        "auditing_website",
        "calculating_scores",
        "awaiting_llm",
        "done",
      ],
      timestamps: { completed_at: new Date().toISOString() },
    }),
    updated_at: new Date(),
  });

  log(`[${practiceRankingId}] LLM analysis saved, status: completed`);
}
