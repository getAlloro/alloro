/**
 * Latest Rankings Service
 *
 * Orchestrates GET /latest: resolves the most-recent completed batch for an
 * org (optionally a location), backfills competitor addresses, attaches v2
 * onboarding metadata and previous-analysis trend comparisons, and shapes the
 * dashboard payload.
 *
 * Extracted from PracticeRankingController.getLatestRankings. Returns a
 * discriminated result so the controller keeps ownership of status codes and
 * response envelopes (behavior-preserving).
 */

import { PracticeRankingModel } from "../../../models/PracticeRankingModel";
import { LocationModel } from "../../../models/LocationModel";
import { LocationCompetitorModel } from "../../../models/LocationCompetitorModel";
import { log } from "../feature-utils/util.ranking-logger";
import {
  formatLatestRanking,
  formatLegacyLatestRanking,
} from "../feature-utils/util.ranking-formatter";
import {
  addCompetitorAddressesToSnapshot,
  type CompetitorAddressLookup,
} from "../feature-utils/util.competitor-address";

export type LatestRankingsResult =
  // No batch and no legacy row for this account.
  | { kind: "not-found-account" }
  // A batch was found but it had no completed rankings after filtering.
  | { kind: "not-found-batch" }
  | { kind: "legacy"; ranking: ReturnType<typeof formatLegacyLatestRanking> }
  | {
      kind: "batch";
      batchId: string;
      rankings: ReturnType<typeof formatLatestRanking>[];
    };

/**
 * Build the latest-rankings payload for an org (optional location scope).
 *
 * @param organizationId - parsed googleAccountId (organization_id filter)
 * @param locationId - optional parsed location_id filter
 */
export async function getLatestRankingsForAccount(
  organizationId: number,
  locationId: number | null,
): Promise<LatestRankingsResult> {
  // Build base filters for location scoping
  const baseFilters: Record<string, unknown> = {
    organization_id: organizationId,
    status: "completed",
  };
  if (locationId !== null) {
    baseFilters.location_id = locationId;
  }

  // Step 1: Find the most recent batch_id with completed rankings for this account
  const latestBatchRecord =
    await PracticeRankingModel.findLatestBatchIdRow(baseFilters);

  if (!latestBatchRecord || !latestBatchRecord.batch_id) {
    // Fall back to legacy: get latest ranking without batch_id (old format)
    const legacyRanking =
      await PracticeRankingModel.findLegacyLatestByFilters(baseFilters);

    if (!legacyRanking) {
      return { kind: "not-found-account" };
    }

    // Return legacy single ranking in array format for consistency
    return { kind: "legacy", ranking: formatLegacyLatestRanking(legacyRanking) };
  }

  const latestBatchId = latestBatchRecord.batch_id;
  log(
    `[GET /latest] Found latest batch: ${latestBatchId} for account ${organizationId}${locationId !== null ? ` location ${locationId}` : ""}`,
  );

  // Step 2: Get completed rankings from the latest batch (optionally filtered by location)
  const batchRankings = await PracticeRankingModel.findByFiltersAndBatch(
    baseFilters,
    latestBatchId,
  );

  if (batchRankings.length === 0) {
    return { kind: "not-found-batch" };
  }

  log(
    `[GET /latest] Found ${batchRankings.length} rankings in batch ${latestBatchId}`,
  );

  // Step 3a: Batch-fetch v2 onboarding metadata for the distinct location_ids
  // in this batch. Used by the dashboard to render the "set up your competitor
  // list" banner for pending/curating locations.
  // Spec: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
  const distinctLocationIds = Array.from(
    new Set(
      batchRankings
        .map((r) => r.location_id)
        .filter((id): id is number => typeof id === "number"),
    ),
  );
  const onboardingByLocationId = new Map<
    number,
    { status: "pending" | "curating" | "finalized"; finalizedAt: Date | null }
  >();
  if (distinctLocationIds.length > 0) {
    const locationRows =
      await LocationModel.findOnboardingStatusByIds(distinctLocationIds);
    for (const row of locationRows) {
      onboardingByLocationId.set(row.id, {
        status: row.location_competitor_onboarding_status,
        finalizedAt: row.location_competitor_onboarding_finalized_at ?? null,
      });
    }
  }

  const competitorAddressesByLocationId = new Map<
    number,
    CompetitorAddressLookup
  >();
  await Promise.all(
    distinctLocationIds.map(async (id) => {
      const competitors =
        await LocationCompetitorModel.findActiveByLocationId(id);
      competitorAddressesByLocationId.set(
        id,
        new Map(
          competitors.map((competitor) => [
            competitor.place_id,
            competitor.address,
          ]),
        ),
      );
    }),
  );

  // Step 3b: For each ranking in the batch, get the previous analysis for trend comparison
  const rankingsWithPrevious = await Promise.all(
    batchRankings.map(async (ranking) => {
      // Get the previous completed ranking for this location (excluding current batch)
      const previous =
        await PracticeRankingModel.findPreviousCompletedExcludingBatch(
          organizationId,
          ranking.gbp_location_id,
          latestBatchId,
        );

      const onboarding = ranking.location_id
        ? onboardingByLocationId.get(ranking.location_id) || null
        : null;
      const rankingWithAddresses = addCompetitorAddressesToSnapshot(
        ranking,
        ranking.location_id
          ? competitorAddressesByLocationId.get(ranking.location_id)
          : undefined,
      );

      return formatLatestRanking(rankingWithAddresses, previous || null, onboarding);
    }),
  );

  return {
    kind: "batch",
    batchId: latestBatchId,
    rankings: rankingsWithPrevious,
  };
}
