import {
  ILocationCompetitor,
  LocationCompetitorModel,
} from "../../../models/LocationCompetitorModel";
import { LocationModel } from "../../../models/LocationModel";
import logger from "../../../lib/logger";
import { calculateProfileStrength } from "../../practice-ranking/feature-utils/util.competitor-profile-strength";
import {
  ChoosableMetrics,
  ChoosableSourceReason,
  ChoosableSourceStatus,
  ChoosableWeakestFactor,
  ReviewsMetrics,
} from "../../../utils/dashboard-metrics/types";

type StrongestCompetitor = { name: string; count: number };

function emptyMetrics(
  sourceStatus: ChoosableSourceStatus,
  sourceReason: ChoosableSourceReason
): ChoosableMetrics {
  return {
    source_status: sourceStatus,
    source_reason: sourceReason,
    has_competitor_set: false,
    competitor_count: 0,
    practice_review_count: null,
    practice_rating: null,
    competitor_median_review_count: null,
    strongest_competitor_name: null,
    strongest_competitor_review_count: null,
    competitors_ahead_on_reviews: null,
    review_count_gap_to_median: null,
    is_at_or_above_review_median: null,
    has_most_reviews: null,
    as_of: null,
    practice_profile_strength: null,
    competitor_median_profile_strength: null,
    weakest_choosable_factor: null,
  };
}

function finiteValues(values: Array<number | null>): number[] {
  return values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value)
  );
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  return Number(value.toFixed(2));
}

function findStrongestCompetitor(
  competitors: ILocationCompetitor[]
): StrongestCompetitor | null {
  return competitors.reduce<StrongestCompetitor | null>((strongest, competitor) => {
    const count = competitor.review_count;
    if (typeof count !== "number" || !Number.isFinite(count)) return strongest;
    if (!strongest || count > strongest.count) {
      return { name: competitor.name, count };
    }
    return strongest;
  }, null);
}

function getOldestDiscoveryTime(competitors: ILocationCompetitor[]): string | null {
  const timestamps = competitors
    .map((competitor) => competitor.discovery_checked_at)
    .filter((value): value is Date => value instanceof Date)
    .map((value) => value.getTime())
    .filter(Number.isFinite);
  return timestamps.length > 0
    ? new Date(Math.min(...timestamps)).toISOString()
    : null;
}

function getMedianProfileStrength(
  competitors: ILocationCompetitor[]
): number | null {
  const strengths = competitors.map(
    (competitor) =>
      calculateProfileStrength({
        rating: competitor.rating,
        reviewCount: competitor.review_count,
        website: competitor.website,
        phone: competitor.phone,
        primaryType: competitor.primary_type,
        lat: competitor.lat,
        lng: competitor.lng,
        photoName: competitor.photo_name,
      }).profileStrengthScore
  );
  return median(finiteValues(strengths));
}

function getWeakestFactor(
  practiceReviewCount: number | null,
  competitorMedianReviews: number | null,
  practiceRating: number | null,
  competitorMedianRating: number | null
): ChoosableWeakestFactor | null {
  const reviewGap =
    competitorMedianReviews &&
    practiceReviewCount !== null &&
    competitorMedianReviews > practiceReviewCount
      ? (competitorMedianReviews - practiceReviewCount) / competitorMedianReviews
      : 0;
  const ratingGap =
    competitorMedianRating !== null &&
    practiceRating !== null &&
    competitorMedianRating > practiceRating
      ? (competitorMedianRating - practiceRating) / 5
      : 0;
  if (reviewGap <= 0 && ratingGap <= 0) return null;
  return reviewGap >= ratingGap ? "reviews" : "rating";
}

function buildReadyMetrics(
  competitors: ILocationCompetitor[],
  reviews: ReviewsMetrics
): ChoosableMetrics {
  const reviewCounts = finiteValues(
    competitors.map((competitor) => competitor.review_count)
  );
  const ratings = finiteValues(competitors.map((competitor) => competitor.rating));
  const competitorMedianReviews = median(reviewCounts);
  const competitorMedianRating = median(ratings);
  const strongest = findStrongestCompetitor(competitors);
  const practiceReviewCount = reviews.total_review_count;

  return {
    source_status: "ready",
    source_reason: null,
    has_competitor_set: true,
    competitor_count: competitors.length,
    practice_review_count: practiceReviewCount,
    practice_rating: reviews.current_rating,
    competitor_median_review_count: competitorMedianReviews,
    strongest_competitor_name: strongest?.name ?? null,
    strongest_competitor_review_count: strongest?.count ?? null,
    competitors_ahead_on_reviews:
      practiceReviewCount === null
        ? null
        : reviewCounts.filter((count) => count > practiceReviewCount).length,
    review_count_gap_to_median:
      competitorMedianReviews === null || practiceReviewCount === null
        ? null
        : Number((competitorMedianReviews - practiceReviewCount).toFixed(2)),
    is_at_or_above_review_median:
      competitorMedianReviews === null || practiceReviewCount === null
        ? null
        : practiceReviewCount >= competitorMedianReviews,
    has_most_reviews:
      strongest === null || practiceReviewCount === null
        ? null
        : practiceReviewCount >= strongest.count,
    as_of: getOldestDiscoveryTime(competitors),
    practice_profile_strength: null,
    competitor_median_profile_strength: getMedianProfileStrength(competitors),
    weakest_choosable_factor: getWeakestFactor(
      practiceReviewCount,
      competitorMedianReviews,
      reviews.current_rating,
      competitorMedianRating
    ),
  };
}

export class ChoosableMetricsService {
  static async build(
    organizationId: number,
    locationId: number | null,
    reviews: ReviewsMetrics
  ): Promise<ChoosableMetrics> {
    if (locationId === null) return emptyMetrics("not_ready", "missing_location");

    try {
      const location = await LocationModel.findById(locationId);
      if (!location || location.organization_id !== organizationId) {
        return emptyMetrics("not_ready", "location_not_found");
      }

      const onboarding = await LocationCompetitorModel.getOnboardingStatus(locationId);
      if (onboarding.status !== "finalized") {
        return emptyMetrics("not_ready", "competitors_not_finalized");
      }

      const competitors = await LocationCompetitorModel.findActiveByLocationId(locationId);
      if (competitors.length === 0) {
        return emptyMetrics("not_ready", "no_active_competitors");
      }
      return buildReadyMetrics(competitors, reviews);
    } catch (error: unknown) {
      logger.warn(
        { err: error, organizationId, locationId },
        "[dashboard-metrics] Choosable metrics source unavailable"
      );
      return emptyMetrics("unavailable", "query_failed");
    }
  }
}
