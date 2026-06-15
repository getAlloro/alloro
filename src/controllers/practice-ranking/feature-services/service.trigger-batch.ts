/**
 * Trigger Batch Service
 *
 * Helpers for POST /trigger: pre-creates the "pending" ranking records for a
 * multi-location batch, and builds the single-element legacy-location array for
 * the backward-compatible specialty/location format.
 *
 * Extracted from PracticeRankingController.triggerBatchAnalysis. The controller
 * keeps request validation, the account/archived guards, batch-id generation,
 * the setImmediate(processBatch) dispatch, and response formatting.
 */

import { PracticeRankingModel } from "../../../models/PracticeRankingModel";
import { resolveLocationId } from "../../../utils/locationResolver";
import { log, logError } from "../feature-utils/util.ranking-logger";
import { processBatch } from "./service.ranking-computation";
import type { LocationInput } from "./service.ranking-computation";

/**
 * Insert one "pending" ranking record per location for a new batch and return
 * the created ids (in input order). Specialty/location are auto-determined later
 * during processing via the Identifier Agent.
 *
 * @param batchId - generated batch UUID
 * @param organizationId - actual organization id (may be null)
 * @param locations - validated location inputs from the request body
 */
export async function createPendingRankingRecords(
  batchId: string,
  organizationId: number | null,
  locations: any[],
): Promise<number[]> {
  const rankingIds: number[] = [];
  for (let i = 0; i < locations.length; i++) {
    const locationInput = locations[i];
    const locationId = await resolveLocationId(
      organizationId,
      locationInput.gbpLocationId,
    );
    const insertedId = await PracticeRankingModel.insertReturningId({
      organization_id: organizationId,
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
    });
    rankingIds.push(insertedId);
  }

  log(`[Batch ${batchId}] Created ${rankingIds.length} ranking records upfront`);

  return rankingIds;
}

/**
 * Schedule background batch processing on the next tick, mirroring the
 * controller's original `setImmediate(() => processBatch(...).catch(logError))`
 * dispatch for both the multi-location and legacy paths.
 */
export function dispatchBatchProcessing(
  batchId: string,
  googleAccountId: number,
  locations: LocationInput[],
  domain: string,
  rankingIds: number[],
  recordsPreCreated: boolean,
  organizationId?: number | null,
): void {
  setImmediate(() => {
    processBatch(
      batchId,
      googleAccountId,
      locations,
      domain,
      rankingIds,
      recordsPreCreated,
      organizationId,
    ).catch((err) => {
      logError(`Background batch process ${batchId}`, err);
    });
  });
}

/**
 * Build the single-element location array for the legacy single-location
 * specialty/location trigger format, using the account's first GBP location.
 */
export function buildLegacyLocations(
  firstGbp: { accountId: string; locationId: string; displayName: string },
  specialty: string,
  location: string,
): LocationInput[] {
  return [
    {
      gbpAccountId: firstGbp.accountId,
      gbpLocationId: firstGbp.locationId,
      gbpLocationName: firstGbp.displayName,
      specialty: specialty,
      marketLocation: location,
    },
  ];
}
