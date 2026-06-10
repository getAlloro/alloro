/**
 * Dashboard Metrics Dictionary — Types + Zod
 *
 * The deterministic metrics dictionary produced by
 * `service.dashboard-metrics.ts`. Six domains: reviews, gbp, ranking,
 * form_submissions, pms, referral.
 *
 * Plan: plans/04282026-no-ticket-monthly-agents-v2-backend/spec.md
 *
 * Used by:
 *  - Summary v2 input (Chief-of-Staff agent picks dictionary keys for
 *    `supporting_metrics[*].source_field`)
 *  - GET /api/dashboard/metrics endpoint
 *
 * The dotted-path keys here ARE the legal `source_field` values for
 * Summary v2's `SupportingMetricSchema` post-Zod validator hook.
 */

import { z } from "zod";

// =====================================================================
// REVIEWS
// =====================================================================

export interface ReviewsMetrics {
  oldest_unanswered_hours: number | null;
  unanswered_count: number;
  unanswered_reviewer_names: string[];
  avg_rating_this_month: number | null;
  current_rating: number | null;
  total_review_count: number | null;
  rating_change_30d: number | null;
  reviews_this_month: number;
}

export const ReviewsMetricsSchema = z.object({
  oldest_unanswered_hours: z.number().nullable(),
  unanswered_count: z.number(),
  unanswered_reviewer_names: z.array(z.string()).max(5),
  avg_rating_this_month: z.number().nullable(),
  current_rating: z.number().nullable(),
  total_review_count: z.number().nullable(),
  rating_change_30d: z.number().nullable(),
  reviews_this_month: z.number(),
});

// =====================================================================
// GBP
// =====================================================================

export interface GbpMetrics {
  days_since_last_post: number | null;
  posts_last_quarter: number;
  call_clicks_last_30d: number | null;
  direction_clicks_last_30d: number | null;
}

export const GbpMetricsSchema = z.object({
  days_since_last_post: z.number().nullable(),
  posts_last_quarter: z.number(),
  call_clicks_last_30d: z.number().nullable(),
  direction_clicks_last_30d: z.number().nullable(),
});

// =====================================================================
// RANKING
// =====================================================================

export interface RankingFactorScore {
  name: string;
  score: number;
}

export const RankingFactorScoreSchema = z.object({
  name: z.string(),
  score: z.number(),
});

export interface RankingMetrics {
  position: number | null;
  total_competitors: number | null;
  score: number | null;
  lowest_factor: RankingFactorScore | null;
  highest_factor: RankingFactorScore | null;
  score_gap_to_top: number | null;
}

export const RankingMetricsSchema = z.object({
  position: z.number().nullable(),
  total_competitors: z.number().nullable(),
  score: z.number().nullable(),
  lowest_factor: RankingFactorScoreSchema.nullable(),
  highest_factor: RankingFactorScoreSchema.nullable(),
  score_gap_to_top: z.number().nullable(),
});

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

export const FormSubmissionsMetricsSchema = z.object({
  unread_count: z.number(),
  oldest_unread_hours: z.number().nullable(),
  verified_count: z.number(),
  verified_this_week: z.number(),
  flagged_count: z.number(),
});

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

export const PmsMetricsSchema = z.object({
  distinct_months: z.number(),
  last_upload_days_ago: z.number().nullable(),
  missing_months_in_period: z.array(z.string()),
  production_total: z.number(),
  production_change_30d: z.number().nullable(),
  total_referrals: z.number(),
  doctor_referrals: z.number(),
  self_referrals: z.number(),
  production_this_month: z.number().nullable(),
  doctor_referrals_this_month: z.number().nullable(),
  total_referrals_this_month: z.number().nullable(),
});

// =====================================================================
// REFERRAL (sourced from RE output)
// =====================================================================

export interface ReferralTopDroppingSource {
  name: string;
  drop_pct: number;
  days_since_last: number;
}

export const ReferralTopDroppingSourceSchema = z.object({
  name: z.string(),
  drop_pct: z.number(),
  days_since_last: z.number(),
});

export interface ReferralTopGrowingSource {
  name: string;
  growth_pct: number;
}

export const ReferralTopGrowingSourceSchema = z.object({
  name: z.string(),
  growth_pct: z.number(),
});

export interface ReferralMetrics {
  top_dropping_source: ReferralTopDroppingSource | null;
  top_growing_source: ReferralTopGrowingSource | null;
  sources_count: number;
}

export const ReferralMetricsSchema = z.object({
  top_dropping_source: ReferralTopDroppingSourceSchema.nullable(),
  top_growing_source: ReferralTopGrowingSourceSchema.nullable(),
  sources_count: z.number(),
});

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
}

export const DashboardMetricsSchema = z
  .object({
    reviews: ReviewsMetricsSchema,
    gbp: GbpMetricsSchema,
    ranking: RankingMetricsSchema,
    form_submissions: FormSubmissionsMetricsSchema,
    pms: PmsMetricsSchema,
    referral: ReferralMetricsSchema,
  })
  .strict();

export type DashboardMetricsZ = z.infer<typeof DashboardMetricsSchema>;
