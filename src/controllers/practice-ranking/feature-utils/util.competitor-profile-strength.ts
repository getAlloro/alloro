/**
 * Competitor profile-strength scoring (pure)
 *
 * Extracted verbatim from service.location-competitor-onboarding.ts.
 * Computes a 0-100 profile-strength score + tier + factor breakdown from the
 * Google-derived signals on a competitor (rating, reviews, completeness).
 *
 * Pure functions only — no DB, no IO, no logging. Consumed by the onboarding
 * builders and the curation/finalize services.
 */

import {
  AddCompetitorInput,
  ProfileStrengthFactors,
  ProfileStrengthTier,
} from "../../../models/LocationCompetitorModel";

export function calculateProfileStrength(
  input: Pick<
    AddCompetitorInput,
    | "rating"
    | "reviewCount"
    | "website"
    | "phone"
    | "primaryType"
    | "lat"
    | "lng"
    | "photoName"
  >
): {
  profileStrengthScore: number | null;
  profileStrengthTier: ProfileStrengthTier;
  profileStrengthFactors: ProfileStrengthFactors;
} {
  const factors: ProfileStrengthFactors = {
    rating: input.rating ?? null,
    reviewCount: input.reviewCount ?? null,
    hasWebsite: Boolean(input.website),
    hasPhone: Boolean(input.phone),
    hasCategory: Boolean(input.primaryType),
    hasCoordinates: input.lat !== null && input.lat !== undefined && input.lng !== null && input.lng !== undefined,
    hasPhoto: Boolean(input.photoName),
  };

  const hasAnySignal =
    factors.rating !== null ||
    factors.reviewCount !== null ||
    factors.hasWebsite ||
    factors.hasPhone ||
    factors.hasCategory ||
    factors.hasCoordinates ||
    factors.hasPhoto;

  if (!hasAnySignal) {
    return {
      profileStrengthScore: null,
      profileStrengthTier: "not_measured",
      profileStrengthFactors: factors,
    };
  }

  const ratingScore =
    factors.rating !== null ? Math.min(Math.max(factors.rating, 0), 5) / 5 * 30 : 0;
  const reviewScore =
    factors.reviewCount !== null
      ? Math.min(Math.max(factors.reviewCount, 0), 300) / 300 * 35
      : 0;
  const completenessScore =
    (factors.hasWebsite ? 8 : 0) +
    (factors.hasPhone ? 7 : 0) +
    (factors.hasCategory ? 8 : 0) +
    (factors.hasCoordinates ? 7 : 0) +
    (factors.hasPhoto ? 5 : 0);
  const score = Math.round((ratingScore + reviewScore + completenessScore) * 100) / 100;

  let tier: ProfileStrengthTier = "needs_review";
  if (score >= 75) {
    tier = "strong";
  } else if (score >= 55) {
    tier = "competitive";
  }

  return {
    profileStrengthScore: score,
    profileStrengthTier: tier,
    profileStrengthFactors: factors,
  };
}

export function withProfileStrength(input: AddCompetitorInput): AddCompetitorInput {
  const strength = calculateProfileStrength(input);
  return {
    ...input,
    profileStrengthScore: strength.profileStrengthScore,
    profileStrengthTier: strength.profileStrengthTier,
    profileStrengthFactors: strength.profileStrengthFactors,
  };
}
