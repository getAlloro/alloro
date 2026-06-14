/**
 * Competitor curation actions (onboarding)
 *
 * Extracted verbatim from service.location-competitor-onboarding.ts. The
 * pre-finalize, user-curated flow:
 *   - runDiscoveryForLocation              — populate initial_scrape, idempotent
 *   - previewDiscoveryCandidatesForLocation — preview without mutating the set
 *   - previewManualCompetitorForLocation    — resolve a manual Maps profile
 *   - addCustomCompetitor                   — add by placeId, cap-enforced
 *   - removeCompetitorFromList              — soft-remove
 *
 * Transaction boundaries (db.transaction openers) preserved verbatim and trx is
 * threaded into the model calls. DB stays in models; Pino logger via util.
 */

import { db } from "../../../database/connection";
import { LocationModel } from "../../../models/LocationModel";
import { LocationCompetitorModel } from "../../../models/LocationCompetitorModel";
import { log } from "../feature-utils/util.ranking-logger";
import {
  DEFAULT_COMPETITOR_DISCOVERY_RADIUS_METERS,
  MAX_COMPETITORS_PER_LOCATION,
} from "../feature-utils/util.competitor-validator";
import {
  CompetitorDiscoverySuggestion,
  ComparisonSpecialtyPayload,
  buildCompetitorSuggestion,
  buildCompetitorSuggestionFromInput,
  buildInputFromRawPlaceDetails,
  resolveComparisonSpecialtyPayload,
  resolveDiscoveryRadiusMeters,
} from "../feature-utils/util.competitor-onboarding-builders";
import { withProfileStrength } from "../feature-utils/util.competitor-profile-strength";
import { loadLocationContext } from "./service.location-context";
import {
  resolveClientPlaceId,
  resolveSpecialtyAndMarket,
} from "./service.competitor-identity";
import {
  discoverCompetitorCandidates,
  fetchPlaceDetailsForCompetitor,
  findDiscoveryMatchForPlace,
} from "./service.competitor-discovery-helpers";

// Re-run discovery if the latest initial_scrape entry is older than this.
const DISCOVERY_FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface DiscoveryResult {
  status: "fresh" | "stale_skipped" | "completed";
  competitorCount: number;
  specialty: string | null;
  marketLocation: string | null;
  radiusMeters: number;
  comparisonSpecialty: ComparisonSpecialtyPayload | null;
}

export interface DiscoverySuggestionsResult extends DiscoveryResult {
  suggestions: CompetitorDiscoverySuggestion[];
}

export interface CompetitorPlacePreviewResult {
  competitor: CompetitorDiscoverySuggestion;
  radiusMeters: number;
  mapsMatched: boolean;
  comparisonSpecialty: ComparisonSpecialtyPayload | null;
}

// =====================================================================
// runDiscoveryForLocation
// =====================================================================

/**
 * Populate the initial competitor list for a location. Idempotent:
 *  - If status is `finalized`, throws (use the curate UI to modify).
 *  - If active rows exist and the latest `initial_scrape` is <7 days old,
 *    returns `stale_skipped` without re-querying Places.
 *  - Otherwise: runs Places discovery (top 10), upserts into
 *    location_competitors, and flips status to `curating`.
 */
export async function runDiscoveryForLocation(
  locationId: number,
  radiusMetersInput?: number,
  comparisonSpecialtyInput?: string
): Promise<DiscoveryResult> {
  const onboarding =
    await LocationCompetitorModel.getOnboardingStatus(locationId);
  if (onboarding.status === "finalized") {
    throw new Error(
      `Location ${locationId} is already finalized — discovery is locked. Modify via the curate endpoints.`
    );
  }

  const ctx = await loadLocationContext(locationId);
  const radiusMeters = resolveDiscoveryRadiusMeters(
    radiusMetersInput,
    ctx.competitorDiscoveryRadiusMeters
  );

  // Freshness check: skip if we already have a recent initial_scrape
  const latestInitial =
    await LocationCompetitorModel.findLatestInitialScrapeAt(locationId);
  if (latestInitial && radiusMetersInput === undefined) {
    const ageMs = Date.now() - new Date(latestInitial).getTime();
    if (ageMs < DISCOVERY_FRESHNESS_MS) {
      const activeCount =
        await LocationCompetitorModel.countActive(locationId);
      log(
        `[ONBOARDING] [${locationId}] Discovery skipped — initial_scrape ${Math.round(
          ageMs / (60 * 60 * 1000)
        )}h old, ${activeCount} active competitors`
      );
      // Ensure status is at least 'curating' since discovery exists
      if (onboarding.status === "pending") {
        await LocationCompetitorModel.setOnboardingStatus(
          locationId,
          "curating"
        );
      }
      return {
        status: "stale_skipped",
        competitorCount: activeCount,
        specialty: null,
        marketLocation: null,
        radiusMeters,
        comparisonSpecialty: null,
      };
    }
  }

  const { specialty, marketLocation } = await resolveSpecialtyAndMarket(ctx);
  const { comparison, payload } = resolveComparisonSpecialtyPayload(
    specialty,
    comparisonSpecialtyInput
  );

  log(
    `[ONBOARDING] [${locationId}] Running discovery for "${comparison.query}" in "${marketLocation}" radius=${radiusMeters}m (client specialty: ${specialty})`
  );

  // Resolve the practice's own placeId (cache → ranking history → Places lookup)
  // so we can filter the practice out of its own competitor list. When all three
  // fail (`source: 'unresolved'`), the GET response will flag this so the UI can
  // prompt the user to remove their own listing manually.
  const clientResolution = await resolveClientPlaceId(ctx, marketLocation);
  const clientPlaceId = clientResolution.placeId;
  const locationBias =
    clientResolution.lat !== null && clientResolution.lng !== null
      ? {
          lat: clientResolution.lat,
          lng: clientResolution.lng,
          radiusMeters,
        }
      : undefined;

  // Discover top N+2 competitors so we can backfill after filtering out the
  // client's own placeId (defensive against an off-by-one when the practice
  // ranks #11 in its own market). Then take top N.
  const RAW_DISCOVERY_OVERSAMPLE = 2;
  const rawDiscovered = await discoverCompetitorCandidates(
    comparison.query,
    marketLocation,
    MAX_COMPETITORS_PER_LOCATION + RAW_DISCOVERY_OVERSAMPLE,
    locationBias
  );

  const filtered = clientPlaceId
    ? rawDiscovered.filter((c) => c.placeId !== clientPlaceId)
    : rawDiscovered;
  const discovered = filtered.slice(0, MAX_COMPETITORS_PER_LOCATION);

  if (clientPlaceId && filtered.length < rawDiscovered.length) {
    log(
      `[ONBOARDING] [${locationId}] Filtered own practice (${clientPlaceId}) out of competitor set`
    );
  }

  // Insert as initial_scrape, soft-deleting nothing — model handles revival
  // of any prior soft-deleted rows for the same place_id (rare, but defensive).
  await db.transaction(async (trx) => {
    for (const comp of discovered) {
      await LocationCompetitorModel.addCompetitor(
        locationId,
        withProfileStrength({
          placeId: comp.placeId,
          name: comp.name,
          address: comp.address || null,
          primaryType: comp.primaryType || null,
          rating: comp.totalScore ?? null,
          reviewCount: comp.reviewsCount ?? null,
          lat: comp.location?.lat ?? null,
          lng: comp.location?.lng ?? null,
          phone: comp.phone || null,
          website: comp.website || null,
          photoName: comp.photoName || null,
          discoveryPosition: comp.discoveryPosition ?? null,
          discoveryQuery: comp.discoveryQuery ?? null,
          discoverySource: comp.discoverySource ?? "places_text",
          discoveryCheckedAt: comp.discoveryCheckedAt ?? null,
          discoveryRadiusMeters: radiusMeters,
          source: "initial_scrape",
          addedByUserId: null,
        }),
        trx
      );
    }

    await LocationCompetitorModel.setOnboardingStatus(
      locationId,
      "curating",
      trx
    );
    await LocationModel.setCompetitorDiscoveryRadius(
      locationId,
      radiusMeters,
      trx
    );
  });

  log(
    `[ONBOARDING] [${locationId}] Discovery complete: ${discovered.length} competitors → status=curating`
  );

  return {
    status: discovered.length > 0 ? "completed" : "fresh",
    competitorCount: discovered.length,
    specialty,
    marketLocation,
    radiusMeters,
    comparisonSpecialty: payload,
  };
}

/**
 * Preview discovery candidates for the selected radius without changing the
 * saved competitor set. Used by the finalized reselection UI.
 */
export async function previewDiscoveryCandidatesForLocation(
  locationId: number,
  radiusMetersInput?: number,
  comparisonSpecialtyInput?: string
): Promise<DiscoverySuggestionsResult> {
  const ctx = await loadLocationContext(locationId);
  const radiusMeters = resolveDiscoveryRadiusMeters(
    radiusMetersInput,
    ctx.competitorDiscoveryRadiusMeters
  );
  const { specialty, marketLocation } = await resolveSpecialtyAndMarket(ctx);
  const { comparison, payload } = resolveComparisonSpecialtyPayload(
    specialty,
    comparisonSpecialtyInput
  );
  const clientResolution = await resolveClientPlaceId(ctx, marketLocation);
  const locationBias =
    clientResolution.lat !== null && clientResolution.lng !== null
      ? {
          lat: clientResolution.lat,
          lng: clientResolution.lng,
          radiusMeters,
        }
      : undefined;

  const RAW_DISCOVERY_OVERSAMPLE = 4;
  const rawDiscovered = await discoverCompetitorCandidates(
    comparison.query,
    marketLocation,
    MAX_COMPETITORS_PER_LOCATION + RAW_DISCOVERY_OVERSAMPLE,
    locationBias
  );
  const discovered = (clientResolution.placeId
    ? rawDiscovered.filter((c) => c.placeId !== clientResolution.placeId)
    : rawDiscovered
  ).slice(0, MAX_COMPETITORS_PER_LOCATION);

  log(
    `[ONBOARDING] [${locationId}] Previewed ${discovered.length} discovery candidates radius=${radiusMeters}m`
  );

  return {
    status: discovered.length > 0 ? "completed" : "fresh",
    competitorCount: discovered.length,
    specialty,
    marketLocation,
    radiusMeters,
    comparisonSpecialty: payload,
    suggestions: discovered.map((comp) =>
      buildCompetitorSuggestion(comp, radiusMeters)
    ),
  };
}

/**
 * Resolve a manually searched Google Maps profile before adding it to the
 * reselection draft. This gives the UI coordinates/profile signals up front
 * and, when the place appears in the sampled discovery set, a Maps estimate.
 * It does not mutate the saved competitor set.
 */
export async function previewManualCompetitorForLocation(
  locationId: number,
  placeId: string,
  radiusMetersInput?: number,
  comparisonSpecialtyInput?: string
): Promise<CompetitorPlacePreviewResult> {
  const ctx = await loadLocationContext(locationId);
  const radiusMeters = resolveDiscoveryRadiusMeters(
    radiusMetersInput,
    ctx.competitorDiscoveryRadiusMeters
  );
  let comparisonSpecialty: ComparisonSpecialtyPayload | null = null;
  let comparisonSpecialtyForMeasurement = comparisonSpecialtyInput;
  try {
    const { specialty } = await resolveSpecialtyAndMarket(ctx);
    const { payload } = resolveComparisonSpecialtyPayload(
      specialty,
      comparisonSpecialtyInput
    );
    comparisonSpecialty = payload;
    comparisonSpecialtyForMeasurement = payload.value;
  } catch (err: any) {
    log(
      `[ONBOARDING] [${locationId}] Could not resolve comparison specialty for manual preview: ${err.message}`
    );
  }
  const [placeDetails, discoveryResult] = await Promise.all([
    fetchPlaceDetailsForCompetitor(placeId),
    findDiscoveryMatchForPlace(
      ctx,
      placeId,
      radiusMeters,
      comparisonSpecialtyForMeasurement
    ),
  ]);
  const input = buildInputFromRawPlaceDetails(
    placeId,
    placeDetails,
    null,
    radiusMeters,
    discoveryResult
  );

  return {
    competitor: buildCompetitorSuggestionFromInput(input, radiusMeters),
    radiusMeters,
    mapsMatched: Boolean(discoveryResult.match?.discoveryPosition),
    comparisonSpecialty,
  };
}

// =====================================================================
// addCustomCompetitor
// =====================================================================

/**
 * Add a user-chosen competitor by Google Place ID. Enforces the cap server-side.
 * Throws if the cap is reached. Reviving a previously soft-deleted entry does
 * NOT count toward the cap until revived.
 */
export async function addCustomCompetitor(
  locationId: number,
  placeId: string,
  userId: number | null
): Promise<{ added: any; activeCount: number }> {
  const onboarding =
    await LocationCompetitorModel.getOnboardingStatus(locationId);
  if (onboarding.status === "finalized") {
    throw new Error(
      `Location ${locationId} is already finalized — competitor list is locked.`
    );
  }

  // Cap check before remote Places call to avoid wasted API spend
  const currentCount =
    await LocationCompetitorModel.countActive(locationId);
  // Special case: if the placeId already exists ACTIVE, treat as no-op (idempotent)
  const existingActive =
    await LocationCompetitorModel.findActiveByLocationAndPlace(
      locationId,
      placeId
    );
  if (!existingActive && currentCount >= MAX_COMPETITORS_PER_LOCATION) {
    throw Object.assign(
      new Error(
        `Competitor cap reached (${MAX_COMPETITORS_PER_LOCATION}). Remove one before adding another.`
      ),
      { code: "COMPETITOR_CAP_REACHED" }
    );
  }

  const location = await LocationModel.findById(locationId);
  const discoveryRadiusMeters = Number(
    location?.competitor_discovery_radius_meters ??
      DEFAULT_COMPETITOR_DISCOVERY_RADIUS_METERS
  );
  const placeDetails = await fetchPlaceDetailsForCompetitor(placeId);
  const input = buildInputFromRawPlaceDetails(
    placeId,
    placeDetails,
    userId,
    discoveryRadiusMeters
  );

  const added = await LocationCompetitorModel.addCompetitor(
    locationId,
    input
  );

  const activeCount =
    await LocationCompetitorModel.countActive(locationId);

  // Ensure status reflects active curation
  if (onboarding.status === "pending") {
    await LocationCompetitorModel.setOnboardingStatus(locationId, "curating");
  }

  log(
    `[ONBOARDING] [${locationId}] User added competitor ${placeId} (${input.name}) — activeCount=${activeCount}`
  );

  return { added, activeCount };
}

// =====================================================================
// removeCompetitorFromList
// =====================================================================

export async function removeCompetitorFromList(
  locationId: number,
  placeId: string
): Promise<{ activeCount: number; removed: number }> {
  const onboarding =
    await LocationCompetitorModel.getOnboardingStatus(locationId);
  if (onboarding.status === "finalized") {
    throw new Error(
      `Location ${locationId} is already finalized — competitor list is locked.`
    );
  }

  const removed = await LocationCompetitorModel.removeCompetitor(
    locationId,
    placeId
  );
  const activeCount =
    await LocationCompetitorModel.countActive(locationId);

  log(
    `[ONBOARDING] [${locationId}] Removed competitor ${placeId} (rowsTouched=${removed}, activeCount=${activeCount})`
  );

  return { removed, activeCount };
}
