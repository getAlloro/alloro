/**
 * Competitor Source Resolver
 *
 * v2: branches the ranking pipeline at a single decision point.
 *   - Locations whose location_competitor_onboarding_status = 'finalized'
 *     use the user-curated list (from `location_competitors`).
 *   - Everyone else falls through to the Step 0 Google Places top-N
 *     ("discovered_v2_pending") — same as v1 behavior.
 *
 * The Search Position calculation upstream (Step 0 sub-steps 1-5) is NOT
 * affected — search_position, search_results, etc. always reflect raw Google
 * top-20 regardless of curation status. Only Practice Health scoring (Step 3+)
 * uses the resolved set.
 *
 * Spec: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
 */

import { db } from "../../../database/connection";
import { LocationCompetitorModel } from "../../../models/LocationCompetitorModel";
import { getPlaceDetails } from "../../places/feature-services/GooglePlacesApiService";
import type { DiscoveredCompetitor } from "./service.places-competitor-discovery";

export type CompetitorSource =
  | "curated"
  | "discovered_v2_pending"
  | "discovered_v1_legacy";

export interface ResolvedCompetitorSet {
  source: CompetitorSource;
  competitors: DiscoveredCompetitor[];
}

/**
 * Resolve the competitor set the ranking pipeline should use for Practice
 * Health scoring. Falls back to the discovered set if anything in the curated
 * path errors — Practice Health is more important than perfectly-fresh
 * curated metadata.
 *
 * @param rankingId - id of the practice_rankings row being processed (used
 *   to look up location_id since the pipeline receives it implicitly).
 * @param discoveredCompetitors - the Step 0 Places top-N result, used as
 *   fallback for non-finalized locations.
 */
export async function resolveCompetitorsForRanking(
  rankingId: number,
  discoveredCompetitors: DiscoveredCompetitor[],
  log: (msg: string) => void = console.log
): Promise<ResolvedCompetitorSet> {
  // Look up location_id from the ranking row
  const rankingRow = await db("practice_rankings")
    .where({ id: rankingId })
    .select("location_id")
    .first();

  const locationId = rankingRow?.location_id ?? null;
  if (!locationId) {
    log(
      `[RESOLVER] [${rankingId}] No location_id on ranking row → discovered_v2_pending`
    );
    return {
      source: "discovered_v2_pending",
      competitors: discoveredCompetitors,
    };
  }

  const onboarding =
    await LocationCompetitorModel.getOnboardingStatus(locationId);

  if (onboarding.status !== "finalized") {
    log(
      `[RESOLVER] [${rankingId}] Location ${locationId} status=${onboarding.status} → discovered_v2_pending`
    );
    return {
      source: "discovered_v2_pending",
      competitors: discoveredCompetitors,
    };
  }

  // Finalized: load the curated list
  const curated =
    await LocationCompetitorModel.findActiveByLocationId(locationId);

  if (curated.length === 0) {
    log(
      `[RESOLVER] [${rankingId}] Location ${locationId} finalized but curated list empty — using discovered set as graceful fallback`
    );
    return {
      source: "discovered_v2_pending",
      competitors: discoveredCompetitors,
    };
  }

  // Hydrate each curated competitor from Places to ensure fresh ratings/reviews
  // for the scoring math. Failures on individual lookups don't break the run —
  // we fall back to the cached metadata stored in location_competitors.
  const hydrated: DiscoveredCompetitor[] = [];
  for (const entry of curated) {
    try {
      const details = await getPlaceDetails(entry.place_id);
      hydrated.push(buildDiscoveredFromPlaceDetails(entry, details));
    } catch (err: any) {
      log(
        `[RESOLVER] [${rankingId}] getPlaceDetails failed for ${entry.place_id} (${entry.name}): ${err.message} — using cached metadata`
      );
      hydrated.push(buildDiscoveredFromCached(entry));
    }
  }

  log(
    `[RESOLVER] [${rankingId}] Location ${locationId} finalized → curated (${hydrated.length} competitors)`
  );

  return { source: "curated", competitors: hydrated };
}

function buildDiscoveredFromPlaceDetails(
  cached: { place_id: string; name: string; address: string | null; primary_type: string | null; lat: number | null; lng: number | null },
  details: any
): DiscoveredCompetitor {
  const hours = details?.regularOpeningHours;
  const hasHours = !!hours;
  const hoursComplete = hasHours
    ? (hours.periods?.length || 0) >= 5
    : false;

  return {
    placeId: cached.place_id,
    name: details?.displayName?.text || cached.name,
    address: details?.formattedAddress || cached.address || "",
    category:
      details?.primaryTypeDisplayName?.text ||
      details?.primaryType ||
      cached.primary_type ||
      "Unknown",
    primaryType: details?.primaryType || cached.primary_type || "",
    types: details?.types || [],
    totalScore: details?.rating ?? 0,
    reviewsCount: details?.userRatingCount ?? 0,
    url: `https://www.google.com/maps/place/?q=place_id:${cached.place_id}`,
    website: details?.websiteUri,
    phone: details?.nationalPhoneNumber,
    hasHours,
    hoursComplete,
    photosCount: details?.photos?.length ?? 0,
    location:
      details?.location && typeof details.location.latitude === "number"
        ? {
            lat: details.location.latitude,
            lng: details.location.longitude,
          }
        : cached.lat !== null && cached.lng !== null
          ? { lat: cached.lat, lng: cached.lng }
          : undefined,
    discoverySource: "places_text",
    discoveryCheckedAt: new Date(),
  };
}

function buildDiscoveredFromCached(cached: {
  place_id: string;
  name: string;
  address: string | null;
  primary_type: string | null;
  lat: number | null;
  lng: number | null;
}): DiscoveredCompetitor {
  return {
    placeId: cached.place_id,
    name: cached.name,
    address: cached.address || "",
    category: cached.primary_type || "Unknown",
    primaryType: cached.primary_type || "",
    types: [],
    totalScore: 0,
    reviewsCount: 0,
    url: `https://www.google.com/maps/place/?q=place_id:${cached.place_id}`,
    hasHours: false,
    hoursComplete: false,
    photosCount: 0,
    location:
      cached.lat !== null && cached.lng !== null
        ? { lat: cached.lat, lng: cached.lng }
        : undefined,
  };
}
