/**
 * Competitor onboarding builders (pure)
 *
 * Extracted verbatim from service.location-competitor-onboarding.ts. Pure
 * shape-mapping helpers + their shared types:
 *   - radius/comparison-specialty resolution and formatting
 *   - DiscoveredCompetitor / raw Places details / existing-row → AddCompetitorInput
 *   - AddCompetitorInput → CompetitorDiscoverySuggestion
 *   - active competitor rows → CompetitorSnapshot
 *
 * No DB, no IO, no logging here. Profile-strength scoring is delegated to
 * util.competitor-profile-strength. The onboarding services compose these.
 */

import {
  AddCompetitorInput,
  ILocationCompetitor,
  ProfileStrengthTier,
} from "../../../models/LocationCompetitorModel";
import {
  COMPARISON_SPECIALTY_OPTIONS,
  resolveComparisonSpecialty,
  type ComparisonSpecialty,
  type DiscoveredCompetitor,
} from "../feature-services/service.places-competitor-discovery";
import {
  DEFAULT_COMPETITOR_DISCOVERY_RADIUS_METERS,
  validateDiscoveryRadiusMeters,
} from "./util.competitor-validator";
import { withProfileStrength } from "./util.competitor-profile-strength";

// =====================================================================
// SHARED TYPES (produced/consumed by these builders)
// =====================================================================

export interface CompetitorDiscoverySuggestion {
  placeId: string;
  name: string;
  address: string | null;
  primaryType: string | null;
  rating: number | null;
  reviewCount: number | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  photoName: string | null;
  discoveryPosition: number | null;
  discoveryQuery: string | null;
  discoverySource: string | null;
  discoveryCheckedAt: Date | null;
  discoveryRadiusMeters: number;
  profileStrengthScore: number | null;
  profileStrengthTier: ProfileStrengthTier | null;
  profileStrengthFactors: import("../../../models/LocationCompetitorModel").ProfileStrengthFactors | null;
}

export interface ComparisonSpecialtyPayload {
  value: string;
  label: string;
  query: string;
  sourceSpecialty: string;
}

export const COMPARISON_SPECIALTY_PAYLOAD_OPTIONS =
  COMPARISON_SPECIALTY_OPTIONS;

export interface CompetitorSnapshot {
  revision: number;
  capturedAt: string;
  competitors: Array<{
    placeId: string;
    name: string;
    address: string | null;
    rating: number | null;
    reviewCount: number | null;
    discoveryPosition: number | null;
    discoveryQuery: string | null;
    discoverySource: string | null;
    discoveryCheckedAt: string | null;
    discoveryRadiusMeters: number | null;
    profileStrengthScore: number | null;
    profileStrengthTier: ProfileStrengthTier | null;
  }>;
}

export interface DiscoveryMatchResult {
  match: DiscoveredCompetitor | null;
  checkedAt: Date | null;
  measured: boolean;
}

// =====================================================================
// RADIUS + COMPARISON SPECIALTY RESOLUTION
// =====================================================================

export function resolveDiscoveryRadiusMeters(
  raw: unknown,
  fallback: number = DEFAULT_COMPETITOR_DISCOVERY_RADIUS_METERS
): number {
  const validation = validateDiscoveryRadiusMeters(raw, fallback);
  if (!validation.valid) {
    throw Object.assign(new Error(validation.body.message), {
      code: validation.body.error,
    });
  }
  return validation.radiusMeters;
}

export function formatComparisonSpecialtyPayload(
  comparison: ComparisonSpecialty,
  sourceSpecialty: string
): ComparisonSpecialtyPayload {
  return {
    value: comparison.value,
    label: comparison.label,
    query: comparison.query,
    sourceSpecialty,
  };
}

export function resolveComparisonSpecialtyPayload(
  clientSpecialty: string,
  requestedSpecialty?: string
): {
  comparison: ComparisonSpecialty;
  payload: ComparisonSpecialtyPayload;
} {
  const comparison = resolveComparisonSpecialty(
    requestedSpecialty || clientSpecialty
  );
  return {
    comparison,
    payload: formatComparisonSpecialtyPayload(comparison, clientSpecialty),
  };
}

// =====================================================================
// SUGGESTION + INPUT BUILDERS
// =====================================================================

export function buildCompetitorSuggestion(
  comp: DiscoveredCompetitor,
  radiusMeters: number
): CompetitorDiscoverySuggestion {
  const input = withProfileStrength({
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
  });

  return {
    placeId: input.placeId,
    name: input.name,
    address: input.address ?? null,
    primaryType: input.primaryType ?? null,
    rating: input.rating ?? null,
    reviewCount: input.reviewCount ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    phone: input.phone ?? null,
    website: input.website ?? null,
    photoName: input.photoName ?? null,
    discoveryPosition: input.discoveryPosition ?? null,
    discoveryQuery: input.discoveryQuery ?? null,
    discoverySource: input.discoverySource ?? null,
    discoveryCheckedAt: input.discoveryCheckedAt ?? null,
    discoveryRadiusMeters: radiusMeters,
    profileStrengthScore: input.profileStrengthScore ?? null,
    profileStrengthTier: input.profileStrengthTier ?? null,
    profileStrengthFactors: input.profileStrengthFactors ?? null,
  };
}

export function buildCompetitorSuggestionFromInput(
  input: AddCompetitorInput,
  radiusMeters: number
): CompetitorDiscoverySuggestion {
  return {
    placeId: input.placeId,
    name: input.name,
    address: input.address ?? null,
    primaryType: input.primaryType ?? null,
    rating: input.rating ?? null,
    reviewCount: input.reviewCount ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    phone: input.phone ?? null,
    website: input.website ?? null,
    photoName: input.photoName ?? null,
    discoveryPosition: input.discoveryPosition ?? null,
    discoveryQuery: input.discoveryQuery ?? null,
    discoverySource: input.discoverySource ?? null,
    discoveryCheckedAt: input.discoveryCheckedAt ?? null,
    discoveryRadiusMeters: radiusMeters,
    profileStrengthScore: input.profileStrengthScore ?? null,
    profileStrengthTier: input.profileStrengthTier ?? null,
    profileStrengthFactors: input.profileStrengthFactors ?? null,
  };
}

export function buildInputFromRawPlaceDetails(
  placeId: string,
  placeDetails: any,
  userId: number | null,
  discoveryRadiusMeters: number,
  discoveryResult?: DiscoveryMatchResult | null
): AddCompetitorInput {
  const discoveryMatch = discoveryResult?.match ?? null;
  return withProfileStrength({
    placeId,
    name:
      placeDetails?.displayName?.text ||
      placeDetails?.name ||
      discoveryMatch?.name ||
      "Unknown business",
    address:
      placeDetails?.formattedAddress || discoveryMatch?.address || null,
    primaryType:
      placeDetails?.primaryType || discoveryMatch?.primaryType || null,
    rating:
      typeof placeDetails?.rating === "number"
        ? placeDetails.rating
        : discoveryMatch?.totalScore ?? null,
    reviewCount:
      typeof placeDetails?.userRatingCount === "number"
        ? placeDetails.userRatingCount
        : discoveryMatch?.reviewsCount ?? null,
    lat:
      placeDetails?.location?.latitude ??
      discoveryMatch?.location?.lat ??
      null,
    lng:
      placeDetails?.location?.longitude ??
      discoveryMatch?.location?.lng ??
      null,
    phone: placeDetails?.nationalPhoneNumber || discoveryMatch?.phone || null,
    website: placeDetails?.websiteUri || discoveryMatch?.website || null,
    photoName: placeDetails?.photos?.[0]?.name || discoveryMatch?.photoName || null,
    discoveryPosition: discoveryMatch?.discoveryPosition ?? null,
    discoveryQuery: discoveryMatch?.discoveryQuery ?? null,
    discoverySource:
      discoveryMatch || discoveryResult?.measured ? "places_text" : "user_added",
    discoveryCheckedAt:
      discoveryMatch?.discoveryCheckedAt ?? discoveryResult?.checkedAt ?? null,
    discoveryRadiusMeters,
    source: "user_added",
    addedByUserId: userId,
  });
}

export function buildInputFromExistingCompetitor(
  competitor: ILocationCompetitor,
  userId: number | null
): AddCompetitorInput {
  return withProfileStrength({
    placeId: competitor.place_id,
    name: competitor.name,
    address: competitor.address,
    primaryType: competitor.primary_type,
    rating:
      competitor.rating === null || competitor.rating === undefined
        ? null
        : Number(competitor.rating),
    reviewCount: competitor.review_count,
    lat:
      competitor.lat === null || competitor.lat === undefined
        ? null
        : Number(competitor.lat),
    lng:
      competitor.lng === null || competitor.lng === undefined
        ? null
        : Number(competitor.lng),
    phone: competitor.phone,
    website: competitor.website,
    photoName: competitor.photo_name,
    discoveryPosition: competitor.discovery_position,
    discoveryQuery: competitor.discovery_query,
    discoverySource: competitor.discovery_source ?? "unknown",
    discoveryCheckedAt: competitor.discovery_checked_at,
    discoveryRadiusMeters: competitor.discovery_radius_meters,
    source: competitor.source || "user_added",
    addedByUserId: competitor.added_by_user_id ?? userId,
  });
}

export function buildSnapshot(
  competitors: ILocationCompetitor[],
  revision: number
): CompetitorSnapshot {
  return {
    revision,
    capturedAt: new Date().toISOString(),
    competitors: competitors.map((competitor) => ({
      placeId: competitor.place_id,
      name: competitor.name,
      address: competitor.address,
      rating:
        competitor.rating === null || competitor.rating === undefined
          ? null
          : Number(competitor.rating),
      reviewCount: competitor.review_count,
      lat:
        competitor.lat === null || competitor.lat === undefined
          ? null
          : Number(competitor.lat),
      lng:
        competitor.lng === null || competitor.lng === undefined
          ? null
          : Number(competitor.lng),
      discoveryPosition: competitor.discovery_position,
      discoveryQuery: competitor.discovery_query,
      discoverySource: competitor.discovery_source,
      discoveryCheckedAt: competitor.discovery_checked_at
        ? new Date(competitor.discovery_checked_at).toISOString()
        : null,
      discoveryRadiusMeters: competitor.discovery_radius_meters,
      profileStrengthScore:
        competitor.profile_strength_score === null ||
        competitor.profile_strength_score === undefined
          ? null
          : Number(competitor.profile_strength_score),
      profileStrengthTier: competitor.profile_strength_tier,
    })),
  };
}
