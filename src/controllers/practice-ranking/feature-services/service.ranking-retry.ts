/**
 * Ranking Retry Service
 *
 * Background re-run logic for the retry endpoints. Extracted from
 * PracticeRankingController.retryRanking / retryBatch so the controller only
 * validates, guards, resets the DB record(s), and schedules the background run.
 *
 * Behavior-preserving: the same processLocationRanking calls, retry/backoff,
 * status_detail payloads, and failure handling as the original inline blocks.
 */

import { PracticeRankingModel } from "../../../models/PracticeRankingModel";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { GooglePropertyModel } from "../../../models/GooglePropertyModel";
import { log } from "../feature-utils/util.ranking-logger";
import {
  processLocationRanking,
  MAX_RETRIES,
  RETRY_DELAY_MS,
} from "./service.ranking-pipeline";

/**
 * Background work for POST /retry/:id.
 *
 * Mirrors the original setImmediate block: flips the record to "processing",
 * runs a single processLocationRanking pass, and on failure marks the record
 * "failed" with the retry error message.
 *
 * @param rankingId - The ranking record id (already reset to pending by caller)
 * @param ranking - The raw ranking row fetched by the controller
 * @param googleConnectionId - OAuth connection id from the GBP property lookup
 * @param domain - Organization domain (already resolved by caller)
 */
export async function runSingleRetryInBackground(
  rankingId: number,
  ranking: any,
  googleConnectionId: number,
  domain: string,
): Promise<void> {
  const specialty = ranking.specialty || "orthodontist";
  const marketLocation = ranking.location || "Unknown, US";

  await PracticeRankingModel.updateByIdRaw(rankingId, {
    status: "processing",
    status_detail: JSON.stringify({
      currentStep: "starting",
      message: "Starting retry analysis...",
      progress: 5,
      stepsCompleted: ["queued"],
      timestamps: { started_at: new Date().toISOString() },
    }),
  });

  try {
    await processLocationRanking(
      rankingId,
      googleConnectionId,
      ranking.gbp_account_id,
      ranking.gbp_location_id,
      ranking.gbp_location_name,
      specialty,
      marketLocation,
      domain,
      ranking.batch_id,
      log,
    );
    log(`Retry completed for ranking ${rankingId}`);
  } catch (err: any) {
    log(`Retry failed for ranking ${rankingId}: ${err.message}`);
    await PracticeRankingModel.updateByIdRaw(rankingId, {
      status: "failed",
      error_message: `Retry failed: ${err.message}`,
      updated_at: new Date(),
    });
  }
}

/**
 * Background work for POST /retry-batch/:batchId.
 *
 * Mirrors the original setImmediate block: per retryable ranking, re-resolves
 * the GBP property + org domain, flips to "processing", and re-runs with the
 * standard MAX_RETRIES/RETRY_DELAY_MS backoff, marking "failed" on exhaustion.
 *
 * @param batchId - The batch id (for log scoping only)
 * @param retryable - The rankings selected for retry by the controller
 */
export async function runBatchRetryInBackground(
  batchId: string,
  retryable: any[],
): Promise<void> {
  for (const ranking of retryable) {
    const gbpProperty = await GooglePropertyModel.findByExternalId(
      ranking.gbp_location_id,
    );
    if (!gbpProperty) {
      log(`Skipping ranking ${ranking.id}: GBP property not found`);
      await PracticeRankingModel.updateByIdRaw(ranking.id, {
        status: "failed",
        error_message: "GBP property not found for retry",
        updated_at: new Date(),
      });
      continue;
    }

    const org = await OrganizationModel.findDomainById(ranking.organization_id);
    const domain = org?.domain || "";
    const specialty = ranking.specialty || "orthodontist";
    const marketLocation = ranking.location || "Unknown, US";

    await PracticeRankingModel.updateByIdRaw(ranking.id, {
      status: "processing",
      status_detail: JSON.stringify({
        currentStep: "starting",
        message: "Starting retry analysis...",
        progress: 5,
        stepsCompleted: ["queued"],
        timestamps: { started_at: new Date().toISOString() },
      }),
    });

    let success = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 1) {
          log(
            `Retry attempt ${attempt}/${MAX_RETRIES} for ranking ${ranking.id}`,
          );
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }

        await processLocationRanking(
          ranking.id,
          gbpProperty.google_connection_id,
          ranking.gbp_account_id,
          ranking.gbp_location_id,
          ranking.gbp_location_name,
          specialty,
          marketLocation,
          domain,
          ranking.batch_id,
          log,
        );

        success = true;
        break;
      } catch (err: any) {
        log(
          `Batch retry attempt ${attempt} failed for ranking ${ranking.id}: ${err.message}`,
        );
        if (attempt === MAX_RETRIES) {
          await PracticeRankingModel.updateByIdRaw(ranking.id, {
            status: "failed",
            error_message: `Batch retry failed: ${err.message}`,
            updated_at: new Date(),
          });
        }
      }
    }

    if (success) {
      log(`Batch retry completed for ranking ${ranking.id}`);
    }
  }

  log(`Batch retry completed for ${batchId}`);
}
