/**
 * Dashboard Metrics Dictionary — Frontend mirror
 *
 * Mirrors the backend type in `src/utils/dashboard-metrics/types.ts`. Six
 * domains: reviews, gbp, ranking, form_submissions, pms, referral.
 *
 * Backend Plan 1: plans/04282026-no-ticket-monthly-agents-v2-backend/spec.md
 * Frontend Plan 2: plans/04282026-no-ticket-focus-dashboard-frontend/spec.md
 *
 * Wire shape: `GET /api/dashboard/metrics?locationId=Y`
 * returns `{ success: true, data: DashboardMetrics }`. The frontend API
 * client unwraps the envelope before returning.
 *
 * No Zod here — backend validates on emission. Keep this file in sync with
 * the backend type if domains gain or lose fields.
 */

// =====================================================================
// REVIEWS
// =====================================================================

export interface ReviewsMetrics {
  oldest_unanswered_hours: number | null;
  unanswered_count: number;
  current_rating: number | null;
  total_review_count: number | null;
  rating_change_30d: number | null;
  reviews_this_month: number;
}

// =====================================================================
// GBP
// =====================================================================

export interface GbpMetrics {
  days_since_last_post: number | null;
  posts_last_quarter: number;
  call_clicks_last_30d: number | null;
  direction_clicks_last_30d: number | null;
}

// =====================================================================
// RANKING
// =====================================================================

export interface RankingFactorScore {
  name: string;
  score: number;
}

export interface RankingMetrics {
  position: number | null;
  total_competitors: number | null;
  score: number | null;
  lowest_factor: RankingFactorScore | null;
  highest_factor: RankingFactorScore | null;
  score_gap_to_top: number | null;
}

// =====================================================================
// FORM SUBMISSIONS
// =====================================================================

export interface FormSubmissionsMetrics {
  unread_count: number;
  oldest_unread_hours: number | null;
  verified_count: number;
  verified_this_week: number;
  flagged_count: number;
}

// =====================================================================
// PMS
// =====================================================================

export interface PmsMetrics {
  distinct_months: number;
  last_upload_days_ago: number | null;
  missing_months_in_period: string[];
  production_total: number;
  production_change_30d: number | null;
  total_referrals: number;
  doctor_referrals: number;
  self_referrals: number;
  production_this_month: number | null;
  doctor_referrals_this_month: number | null;
  total_referrals_this_month: number | null;
}

// =====================================================================
// REFERRAL (sourced from RE output)
// =====================================================================

export interface ReferralTopDroppingSource {
  name: string;
  drop_pct: number;
  days_since_last: number;
}

export interface ReferralTopGrowingSource {
  name: string;
  growth_pct: number;
}

export interface ReferralMetrics {
  top_dropping_source: ReferralTopDroppingSource | null;
  top_growing_source: ReferralTopGrowingSource | null;
  sources_count: number;
}

// =====================================================================
// CHOOSABLE
// =====================================================================

export type ChoosableSourceStatus = "ready" | "not_ready" | "unavailable";
export type ChoosableSourceReason =
  | "missing_location"
  | "location_not_found"
  | "competitors_not_finalized"
  | "no_active_competitors"
  | "query_failed";

export interface ChoosableMetrics {
  source_status: ChoosableSourceStatus;
  source_reason: ChoosableSourceReason | null;
  has_competitor_set: boolean;
  competitor_count: number;
  practice_review_count: number | null;
  practice_rating: number | null;
  competitor_median_review_count: number | null;
  strongest_competitor_name: string | null;
  strongest_competitor_review_count: number | null;
  competitors_ahead_on_reviews: number | null;
  review_count_gap_to_median: number | null;
  is_at_or_above_review_median: boolean | null;
  has_most_reviews: boolean | null;
  as_of: string | null;
  practice_profile_strength: number | null;
  competitor_median_profile_strength: number | null;
  weakest_choosable_factor: "reviews" | "rating" | null;
}

// =====================================================================
// TOP-LEVEL DICTIONARY
// =====================================================================

export interface DashboardMetrics {
  reviews: ReviewsMetrics;
  gbp: GbpMetrics;
  ranking: RankingMetrics;
  form_submissions: FormSubmissionsMetrics;
  pms: PmsMetrics;
  referral: ReferralMetrics;
  choosable: ChoosableMetrics;
}
