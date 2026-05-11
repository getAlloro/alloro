/**
 * Ranking Computation Service
 *
 * Core batch processing logic for practice ranking analysis.
 * Consolidates the original processBatchAnalysis and
 * processBatchAnalysisWithExistingRecords into a single function
 * with a flag to distinguish "create records" vs "use existing records" modes.
 *
 * The two original functions were 95% identical (822 LOC total).
 * This consolidated version eliminates that duplication.
 */

import { db } from "../../../database/connection";
import {
  processLocationRanking,
  MAX_RETRIES,
  RETRY_DELAY_MS,
  LocationParams,
} from "./service.ranking-pipeline";
import { notifyAdminsRankingComplete } from "../../../utils/core/notificationHelper";
import { resolveLocationId } from "../../../utils/locationResolver";
import * as batchTracker from "./service.batch-status-tracker";
import * as specialtyIdentifier from "./service.specialty-identifier";
import { log, logDebug, logWarn, logError } from "../feature-utils/util.ranking-logger";

export interface LocationInput {
  gbpAccountId: string;
  gbpLocationId: string;
  gbpLocationName: string;
  specialty?: string;
  marketLocation?: string;
  locationParams?: LocationParams;
}

/**
 * Process a batch of location analyses with retry logic.
 * All-or-nothing: if any location fails after max retries, entire batch fails.
 *
 * This is the unified processor that handles both:
 * - New batches where records are pre-created (recordsPreCreated = true)
 * - Legacy batches that create records inline (recordsPreCreated = false)
 *
 * @param batchId - UUID of the batch
 * @param googleAccountId - Google account ID
 * @param locations - Array of location inputs to process
 * @param domain - Domain name for the account
 * @param rankingIds - Pre-created ranking record IDs (required when recordsPreCreated=true)
 * @param recordsPreCreated - Whether ranking records were already created by the trigger
 * @param organizationId - The actual organization ID (not the google_connections row ID)
 */
export async function processBatch(
  batchId: string,
  googleAccountId: number,
  locations: LocationInput[],
  domain: string,
  rankingIds: number[],
  recordsPreCreated: boolean = true,
  organizationId?: number | null,
): Promise<void> {
  const headerLabel = recordsPreCreated
    ? "BATCH ANALYSIS STARTED (WITH PRE-CREATED RECORDS)"
    : "BATCH ANALYSIS STARTED";

  log(`╔════════════════════════════════════════════════════════════════════╗`);
  log(`║ ${headerLabel.padEnd(67)}║`);
  log(`╠════════════════════════════════════════════════════════════════════╣`);
  log(`║ Batch ID: ${batchId}`);
  log(`║ Account ID: ${googleAccountId}`);
  log(`║ Domain: ${domain}`);
  log(`║ Total Locations: ${locations.length}`);
  if (recordsPreCreated) {
    log(`║ Pre-created Ranking IDs: ${rankingIds.join(", ")}`);
  }
  log(`╚════════════════════════════════════════════════════════════════════╝`);

  locations.forEach((loc, idx) => {
    logDebug(
      `  Location ${idx + 1}: ${loc.gbpLocationName} (${loc.gbpLocationId})`,
    );
    logDebug(`    - Specialty: ${loc.specialty || "(auto-detect)"}`);
    logDebug(`    - Market: ${loc.marketLocation || "(auto-detect)"}`);
  });

  // If records were not pre-created, create them now
  if (!recordsPreCreated) {
    rankingIds = [];
    for (let i = 0; i < locations.length; i++) {
      const locationInput = locations[i];
      const locationId = await resolveLocationId(organizationId, locationInput.gbpLocationId);
      const [result] = await db("practice_rankings")
        .insert({
          organization_id: organizationId ?? null,
          location_id: locationId,
          specialty: locationInput.specialty || null,
          location: locationInput.marketLocation || null,
          gbp_account_id: locationInput.gbpAccountId,
          gbp_location_id: locationInput.gbpLocationId,
          gbp_location_name: locationInput.gbpLocationName,
          batch_id: batchId,
          observed_at: new Date(),
          status: "pending",
          run_reason: "manual",
          include_in_summary_recommendations: true,
          status_detail: JSON.stringify({
            currentStep: "queued",
            message: "Waiting in queue...",
            progress: 0,
            stepsCompleted: [],
            timestamps: { created_at: new Date().toISOString() },
          }),
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("id");
      rankingIds.push(result.id);
    }

    log(
      `[Batch ${batchId}] Created ${rankingIds.length} ranking records upfront`,
    );
  }

  // Initialize batch status tracker
  const batchStatus = batchTracker.initialize(
    batchId,
    googleAccountId,
    locations.length,
    locations[0]?.gbpLocationName || "",
    rankingIds,
  );

  log(
    `[Batch ${batchId}] Starting batch analysis for ${locations.length} locations`,
  );

  // Temporary storage for results
  const successfulResults: Array<{
    rankingId: number;
    results: any;
  }> = [];

  try {
    // Process each location sequentially
    for (let i = 0; i < locations.length; i++) {
      const locationInput = locations[i];
      const rankingId = rankingIds[i];

      batchTracker.updateCurrentLocation(
        batchId,
        i,
        locationInput.gbpLocationName,
      );

      log(
        `[Batch ${batchId}] Processing location ${i + 1}/${locations.length}: ${
          locationInput.gbpLocationName
        }`,
      );

      // Update this location's status to "processing"
      await db("practice_rankings")
        .where({ id: rankingId })
        .update({
          status: "processing",
          status_detail: JSON.stringify({
            currentStep: "starting",
            message: "Starting analysis...",
            progress: 5,
            stepsCompleted: ["queued"],
            timestamps: { started_at: new Date().toISOString() },
          }),
          updated_at: new Date(),
        });

      // Auto-detect specialty and location if not provided
      const identified = await specialtyIdentifier.identifyAndUpdate(
        rankingId,
        googleAccountId,
        locationInput,
        domain,
        batchId,
      );

      // Update locationInput with resolved params for processLocationRanking
      if (identified.locationParams) {
        locationInput.locationParams = identified.locationParams;
      }

      // Retry logic for each location
      let lastError: Error | null = null;
      let success = false;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          log(
            `┌─────────────────────────────────────────────────────────────────┐`,
          );
          log(
            `│ LOCATION ${i + 1}/${locations.length}: ${
              locationInput.gbpLocationName
            }`,
          );
          log(`│ Attempt: ${attempt}/${MAX_RETRIES}`);
          log(`│ Specialty: ${identified.specialty} | Market: ${identified.marketLocation}`);
          log(
            `└─────────────────────────────────────────────────────────────────┘`,
          );

          const results = await processLocationRanking(
            rankingId,
            googleAccountId,
            locationInput.gbpAccountId,
            locationInput.gbpLocationId,
            locationInput.gbpLocationName,
            identified.specialty,
            identified.marketLocation,
            domain,
            batchId,
            log,
            undefined, // keywords - use default from ranking service
            locationInput.locationParams, // location params from Identifier Agent
          );

          successfulResults.push({ rankingId, results });
          success = true;
          batchTracker.incrementCompleted(batchId);
          break;
        } catch (error: any) {
          lastError = error;
          batchTracker.addError(
            batchId,
            locationInput.gbpLocationId,
            error.message || String(error),
            attempt,
          );

          log(
            `[Batch ${batchId}] Location ${locationInput.gbpLocationName} attempt ${attempt} failed: ${error.message}`,
          );

          if (attempt < MAX_RETRIES) {
            log(`[Batch ${batchId}] Retrying in ${RETRY_DELAY_MS / 1000}s...`);
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          }
        }
      }

      if (!success) {
        // Location failed after all retries - fail entire batch
        batchTracker.markFailed(batchId);

        // Mark all rankings in batch as failed
        await db("practice_rankings")
          .where({ batch_id: batchId })
          .update({
            status: "failed",
            error_message: `Batch failed: Location ${locationInput.gbpLocationName} failed after ${MAX_RETRIES} attempts. Error: ${lastError?.message}`,
            updated_at: new Date(),
          });

        log(
          `[Batch ${batchId}] FAILED - Location ${locationInput.gbpLocationName} exhausted all retries`,
        );
        return;
      }
    }

    // All locations succeeded - batch complete
    batchTracker.markCompleted(batchId);

    const completedStatus = batchTracker.getStatus(batchId);
    log(
      `╔════════════════════════════════════════════════════════════════════╗`,
    );
    log(
      `║ BATCH ANALYSIS COMPLETED SUCCESSFULLY                             ║`,
    );
    log(
      `╠════════════════════════════════════════════════════════════════════╣`,
    );
    log(`║ Batch ID: ${batchId}`);
    log(`║ Total Locations: ${locations.length}`);
    if (completedStatus?.completedAt && completedStatus?.startedAt) {
      log(
        `║ Duration: ${(
          (completedStatus.completedAt.getTime() - completedStatus.startedAt.getTime()) /
          1000
        ).toFixed(1)}s`,
      );
    }
    log(
      `╚════════════════════════════════════════════════════════════════════╝`,
    );

    // TODO: REVERT - User email temporarily disabled
    // Create notification for the client (also sends user email)
    const locationCount = locations.length;
    const locationText =
      locationCount === 1
        ? locations[0].gbpLocationName
        : `${locationCount} locations`;

    // Get average score from successful results
    const avgScore =
      successfulResults.length > 0
        ? Math.round(
            (successfulResults.reduce(
              (sum, r) => sum + (r.results?.rankScore || 0),
              0,
            ) /
              successfulResults.length) *
              10,
          ) / 10
        : null;

    const scoreText = avgScore ? ` Average score: ${avgScore.toFixed(1)}` : "";

    // TODO: REVERT - Uncomment to re-enable user email notification
    // try {
    //   await createNotification(
    //     domain,
    //     "Practice Ranking Analysis Complete",
    //     `Your ranking analysis for ${locationText} has been completed.${scoreText}`,
    //     "ranking",
    //     {
    //       batchId,
    //       locationCount,
    //       avgScore,
    //       rankingIds: completedStatus?.rankingIds || rankingIds,
    //     }
    //   );

    //   log(`[Batch ${batchId}] Notification created for ${domain}`);
    // } catch (notifyError: any) {
    //   logWarn(
    //     `Failed to create notification for batch ${batchId}: ${notifyError.message}`
    //   );
    // }

    // Send admin email notification about ranking completion
    try {
      await notifyAdminsRankingComplete(
        domain,
        batchId,
        locationCount,
        avgScore,
      );
      log(`[Batch ${batchId}] Admin email sent for ranking completion`);
    } catch (adminEmailError: any) {
      logWarn(
        `Failed to send admin email for batch ${batchId}: ${adminEmailError.message}`,
      );
    }
  } catch (error: any) {
    const errorLabel = recordsPreCreated
      ? "processBatchAnalysisWithExistingRecords"
      : "processBatchAnalysis";
    logError(`${errorLabel} ${batchId}`, error);

    batchTracker.markFailed(batchId);

    // Mark all rankings in batch as failed
    await db("practice_rankings")
      .where({ batch_id: batchId })
      .update({
        status: "failed",
        error_message: `Batch failed: ${error.message}`,
        updated_at: new Date(),
      });
  }
}
