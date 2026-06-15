/**
 * Competitor Radius Selection
 *
 * Pure helpers for sampling, filtering, ordering, and distributing discovered
 * competitors relative to a location bias + radius. Includes the wide-radius
 * sample-bias generator, distance/quality sorters, the sector-distributed
 * picker, the Maps-estimate comparator, and the radius hard-filter.
 *
 * Extracted verbatim from service.places-competitor-discovery.ts. No I/O,
 * no logging — pure transforms over DiscoveredCompetitor[].
 */

import {
  bearingDegrees,
  destinationPoint,
  distanceMiles,
  METERS_PER_MILE,
  RADIUS_FILTER_TOLERANCE,
} from "./util.competitor-geo";
import type { DiscoveredCompetitor } from "./util.competitor-specialty-taxonomy";

export function wideRadiusSampleBiases(locationBias: {
  lat: number;
  lng: number;
  radiusMeters?: number;
}): Array<{ lat: number; lng: number; radiusMeters: number; sector: number }> {
  const radiusMeters = locationBias.radiusMeters ?? 40234;
  const center = { lat: locationBias.lat, lng: locationBias.lng };
  const sampleDistanceMeters = radiusMeters * 0.62;
  const sampleRadiusMeters = Math.max(12070, radiusMeters * 0.28);
  const bearings = [0, 45, 90, 135, 180, 225, 270, 315];
  return [
    { ...center, radiusMeters: Math.max(12070, radiusMeters * 0.22), sector: -1 },
    ...bearings.map((bearing, index) => ({
      ...destinationPoint(center, sampleDistanceMeters, bearing),
      radiusMeters: sampleRadiusMeters,
      sector: index,
    })),
  ];
}

export function sortBestWithinRadius(
  competitors: DiscoveredCompetitor[],
  locationBias: { lat: number; lng: number; radiusMeters?: number },
): DiscoveredCompetitor[] {
  const radiusMiles = (locationBias.radiusMeters ?? 40234) / METERS_PER_MILE;
  const center = { lat: locationBias.lat, lng: locationBias.lng };
  return competitors
    .map((competitor) => ({
      competitor,
      distance:
        competitor.location
          ? distanceMiles(center, competitor.location)
          : Number.NEGATIVE_INFINITY,
    }))
    .filter(({ distance }) => distance <= radiusMiles * 1.05)
    .sort((a, b) => {
      if (b.competitor.reviewsCount !== a.competitor.reviewsCount) {
        return b.competitor.reviewsCount - a.competitor.reviewsCount;
      }
      if (b.competitor.totalScore !== a.competitor.totalScore) {
        return b.competitor.totalScore - a.competitor.totalScore;
      }
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.competitor.placeId.localeCompare(b.competitor.placeId);
    })
    .map(({ competitor }, index) => ({
      ...competitor,
      discoveryPosition: index + 1,
    }));
}

export function selectDistributedBestWithinRadius(
  competitors: DiscoveredCompetitor[],
  locationBias: { lat: number; lng: number; radiusMeters?: number },
): DiscoveredCompetitor[] {
  const radiusMiles = (locationBias.radiusMeters ?? 40234) / METERS_PER_MILE;
  const center = { lat: locationBias.lat, lng: locationBias.lng };
  const scored = competitors
    .map((competitor) => {
      const distance =
        competitor.location
          ? distanceMiles(center, competitor.location)
          : Number.POSITIVE_INFINITY;
      const bearing =
        competitor.location && distance > 5
          ? bearingDegrees(center, competitor.location)
          : -1;
      return {
        competitor,
        distance,
        sector: bearing >= 0 ? Math.floor((bearing + 22.5) / 45) % 8 : -1,
      };
    })
    .filter(({ distance }) => distance <= radiusMiles * 1.05);

  const byQuality = (a: typeof scored[number], b: typeof scored[number]) => {
    if (b.competitor.reviewsCount !== a.competitor.reviewsCount) {
      return b.competitor.reviewsCount - a.competitor.reviewsCount;
    }
    if (b.competitor.totalScore !== a.competitor.totalScore) {
      return b.competitor.totalScore - a.competitor.totalScore;
    }
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.competitor.placeId.localeCompare(b.competitor.placeId);
  };

  const selected = new Map<string, DiscoveredCompetitor>();
  for (const sector of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const bestInSector = scored
      .filter((item) => item.sector === sector)
      .sort(byQuality)[0];
    if (bestInSector) {
      selected.set(bestInSector.competitor.placeId, bestInSector.competitor);
    }
  }

  for (const item of scored.sort(byQuality)) {
    selected.set(item.competitor.placeId, item.competitor);
  }

  return Array.from(selected.values()).map((competitor, index) => ({
    ...competitor,
    discoveryPosition: index + 1,
  }));
}

export function compareByMapsEstimateThenProfile(
  a: DiscoveredCompetitor,
  b: DiscoveredCompetitor,
): number {
  const aPosition =
    typeof a.discoveryPosition === "number" && a.discoveryPosition > 0
      ? a.discoveryPosition
      : Number.POSITIVE_INFINITY;
  const bPosition =
    typeof b.discoveryPosition === "number" && b.discoveryPosition > 0
      ? b.discoveryPosition
      : Number.POSITIVE_INFINITY;

  if (aPosition !== bPosition) return aPosition - bPosition;
  if (b.reviewsCount !== a.reviewsCount) return b.reviewsCount - a.reviewsCount;
  if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
  return a.placeId.localeCompare(b.placeId);
}

export function filterWithinLocationBiasRadius(
  competitors: DiscoveredCompetitor[],
  locationBias?: { lat: number; lng: number; radiusMeters?: number },
): DiscoveredCompetitor[] {
  if (!locationBias?.radiusMeters) return competitors;

  const radiusMiles = locationBias.radiusMeters / METERS_PER_MILE;
  const center = { lat: locationBias.lat, lng: locationBias.lng };
  return competitors.filter((competitor) => {
    if (!competitor.location) return false;
    return (
      distanceMiles(center, competitor.location) <=
      radiusMiles * RADIUS_FILTER_TOLERANCE
    );
  });
}
