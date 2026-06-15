/**
 * Dashboard Metrics — Section Builders
 *
 * One builder per `DashboardMetrics` domain (reviews, gbp, ranking,
 * form_submissions, pms, referral). Each is best-effort: on a missing
 * data source it returns nulls/zeros and never throws. DB access is via
 * models only; logging is Pino.
 *
 * Extracted verbatim from `service.dashboard-metrics.ts` as a
 * behavior-preserving structural split (file-size ceiling). Logic and
 * return shapes are unchanged.
 */

import { aggregatePmsData } from "../pms/pmsAggregator";
import { compareMonthKeys } from "../pms/monthKey";
import { listLocalPostsInRange } from "../../controllers/gbp/gbp-services/post-handler.service";
import { FormSubmissionModel } from "../../models/website-builder/FormSubmissionModel";
import { PmsJobModel } from "../../models/PmsJobModel";
import { PracticeRankingModel } from "../../models/PracticeRankingModel";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import {
  ReviewsMetrics,
  GbpMetrics,
  RankingMetrics,
  FormSubmissionsMetrics,
  PmsMetrics,
  ReferralMetrics,
} from "./types";
import {
  MS_PER_DAY,
  hoursBetween,
  daysBetween,
  toFiniteNumber,
  safeIso,
  enumerateMonthsInPeriod,
  sumGbpMetricFromTimeSeries,
  extractReviewSummary,
} from "./metricsHelpers";
import logger from "../../lib/logger";

export function buildReviewsMetrics(
  gbpData: any,
  reviewsPriorMonth: { averageRating: number | null }
): ReviewsMetrics {
  const { currentRating, totalReviewCount, reviewsThisMonth, reviewDetails } =
    extractReviewSummary(gbpData);

  const now = new Date();
  let unanswered = 0;
  let oldestUnansweredHours: number | null = null;
  const unansweredNames: string[] = [];
  const windowStars: number[] = [];

  for (const r of reviewDetails) {
    if (typeof r.stars === "number") windowStars.push(r.stars);
    if (r.hasReply) continue;
    unanswered += 1;
    if (r.reviewerName && unansweredNames.length < 5) {
      unansweredNames.push(r.reviewerName);
    }
    const created = r.createdAt ? safeIso(r.createdAt) : null;
    if (created) {
      const ageH = hoursBetween(now, created);
      if (oldestUnansweredHours === null || ageH > oldestUnansweredHours) {
        oldestUnansweredHours = ageH;
      }
    }
  }

  const ratingChange30d =
    currentRating !== null && reviewsPriorMonth.averageRating !== null
      ? Number((currentRating - reviewsPriorMonth.averageRating).toFixed(2))
      : null;

  const avgRatingThisMonth = windowStars.length
    ? Number((windowStars.reduce((a, b) => a + b, 0) / windowStars.length).toFixed(2))
    : null;

  return {
    oldest_unanswered_hours: oldestUnansweredHours,
    unanswered_count: unanswered,
    unanswered_reviewer_names: unansweredNames,
    avg_rating_this_month: avgRatingThisMonth,
    current_rating: currentRating,
    total_review_count: totalReviewCount,
    rating_change_30d: ratingChange30d,
    reviews_this_month: reviewsThisMonth,
  };
}

export async function buildGbpMetrics(
  oauth2Client: any,
  locations: Array<{ accountId: string; locationId: string; displayName: string }>,
  gbpData: any,
  dateRange: { start: string; end: string }
): Promise<GbpMetrics> {
  // Default to nulls if we have no GBP locations / no auth
  if (!locations.length || !oauth2Client) {
    return {
      days_since_last_post: null,
      posts_last_quarter: 0,
      call_clicks_last_30d: sumGbpMetricFromTimeSeries(gbpData, "CALL_CLICKS"),
      direction_clicks_last_30d: sumGbpMetricFromTimeSeries(
        gbpData,
        "BUSINESS_DIRECTION_REQUESTS"
      ),
    };
  }

  // Posts: fetch last 90 days across all locations (best-effort).
  const now = new Date();
  const quarterStart = new Date(now.getTime() - 90 * MS_PER_DAY);
  const quarterStartStr = quarterStart.toISOString().split("T")[0];
  const todayStr = now.toISOString().split("T")[0];

  let postsLastQuarter = 0;
  let mostRecentPostAt: Date | null = null;

  for (const loc of locations) {
    try {
      const posts = await listLocalPostsInRange(
        oauth2Client,
        loc.accountId,
        loc.locationId,
        quarterStartStr,
        todayStr,
        50
      );
      postsLastQuarter += posts.length;
      for (const p of posts) {
        const ct = safeIso(p.createTime);
        if (ct && (mostRecentPostAt === null || ct > mostRecentPostAt)) {
          mostRecentPostAt = ct;
        }
      }
    } catch (err: any) {
      // Non-blocking: log and continue
      logger.warn(
        `[dashboard-metrics] Failed to fetch posts for location ${loc.locationId}: ${
          err?.message || err
        }`
      );
    }
  }

  const daysSinceLastPost =
    mostRecentPostAt !== null ? daysBetween(now, mostRecentPostAt) : null;

  return {
    days_since_last_post: daysSinceLastPost,
    posts_last_quarter: postsLastQuarter,
    call_clicks_last_30d: sumGbpMetricFromTimeSeries(gbpData, "CALL_CLICKS"),
    direction_clicks_last_30d: sumGbpMetricFromTimeSeries(
      gbpData,
      "BUSINESS_DIRECTION_REQUESTS"
    ),
  };
}

export async function buildRankingMetrics(
  orgId: number,
  locationId: number | null
): Promise<RankingMetrics> {
  try {
    const row = await PracticeRankingModel.findLatestCompletedRankingMetrics(
      orgId,
      locationId
    );

    if (!row) {
      return {
        position: null,
        total_competitors: null,
        score: null,
        lowest_factor: null,
        highest_factor: null,
        score_gap_to_top: null,
      };
    }

    const score = toFiniteNumber(row.rank_score);
    const position =
      row.rank_position !== null && row.rank_position !== undefined
        ? Number(row.rank_position)
        : null;
    const totalCompetitors =
      row.total_competitors !== null && row.total_competitors !== undefined
        ? Number(row.total_competitors)
        : null;

    // ranking_factors is jsonb. May come back as object (auto) or string.
    let factors: Record<string, unknown> = {};
    const raw = row.ranking_factors;
    if (raw && typeof raw === "object") {
      factors = raw as Record<string, unknown>;
    } else if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          factors = parsed as Record<string, unknown>;
        }
      } catch {
        factors = {};
      }
    }

    const factorEntries: Array<{ name: string; score: number }> = [];
    for (const [name, val] of Object.entries(factors)) {
      let s: number | null = null;
      if (val && typeof val === "object" && "score" in (val as object)) {
        const inner = (val as { score?: unknown }).score;
        s = typeof inner === "number" && Number.isFinite(inner) ? inner : null;
      } else if (typeof val === "number" && Number.isFinite(val)) {
        s = val;
      }
      if (s !== null) factorEntries.push({ name, score: s });
    }

    let lowestFactor: { name: string; score: number } | null = null;
    let highestFactor: { name: string; score: number } | null = null;
    for (const f of factorEntries) {
      if (lowestFactor === null || f.score < lowestFactor.score) lowestFactor = f;
      if (highestFactor === null || f.score > highestFactor.score) highestFactor = f;
    }

    // score_gap_to_top: if we can compute the top competitor's score for the same batch.
    // Cheap proxy: 100 - score (assuming rank_score is 0-100). If score is null, leave null.
    const scoreGapToTop = score !== null ? Number((100 - score).toFixed(2)) : null;

    return {
      position,
      total_competitors: totalCompetitors,
      score,
      lowest_factor: lowestFactor,
      highest_factor: highestFactor,
      score_gap_to_top: scoreGapToTop,
    };
  } catch (err: any) {
    logger.warn(
      `[dashboard-metrics] Ranking metrics failed for org ${orgId}: ${
        err?.message || err
      }`
    );
    return {
      position: null,
      total_competitors: null,
      score: null,
      lowest_factor: null,
      highest_factor: null,
      score_gap_to_top: null,
    };
  }
}

export async function buildFormSubmissionsMetrics(
  orgId: number
): Promise<FormSubmissionsMetrics> {
  try {
    const project = await ProjectModel.findByOrganizationId(orgId);
    if (!project) {
      return {
        unread_count: 0,
        oldest_unread_hours: null,
        verified_count: 0,
        verified_this_week: 0,
        flagged_count: 0,
      };
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * MS_PER_DAY);

    const [
      unread,
      flagged,
      verified,
      verifiedThisWeek,
      oldestUnreadRow,
    ] = await Promise.all([
      FormSubmissionModel.countUnreadByProjectId(project.id),
      FormSubmissionModel.countFlaggedByProjectId(project.id),
      FormSubmissionModel.countVerifiedByProjectId(project.id),
      FormSubmissionModel.countVerifiedSinceByProjectId(project.id, weekAgo),
      FormSubmissionModel.findOldestUnreadSubmittedAt(project.id),
    ]);

    let oldestUnreadHours: number | null = null;
    if (oldestUnreadRow?.submitted_at) {
      const submittedAt =
        oldestUnreadRow.submitted_at instanceof Date
          ? oldestUnreadRow.submitted_at
          : new Date(oldestUnreadRow.submitted_at as string);
      if (!Number.isNaN(submittedAt.getTime())) {
        oldestUnreadHours = hoursBetween(now, submittedAt);
      }
    }

    return {
      unread_count: unread,
      oldest_unread_hours: oldestUnreadHours,
      verified_count: verified,
      verified_this_week: verifiedThisWeek,
      flagged_count: flagged,
    };
  } catch (err: any) {
    logger.warn(
      `[dashboard-metrics] Form submission metrics failed for org ${orgId}: ${
        err?.message || err
      }`
    );
    return {
      unread_count: 0,
      oldest_unread_hours: null,
      verified_count: 0,
      verified_this_week: 0,
      flagged_count: 0,
    };
  }
}

export async function buildPmsMetrics(
  orgId: number,
  locationId: number | null,
  dateRange: { start: string; end: string }
): Promise<PmsMetrics> {
  try {
    const aggregated = await aggregatePmsData(
      orgId,
      locationId ?? undefined
    );

    const distinctMonths = aggregated.months.length;

    // Last upload: most-recent pms_jobs.timestamp for this org (+ optional location).
    let lastUploadDaysAgo: number | null = null;
    const lastUpload = await PmsJobModel.findLastApprovedUploadTimestamp(
      orgId,
      locationId
    );
    if (lastUpload?.timestamp) {
      const ts =
        lastUpload.timestamp instanceof Date
          ? lastUpload.timestamp
          : new Date(lastUpload.timestamp as string);
      if (!Number.isNaN(ts.getTime())) {
        lastUploadDaysAgo = daysBetween(new Date(), ts);
      }
    }

    // Missing months in period: enumerate [start..end] and diff against PMS months.
    const expectedMonths = enumerateMonthsInPeriod(
      dateRange.start,
      dateRange.end
    );
    const presentMonths = new Set(aggregated.months.map((m) => m.month));
    const missingMonthsInPeriod = expectedMonths.filter(
      (m) => !presentMonths.has(m)
    );

    // Production change 30d: compare last month vs prior month within aggregated months.
    let productionChange30d: number | null = null;
    if (aggregated.months.length >= 2) {
      // Chronological — labeled month keys ("Apr 2026") sort alphabetically
      // with localeCompare, which compared the wrong month pair (+0% deltas).
      const sorted = [...aggregated.months].sort((a, b) =>
        compareMonthKeys(a.month, b.month)
      );
      const last = sorted[sorted.length - 1];
      const prev = sorted[sorted.length - 2];
      if (prev.productionTotal > 0) {
        productionChange30d = Number(
          (
            ((last.productionTotal - prev.productionTotal) /
              prev.productionTotal) *
            100
          ).toFixed(2)
        );
      }
    }

    // Aggregate referral splits across all months.
    let totalReferrals = 0;
    let doctorReferrals = 0;
    let selfReferrals = 0;
    for (const m of aggregated.months) {
      totalReferrals += m.totalReferrals;
      doctorReferrals += m.doctorReferrals;
      selfReferrals += m.selfReferrals;
    }

    // Extract current (latest) month values for grounding monthly claims.
    const sortedMonths = [...aggregated.months].sort((a, b) =>
      compareMonthKeys(a.month, b.month)
    );
    const latestMonth = sortedMonths.length > 0 ? sortedMonths[sortedMonths.length - 1] : null;

    return {
      distinct_months: distinctMonths,
      last_upload_days_ago: lastUploadDaysAgo,
      missing_months_in_period: missingMonthsInPeriod,
      production_total: Number(aggregated.totals.totalProduction.toFixed(2)),
      production_change_30d: productionChange30d,
      total_referrals: Number(totalReferrals.toFixed(2)),
      doctor_referrals: Number(doctorReferrals.toFixed(2)),
      self_referrals: Number(selfReferrals.toFixed(2)),
      production_this_month: latestMonth ? Number(latestMonth.productionTotal.toFixed(2)) : null,
      doctor_referrals_this_month: latestMonth ? latestMonth.doctorReferrals : null,
      total_referrals_this_month: latestMonth ? latestMonth.totalReferrals : null,
    };
  } catch (err: any) {
    logger.warn(
      `[dashboard-metrics] PMS metrics failed for org ${orgId}: ${
        err?.message || err
      }`
    );
    return {
      distinct_months: 0,
      last_upload_days_ago: null,
      missing_months_in_period: [],
      production_total: 0,
      production_change_30d: null,
      total_referrals: 0,
      doctor_referrals: 0,
      self_referrals: 0,
      production_this_month: null,
      doctor_referrals_this_month: null,
      total_referrals_this_month: null,
    };
  }
}

export function buildReferralMetrics(reOutput: any | null): ReferralMetrics {
  if (!reOutput) {
    return {
      top_dropping_source: null,
      top_growing_source: null,
      sources_count: 0,
    };
  }

  const nonDoctor = Array.isArray(reOutput.non_doctor_referral_matrix)
    ? reOutput.non_doctor_referral_matrix
    : [];
  const doctor = Array.isArray(reOutput.doctor_referral_matrix)
    ? reOutput.doctor_referral_matrix
    : [];

  // Sources count = unique non-doctor sources + doctor referrers.
  const sourcesCount = nonDoctor.length + doctor.length;

  // Top dropping: pick the row labeled "decreasing" with the largest
  // referral count (proxy for biggest revenue impact). Drop_pct is a
  // best-effort estimate — RE doesn't expose a delta directly, so we
  // conservatively use 0 when we can't infer it. days_since_last is
  // similarly unavailable from RE; default 0.
  let topDropping: { name: string; drop_pct: number; days_since_last: number } | null = null;
  const decreasingRows = [...nonDoctor, ...doctor].filter(
    (r: any) => r?.trend_label === "decreasing" || r?.trend_label === "dormant"
  );
  if (decreasingRows.length) {
    const sorted = decreasingRows.sort(
      (a: any, b: any) => (b.referred ?? 0) - (a.referred ?? 0)
    );
    const top = sorted[0];
    topDropping = {
      name: top.source_label ?? top.referrer_name ?? "Unknown",
      drop_pct: 0,
      days_since_last: 0,
    };
  }

  let topGrowing: { name: string; growth_pct: number } | null = null;
  const growingRows = [...nonDoctor, ...doctor].filter(
    (r: any) => r?.trend_label === "increasing" || r?.trend_label === "new"
  );
  if (growingRows.length) {
    const sorted = growingRows.sort(
      (a: any, b: any) => (b.referred ?? 0) - (a.referred ?? 0)
    );
    const top = sorted[0];
    topGrowing = {
      name: top.source_label ?? top.referrer_name ?? "Unknown",
      growth_pct: 0,
    };
  }

  return {
    top_dropping_source: topDropping,
    top_growing_source: topGrowing,
    sources_count: sourcesCount,
  };
}
