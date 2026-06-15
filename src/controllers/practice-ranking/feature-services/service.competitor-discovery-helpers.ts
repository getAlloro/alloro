/**
 * Competitor discovery helpers (Places-backed)
 *
 * Extracted verbatim from service.location-competitor-onboarding.ts:
 *   - discoverCompetitorCandidates     — specialty-aware Places discovery,
 *                                        wide-radius branch, dental-specialist
 *                                        ordering rules
 *   - fetchPlaceDetailsForCompetitor   — single Places Details lookup
 *   - findDiscoveryMatchForPlace       — measure a manually added place against
 *                                        the sampled discovery set (Maps estimate)
 *
 * Pino logger via util; DB stays in models (reached through the identity service).
 */

import { getPlaceDetails } from "../../places/feature-services/GooglePlacesApiService";
import {
  discoverCompetitorsViaPlaces,
  discoverCompetitorsViaPlacesWideRadius,
  filterBySpecialty,
  resolveComparisonSpecialty,
  type DiscoveredCompetitor,
} from "./service.places-competitor-discovery";
import { log } from "../feature-utils/util.ranking-logger";
import {
  DiscoveryMatchResult,
  resolveComparisonSpecialtyPayload,
} from "../feature-utils/util.competitor-onboarding-builders";
import { LoadedLocationContext } from "./service.location-context";
import {
  resolveClientPlaceId,
  resolveSpecialtyAndMarket,
} from "./service.competitor-identity";

const WIDE_RADIUS_DISCOVERY_THRESHOLD_METERS = 80467; // 50 miles

export async function discoverCompetitorCandidates(
  specialty: string,
  marketLocation: string,
  limit: number,
  locationBias: { lat: number; lng: number; radiusMeters?: number } | undefined
): Promise<DiscoveredCompetitor[]> {
  const comparison = resolveComparisonSpecialty(specialty);
  if (
    locationBias &&
    (locationBias.radiusMeters ?? 0) >= WIDE_RADIUS_DISCOVERY_THRESHOLD_METERS
  ) {
    return discoverCompetitorsViaPlacesWideRadius(
      comparison.query,
      limit,
      locationBias
    );
  }

  const rawCompetitors = await discoverCompetitorsViaPlaces(
    comparison.query,
    marketLocation,
    comparison.isDentalSpecialist ? 20 : limit,
    locationBias
  );

  if (comparison.isDentalSpecialist) {
    // The exact query ("endodontist in Falls Church, VA") is the primary
    // local-rank signal. Google often labels relevant specialist practices as
    // generic dentists, so do not reorder or drop top local Maps results here.
    return rawCompetitors.slice(0, limit);
  }

  return filterBySpecialty(rawCompetitors, comparison.query).slice(0, limit);
}

export async function fetchPlaceDetailsForCompetitor(placeId: string): Promise<any> {
  try {
    return await getPlaceDetails(placeId);
  } catch (err: any) {
    throw Object.assign(
      new Error(`Failed to fetch place details: ${err.message}`),
      { code: "PLACES_LOOKUP_FAILED" }
    );
  }
}

export async function findDiscoveryMatchForPlace(
  ctx: LoadedLocationContext,
  placeId: string,
  radiusMeters: number,
  comparisonSpecialtyInput?: string
): Promise<DiscoveryMatchResult> {
  const checkedAt = new Date();
  try {
    const { specialty, marketLocation } = await resolveSpecialtyAndMarket(ctx);
    const { comparison } = resolveComparisonSpecialtyPayload(
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

    const candidates = await discoverCompetitorCandidates(
      comparison.query,
      marketLocation,
      20,
      locationBias
    );
    return {
      match: candidates.find((candidate) => candidate.placeId === placeId) ?? null,
      checkedAt,
      measured: true,
    };
  } catch (err: any) {
    log(
      `[ONBOARDING] [${ctx.locationId}] Could not measure Maps estimate for manually added competitor ${placeId}: ${err.message}`
    );
    return {
      match: null,
      checkedAt: null,
      measured: false,
    };
  }
}
