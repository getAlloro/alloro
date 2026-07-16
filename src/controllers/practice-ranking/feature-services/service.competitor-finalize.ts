/**
 * Competitor finalize + reselect (onboarding)
 *
 * Extracted verbatim from service.location-competitor-onboarding.ts. The
 * post-curation, ranking-triggering paths:
 *   - finalizeAndTriggerRun           — single-click: lock list, create the
 *                                       curated practice_rankings row, kick the
 *                                       pipeline async; in-flight dedup
 *   - reselectCompetitorsAndTriggerRun — rerank-only: replace the set, bump
 *                                        competitor_set_revision, exclude from
 *                                        monthly Summary recommendations
 *
 * Transaction boundaries (db.transaction openers) preserved verbatim and trx is
 * threaded into the model calls. The async pipeline kickoff stays in
 * triggerRankingRun (setImmediate). DB stays in models; Pino logger via util.
 */

import { v4 as uuidv4 } from "uuid";
import type { Knex } from "knex";
import { db } from "../../../database/connection";
import { LocationModel } from "../../../models/LocationModel";
import {
  AddCompetitorInput,
  LocationCompetitorModel,
} from "../../../models/LocationCompetitorModel";
import { PracticeRankingModel } from "../../../models/PracticeRankingModel";
import { processLocationRanking } from "./service.ranking-pipeline";
import { log, logError } from "../feature-utils/util.ranking-logger";
import { MAX_COMPETITORS_PER_LOCATION } from "../feature-utils/util.competitor-validator";
import {
  CompetitorSnapshot,
  buildInputFromExistingCompetitor,
  buildInputFromRawPlaceDetails,
  buildSnapshot,
  resolveDiscoveryRadiusMeters,
} from "../feature-utils/util.competitor-onboarding-builders";
import {
  LoadedLocationContext,
  loadLocationContext,
} from "./service.location-context";
import { resolveSpecialtyAndMarket } from "./service.competitor-identity";
import { fetchPlaceDetailsForCompetitor } from "./service.competitor-discovery-helpers";

// In-flight ranking dedup window for finalize-and-run.
// If user double-clicks within this window, we return the existing batchId.
const FINALIZE_DEDUPE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export interface FinalizeAndRunResult {
  batchId: string;
  rankingId: number;
  reused: boolean;
  competitorSetRevision: number;
  selectedCount: number;
}

export interface ReselectCompetitorsAndRunResult extends FinalizeAndRunResult {}

async function buildInputFromPlaceDetails(
  placeId: string,
  userId: number | null,
  discoveryRadiusMeters: number
): Promise<AddCompetitorInput> {
  const placeDetails = await fetchPlaceDetailsForCompetitor(placeId);
  return buildInputFromRawPlaceDetails(
    placeId,
    placeDetails,
    userId,
    discoveryRadiusMeters
  );
}

async function createRankingRunRow(
  trx: Knex.Transaction,
  ctx: LoadedLocationContext,
  locationId: number,
  specialty: string | null,
  marketLocation: string | null,
  batchId: string,
  now: Date,
  runReason: "first_competitor_finalize" | "competitor_reselection",
  includeInSummaryRecommendations: boolean,
  competitorSetRevision: number,
  competitorSnapshot: CompetitorSnapshot,
  competitorDiscoveryRadiusMeters: number
): Promise<number> {
  return PracticeRankingModel.insertReturningId(
    {
      organization_id: ctx.organizationId,
      location_id: locationId,
      specialty,
      location: marketLocation,
      gbp_account_id: ctx.selectedGbp.account_id,
      gbp_location_id: ctx.selectedGbp.external_id,
      gbp_location_name: ctx.selectedGbp.display_name,
      batch_id: batchId,
      observed_at: now,
      status: "pending",
      competitor_source: "curated",
      competitor_set_revision: competitorSetRevision,
      competitor_snapshot: JSON.stringify(competitorSnapshot),
      competitor_discovery_radius_meters: competitorDiscoveryRadiusMeters,
      run_reason: runReason,
      include_in_summary_recommendations: includeInSummaryRecommendations,
      status_detail: JSON.stringify({
        currentStep: "queued",
        message:
          runReason === "competitor_reselection"
            ? "Waiting for competitor rerank..."
            : "Waiting for first run...",
        progress: 0,
        stepsCompleted: [],
        timestamps: { created_at: now.toISOString() },
      }),
      created_at: now,
      updated_at: now,
    },
    trx
  );
}

function triggerRankingRun(
  ctx: LoadedLocationContext,
  rankingId: number,
  specialty: string | null,
  marketLocation: string | null,
  batchId: string
): void {
  setImmediate(() => {
    processLocationRanking(
      rankingId,
      ctx.selectedGbp.google_connection_id,
      ctx.selectedGbp.account_id || "",
      ctx.selectedGbp.external_id,
      ctx.selectedGbp.display_name || ctx.locationName,
      specialty || "",
      marketLocation || "",
      ctx.organizationDomain,
      batchId,
      log
    ).catch((err: any) => {
      logError(
        `[ONBOARDING] [${ctx.locationId}] processLocationRanking failed for ranking ${rankingId}`,
        err
      );
    });
  });
}

/**
 * Single-click finalize: locks the curated list, creates a practice_rankings
 * row tagged competitor_source='curated', and kicks off the ranking pipeline
 * asynchronously. Idempotent on rapid double-click via the in-flight check.
 */
export async function finalizeAndTriggerRun(
  locationId: number
): Promise<FinalizeAndRunResult> {
  const ctx = await loadLocationContext(locationId);

  // Idempotency: if there's an in-flight ranking for this location created
  // within the dedupe window, return its batchId/rankingId.
  const cutoff = new Date(Date.now() - FINALIZE_DEDUPE_WINDOW_MS);
  const inFlight = await PracticeRankingModel.findRecentInFlightByLocation(
    ctx.organizationId,
    locationId,
    cutoff
  );
  if (inFlight) {
    const activeCount =
      await LocationCompetitorModel.countActive(locationId);
    const competitorSetRevision =
      await LocationCompetitorModel.getCompetitorSetRevision(locationId);
    log(
      `[ONBOARDING] [${locationId}] finalize-and-run reused in-flight rankingId=${inFlight.id} batchId=${inFlight.batch_id}`
    );
    return {
      batchId: inFlight.batch_id || "",
      rankingId: inFlight.id,
      reused: true,
      competitorSetRevision,
      selectedCount: activeCount,
    };
  }

  // Resolve specialty/market for the new ranking row (reused from history if available)
  let specialty: string | null = null;
  let marketLocation: string | null = null;
  try {
    const meta = await resolveSpecialtyAndMarket(ctx);
    specialty = meta.specialty;
    marketLocation = meta.marketLocation;
  } catch (err: any) {
    log(
      `[ONBOARDING] [${locationId}] specialty/market resolution failed: ${err.message} — pipeline will re-identify`
    );
  }

  const batchId = uuidv4();
  const now = new Date();

  // Flip onboarding to finalized + create ranking row in a single transaction
  const { rankingId, competitorSetRevision, selectedCount } =
    await db.transaction(async (trx) => {
    await LocationCompetitorModel.setOnboardingStatus(
      locationId,
      "finalized",
      trx
    );

    const revision =
      await LocationCompetitorModel.getCompetitorSetRevision(locationId, trx);
    const competitors =
      await LocationCompetitorModel.findActiveByLocationId(locationId, trx);
    const snapshot = buildSnapshot(competitors, revision);
    const id = await createRankingRunRow(
      trx,
      ctx,
      locationId,
      specialty,
      marketLocation,
      batchId,
      now,
      "first_competitor_finalize",
      true,
      revision,
      snapshot,
      ctx.competitorDiscoveryRadiusMeters
    );
    return {
      rankingId: id,
      competitorSetRevision: revision,
      selectedCount: competitors.length,
    };
  });

  triggerRankingRun(ctx, rankingId, specialty, marketLocation, batchId);

  log(
    `[ONBOARDING] [${locationId}] Finalized and triggered run: rankingId=${rankingId} batchId=${batchId}`
  );

  return {
    batchId,
    rankingId,
    reused: false,
    competitorSetRevision,
    selectedCount,
  };
}

/**
 * Replace a finalized location's comparison set and run a ranking snapshot.
 *
 * This is intentionally a rerank-only path:
 * - location remains finalized
 * - competitor_set_revision increments
 * - the new practice_rankings row is excluded from monthly Summary recommendations
 */
export async function reselectCompetitorsAndTriggerRun(
  locationId: number,
  placeIds: string[],
  userId: number | null,
  radiusMetersInput?: number
): Promise<ReselectCompetitorsAndRunResult> {
  const uniquePlaceIds = Array.from(
    new Set(placeIds.map((id) => id.trim()).filter(Boolean))
  );

  if (uniquePlaceIds.length === 0) {
    throw Object.assign(
      new Error("Select at least one competitor before rerunning ranking."),
      { code: "EMPTY_COMPETITOR_SET" }
    );
  }

  if (uniquePlaceIds.length > MAX_COMPETITORS_PER_LOCATION) {
    throw Object.assign(
      new Error(
        `Competitor cap reached (${MAX_COMPETITORS_PER_LOCATION}). Remove one before rerunning.`
      ),
      { code: "COMPETITOR_CAP_REACHED" }
    );
  }

  const onboarding =
    await LocationCompetitorModel.getOnboardingStatus(locationId);
  if (onboarding.status !== "finalized") {
    throw Object.assign(
      new Error(
        `Location ${locationId} must be finalized before competitors can be reselected.`
      ),
      { code: "LOCATION_NOT_FINALIZED" }
    );
  }

  const ctx = await loadLocationContext(locationId);
  const radiusMeters = resolveDiscoveryRadiusMeters(
    radiusMetersInput,
    ctx.competitorDiscoveryRadiusMeters
  );
  const cutoff = new Date(Date.now() - FINALIZE_DEDUPE_WINDOW_MS);
  const inFlight = await PracticeRankingModel.findRecentInFlightByLocation(
    ctx.organizationId,
    locationId,
    cutoff
  );
  if (inFlight) {
    const competitorSetRevision =
      await LocationCompetitorModel.getCompetitorSetRevision(locationId);
    const selectedCount =
      await LocationCompetitorModel.countActive(locationId);
    log(
      `[ONBOARDING] [${locationId}] competitor reselect reused in-flight rankingId=${inFlight.id} batchId=${inFlight.batch_id}`
    );
    return {
      batchId: inFlight.batch_id || "",
      rankingId: inFlight.id,
      reused: true,
      competitorSetRevision,
      selectedCount,
    };
  }

  const inputs: AddCompetitorInput[] = [];
  for (const placeId of uniquePlaceIds) {
    const existing = await LocationCompetitorModel.findAnyByLocationAndPlace(
      locationId,
      placeId
    );
    inputs.push(
      existing
        ? buildInputFromExistingCompetitor(existing, userId)
        : await buildInputFromPlaceDetails(placeId, userId, radiusMeters)
    );
  }

  let specialty: string | null = null;
  let marketLocation: string | null = null;
  try {
    const meta = await resolveSpecialtyAndMarket(ctx);
    specialty = meta.specialty;
    marketLocation = meta.marketLocation;
  } catch (err: any) {
    log(
      `[ONBOARDING] [${locationId}] specialty/market resolution failed for competitor reselection: ${err.message} — pipeline will re-identify`
    );
  }

  const batchId = uuidv4();
  const now = new Date();

  const { rankingId, competitorSetRevision, selectedCount } =
    await db.transaction(async (trx) => {
      await LocationCompetitorModel.removeCompetitorsNotInPlaceIds(
        locationId,
        uniquePlaceIds,
        trx
      );

      for (const input of inputs) {
        await LocationCompetitorModel.addCompetitor(
          locationId,
          {
            ...input,
            discoveryRadiusMeters: radiusMeters,
          },
          trx
        );
      }
      await LocationModel.setCompetitorDiscoveryRadius(
        locationId,
        radiusMeters,
        trx
      );

      const revision =
        await LocationCompetitorModel.incrementCompetitorSetRevision(
          locationId,
          trx
        );
      const competitors =
        await LocationCompetitorModel.findActiveByLocationId(locationId, trx);
      const snapshot = buildSnapshot(competitors, revision);
      const id = await createRankingRunRow(
        trx,
        ctx,
        locationId,
        specialty,
        marketLocation,
        batchId,
        now,
        "competitor_reselection",
        false,
        revision,
        snapshot,
        radiusMeters
      );

      return {
        rankingId: id,
        competitorSetRevision: revision,
        selectedCount: competitors.length,
      };
    });

  triggerRankingRun(ctx, rankingId, specialty, marketLocation, batchId);

  log(
    `[ONBOARDING] [${locationId}] Competitors reselected and rerank triggered: rankingId=${rankingId} batchId=${batchId} revision=${competitorSetRevision}`
  );

  return {
    batchId,
    rankingId,
    reused: false,
    competitorSetRevision,
    selectedCount,
  };
}
