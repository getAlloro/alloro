/**
 * Ranking Status Service
 *
 * Status-detail persistence for the ranking pipeline. Extracted verbatim from
 * service.ranking-pipeline.ts as a leaf module so both the orchestrator and the
 * LLM stage can update status without a circular dependency on the pipeline.
 *
 * Behavior-preserving: identical step list, progress gating, and DB writes.
 */

import { PracticeRankingModel } from "../../../models/PracticeRankingModel";

export interface StatusDetail {
  currentStep: string;
  message: string;
  progress: number;
  stepsCompleted: string[];
  timestamps: Record<string, string>;
}

/**
 * Update ranking status in database
 */
export async function updateStatus(
  rankingId: number,
  status: string,
  step: string,
  message: string,
  progress: number,
  existingDetail?: StatusDetail,
  logger?: (msg: string) => void,
): Promise<void> {
  const detail: StatusDetail = existingDetail || {
    currentStep: step,
    message: message,
    progress: progress,
    stepsCompleted: [],
    timestamps: { started_at: new Date().toISOString() },
  };

  detail.currentStep = step;
  detail.message = message;
  detail.progress = progress;
  detail.timestamps[`${step}_at`] = new Date().toISOString();

  if (progress > 0 && !detail.stepsCompleted.includes(step)) {
    const steps = [
      "queued",
      "fetching_search_position",
      "fetching_client_gbp",
      "discovering_competitors",
      "scraping_competitors",
      "auditing_website",
      "calculating_scores",
      "awaiting_llm",
      "done",
    ];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      detail.stepsCompleted = steps.slice(0, currentIndex);
    }
  }

  await PracticeRankingModel.updateByIdRaw(rankingId, {
    status: status,
    status_detail: JSON.stringify(detail),
    updated_at: new Date(),
  });

  if (logger) {
    logger(
      `[RANKING] [${rankingId}] Status: ${status} - ${step} (${progress}%): ${message}`,
    );
  }
}

export async function markRankingFailed(
  rankingId: number,
  step: string,
  message: string,
  error: unknown,
  existingDetail?: StatusDetail,
  logger?: (msg: string) => void,
): Promise<void> {
  const detail: StatusDetail = existingDetail || {
    currentStep: step,
    message,
    progress: 0,
    stepsCompleted: [],
    timestamps: { started_at: new Date().toISOString() },
  };
  const errorMessage = error instanceof Error ? error.message : String(error);

  detail.currentStep = step;
  detail.message = message;
  detail.timestamps[`${step}_failed_at`] = new Date().toISOString();

  await PracticeRankingModel.updateByIdRaw(rankingId, {
    status: "failed",
    status_detail: JSON.stringify(detail),
    error_message: errorMessage,
    updated_at: new Date(),
  });

  if (logger) {
    logger(`[RANKING] [${rankingId}] Failed at ${step}: ${errorMessage}`);
  }
}
