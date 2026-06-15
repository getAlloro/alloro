/**
 * Location Competitor Formatter
 *
 * Pure helpers for the v2 curated-competitor endpoints: maps a stored
 * ILocationCompetitor row to its camelCase API shape, and reads the optional
 * comparisonSpecialty body field. Extracted from PracticeRankingController.
 */

import type { ILocationCompetitor } from "../../../models/LocationCompetitorModel";

export function formatLocationCompetitor(c: ILocationCompetitor) {
  return {
    id: c.id,
    placeId: c.place_id,
    name: c.name,
    address: c.address,
    primaryType: c.primary_type,
    rating: c.rating === null ? null : Number(c.rating),
    reviewCount: c.review_count,
    lat: c.lat === null ? null : Number(c.lat),
    lng: c.lng === null ? null : Number(c.lng),
    phone: c.phone,
    website: c.website,
    photoName: c.photo_name,
    discoveryPosition: c.discovery_position,
    discoveryQuery: c.discovery_query,
    discoverySource: c.discovery_source,
    discoveryCheckedAt: c.discovery_checked_at,
    discoveryRadiusMeters: c.discovery_radius_meters,
    profileStrengthScore:
      c.profile_strength_score === null
        ? null
        : Number(c.profile_strength_score),
    profileStrengthTier: c.profile_strength_tier,
    profileStrengthFactors: c.profile_strength_factors,
    source: c.source,
    addedAt: c.added_at,
    addedByUserId: c.added_by_user_id,
  };
}

export function readComparisonSpecialtyInput(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim().length > 0
    ? raw.trim()
    : undefined;
}
