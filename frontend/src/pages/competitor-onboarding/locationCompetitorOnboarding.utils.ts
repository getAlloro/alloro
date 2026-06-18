import L from "leaflet";
import {
  type CuratedCompetitor,
  type CompetitorDiscoverySuggestion,
} from "../../api/practiceRanking";

export const PULSE_DURATION_MS = 2000;
export const DEFAULT_DISCOVERY_RADIUS_METERS = 40234;
export const RECOMMENDED_DISCOVERY_RADIUS_METERS = DEFAULT_DISCOVERY_RADIUS_METERS;
export const RECOMMENDED_RADIUS_TOOLTIP =
  "Recommended default: prioritizes competitors from the local Google Maps query for your specialty and market before broader radius exploration.";
export const DISCOVERY_RADIUS_OPTIONS = [
  { label: "5 mi", value: 8047 },
  { label: "10 mi", value: 16093 },
  { label: "15 mi", value: 24140 },
  {
    label: "25 mi",
    value: RECOMMENDED_DISCOVERY_RADIUS_METERS,
    recommended: true,
  },
  { label: "50 mi", value: 80467 },
  { label: "100 mi", value: 160934 },
];

export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string") return err;
  return fallback;
}

export function suggestionToCuratedCompetitor(
  suggestion: CompetitorDiscoverySuggestion,
  id: number
): CuratedCompetitor {
  return {
    id,
    placeId: suggestion.placeId,
    name: suggestion.name,
    address: suggestion.address,
    primaryType: suggestion.primaryType,
    rating: suggestion.rating,
    reviewCount: suggestion.reviewCount,
    lat: suggestion.lat,
    lng: suggestion.lng,
    phone: suggestion.phone,
    website: suggestion.website,
    photoName: suggestion.photoName,
    discoveryPosition: suggestion.discoveryPosition,
    discoveryQuery: suggestion.discoveryQuery,
    discoverySource: suggestion.discoverySource,
    discoveryCheckedAt: suggestion.discoveryCheckedAt,
    discoveryRadiusMeters: suggestion.discoveryRadiusMeters,
    profileStrengthScore: suggestion.profileStrengthScore,
    profileStrengthTier: suggestion.profileStrengthTier,
    profileStrengthFactors: suggestion.profileStrengthFactors,
    source: "initial_scrape",
    addedAt: new Date().toISOString(),
    addedByUserId: null,
  };
}

export function makeCompetitorIcon(index: number, isSelected: boolean): L.DivIcon {
  return L.divIcon({
    className: "alloro-marker-wrapper",
    html: `<div class="alloro-pin alloro-pin-competitor${isSelected ? " is-selected" : ""}">${index + 1}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

export function makePracticeIcon(): L.DivIcon {
  return L.divIcon({
    className: "alloro-marker-wrapper",
    html: `<div class="alloro-pin alloro-pin-practice">YOU</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

export function getRadiusBounds(
  center: [number, number],
  radiusMeters: number
): L.LatLngBounds {
  const [lat, lng] = center;
  const latDelta = radiusMeters / 111320;
  const lngMetersPerDegree = Math.max(
    1,
    111320 * Math.cos((lat * Math.PI) / 180)
  );
  const lngDelta = radiusMeters / lngMetersPerDegree;
  return L.latLngBounds(
    [lat - latDelta, lng - lngDelta],
    [lat + latDelta, lng + lngDelta]
  );
}
