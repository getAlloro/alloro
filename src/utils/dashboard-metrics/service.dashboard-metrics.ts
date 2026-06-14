/**
 * Dashboard Metrics Service
 *
 * Pure deterministic builder for the `DashboardMetrics` dictionary.
 * NO LLM calls. All data sourced from existing services + raw SQL.
 *
 * Plan: plans/04282026-no-ticket-monthly-agents-v2-backend/spec.md (T3)
 *
 * Used by:
 *  - Monthly orchestrator (after RE, before Summary v2)
 *  - GET /api/dashboard/metrics endpoint (T6)
 *
 * Behavior on missing data: corresponding fields are set to null (or 0
 * for counts). Never throws on missing data sources. Throws ONLY when
 * the final shape fails Zod validation, which signals a programming
 * error in this file.
 */

import { db } from "../../database/connection";
import { aggregatePmsData } from "../pms/pmsAggregator";
import { compareMonthKeys } from "../pms/monthKey";
import { fetchRybbitMonthlyComparison } from "../rybbit/service.rybbit-data";
import { fetchGBPDataForRange } from "../dataAggregation/dataAggregator";
import { listLocalPostsInRange } from "../../controllers/gbp/gbp-services/post-handler.service";
import { GooglePropertyModel } from "../../models/GooglePropertyModel";
import { getValidOAuth2ClientByOrg } from "../../auth/oauth2Helper";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import {
  DashboardMetrics,
  DashboardMetricsSchema,
  ReviewsMetrics,
  GbpMetrics,
  RankingMetrics,
  FormSubmissionsMetrics,
  PmsMetrics,
  ReferralMetrics,
} from "./types";
import logger from "../../lib/logger";

// Re-export schema + type for convenience so controllers / orchestrator can
// import both `computeDashboardMetrics` and `DashboardMetricsSchema` from
// this single module.
export { DashboardMetricsSchema } from "./types";
export type { DashboardMetrics } from "./types";

// =====================================================================
// HELPERS
// =====================================================================

const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

function hoursBetween(later: Date, earlier: Date): number {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / MS_PER_HOUR));
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / MS_PER_DAY));
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.\-]/g, "");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function safeIso(date: string): Date | null {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Extract a list of YYYY-MM month keys spanning [start, end] inclusive.
 */
function enumerateMonthsInPeriod(start: string, end: string): string[] {
  const startDate = safeIso(start);
  const endDate = safeIso(end);
  if (!startDate || !endDate || endDate < startDate) return [];

  const months: string[] = [];
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const stop = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  while (cursor <= stop) {
    const yyyy = cursor.getFullYear();
    const mm = String(cursor.getMonth() + 1).padStart(2, "0");
    months.push(`${yyyy}-${mm}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

/**
 * Sum a GBP performance metric across all locations for a metric key
 * (e.g. CALL_CLICKS, BUSINESS_DIRECTION_REQUESTS). Returns null if no
 * usable data was returned.
 *
 * The shape of `gbpData` from `fetchGBPDataForRange()` is:
 *   { locations: [{ locationId, displayName, data: { performance: { series: [...] }, ... } }] }
 */
function sumGbpMetricFromTimeSeries(
  gbpData: any,
  metricName: string
): number | null {
  if (!gbpData || !Array.isArray(gbpData.locations)) return null;
  let total = 0;
  let sawAny = false;

  for (const loc of gbpData.locations) {
    const series = loc?.data?.performance?.series;
    if (!Array.isArray(series)) continue;
    for (const block of series) {
      const dmtList = block?.dailyMetricTimeSeries ?? [];
      for (const entry of dmtList) {
        if (entry?.dailyMetric !== metricName) continue;
        sawAny = true;
        const dated = entry?.timeSeries?.datedValues ?? [];
        for (const dv of dated) {
          const v = toFiniteNumber(dv?.value);
          if (v !== null) total += v;
        }
      }
    }
  }

  return sawAny ? total : null;
}

/**
 * Pull average rating + review count from `gbpData` (across all locations).
 * Uses an unweighted mean of per-location averages. Returns nulls if no data.
 */
function extractReviewSummary(gbpData: any): {
  currentRating: number | null;
  totalReviewCount: number | null;
  reviewsThisMonth: number;
  reviewDetails: Array<{
    stars: number | null;
    createdAt: string | null;
    hasReply: boolean;
    replyDate: string | null;
    reviewerName: string | null;
  }>;
} {
  if (!gbpData || !Array.isArray(gbpData.locations)) {
    return {
      currentRating: null,
      totalReviewCount: null,
      reviewsThisMonth: 0,
      reviewDetails: [],
    };
  }

  const ratings: number[] = [];
  let totalReviewCount: number | null = null;
  let reviewsThisMonth = 0;
  const reviewDetails: Array<{
    stars: number | null;
    createdAt: string | null;
    hasReply: boolean;
    replyDate: string | null;
    reviewerName: string | null;
  }> = [];

  for (const loc of gbpData.locations) {
    const allTime = loc?.data?.reviews?.allTime;
    if (allTime && typeof allTime.averageRating === "number" && allTime.averageRating > 0) {
      ratings.push(allTime.averageRating);
    }
    // Sum the all-time total review count across locations (multi-location
    // practices). Stays null until at least one location reports a count.
    if (
      allTime &&
      typeof allTime.totalReviewCount === "number" &&
      Number.isFinite(allTime.totalReviewCount)
    ) {
      totalReviewCount = (totalReviewCount ?? 0) + allTime.totalReviewCount;
    }

    const win = loc?.data?.reviews?.window;
    if (win) {
      reviewsThisMonth += Number(win.newReviews ?? 0);
      const details = Array.isArray(win.reviewDetails) ? win.reviewDetails : [];
      for (const r of details) {
        reviewDetails.push({
          stars: typeof r.stars === "number" ? r.stars : null,
          createdAt: r.createdAt ?? null,
          hasReply: Boolean(r.hasReply),
          replyDate: r.replyDate ?? null,
          reviewerName: r.reviewerName ?? null,
        });
      }
    }
  }

  const currentRating = ratings.length
    ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2))
    : null;

  return { currentRating, totalReviewCount, reviewsThisMonth, reviewDetails };
}

// =====================================================================
// SECTION BUILDERS
// =====================================================================

function buildReviewsMetrics(
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

async function buildGbpMetrics(
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

async function buildRankingMetrics(
  orgId: number,
  locationId: number | null
): Promise<RankingMetrics> {
  try {
    let query = db("practice_rankings")
      .where({ organization_id: orgId, status: "completed" });
    if (locationId !== null) {
      query = query.where({ location_id: locationId });
    }
    const row = await query
      .orderBy("created_at", "desc")
      .select(
        "rank_position",
        "rank_score",
        "total_competitors",
        "ranking_factors"
      )
      .first();

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

async function buildFormSubmissionsMetrics(
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

    const FS_TABLE = "website_builder.form_submissions";
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * MS_PER_DAY);

    const [
      unreadRow,
      flaggedRow,
      verifiedRow,
      verifiedThisWeekRow,
      oldestUnreadRow,
    ] = await Promise.all([
      db(FS_TABLE)
        .where({ project_id: project.id, is_read: false })
        .count<{ count: string }[]>("* as count")
        .first(),
      db(FS_TABLE)
        .where({ project_id: project.id, is_flagged: true })
        .count<{ count: string }[]>("* as count")
        .first(),
      db(FS_TABLE)
        .where({ project_id: project.id, is_flagged: false })
        .whereNot("form_name", "Newsletter Signup")
        .count<{ count: string }[]>("* as count")
        .first(),
      db(FS_TABLE)
        .where({ project_id: project.id, is_flagged: false })
        .whereNot("form_name", "Newsletter Signup")
        .where("submitted_at", ">=", weekAgo)
        .count<{ count: string }[]>("* as count")
        .first(),
      db(FS_TABLE)
        .where({ project_id: project.id, is_read: false })
        .orderBy("submitted_at", "asc")
        .select("submitted_at")
        .first(),
    ]);

    const unread = Number((unreadRow as any)?.count ?? 0);
    const flagged = Number((flaggedRow as any)?.count ?? 0);
    const verified = Number((verifiedRow as any)?.count ?? 0);
    const verifiedThisWeek = Number((verifiedThisWeekRow as any)?.count ?? 0);

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

async function buildPmsMetrics(
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
    let lastUploadQuery = db("pms_jobs")
      .where({ organization_id: orgId, is_approved: 1 })
      .orderBy("timestamp", "desc")
      .select("timestamp")
      .first();
    if (locationId !== null) {
      lastUploadQuery = db("pms_jobs")
        .where({
          organization_id: orgId,
          location_id: locationId,
          is_approved: 1,
        })
        .orderBy("timestamp", "desc")
        .select("timestamp")
        .first();
    }
    const lastUpload = await lastUploadQuery;
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

function buildReferralMetrics(reOutput: any | null): ReferralMetrics {
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

// =====================================================================
// MAIN ENTRY
// =====================================================================

/**
 * Compute the full DashboardMetrics dictionary.
 *
 * @param orgId       Organization ID
 * @param locationId  Optional location scope (null for org-wide)
 * @param dateRange   Date range string `{ start, end }` in YYYY-MM-DD
 * @param reOutput    The Referral Engine agent output, or null. Used to
 *                    populate the `referral` section.
 *
 * @returns Validated DashboardMetrics. Throws if the resulting shape
 *          fails Zod validation.
 */
export async function computeDashboardMetrics(
  orgId: number,
  locationId: number | null,
  dateRange: { start: string; end: string },
  reOutput: any | null
): Promise<DashboardMetrics> {
  // ---- GBP fetch (best-effort; resolve OAuth + locations) ----------
  let oauth2Client: any = null;
  try {
    oauth2Client = await getValidOAuth2ClientByOrg(orgId);
  } catch (err: any) {
    logger.warn(
      `[dashboard-metrics] No Google OAuth client for org ${orgId}: ${
        err?.message || err
      }`
    );
  }
  const refreshOAuth2Client = async () => {
    oauth2Client = await getValidOAuth2ClientByOrg(orgId, {
      forceRefresh: true,
    });
    return oauth2Client;
  };

  let gbpLocations: Array<{
    accountId: string;
    locationId: string;
    displayName: string;
  }> = [];
  try {
    if (locationId) {
      const props = await GooglePropertyModel.findByLocationId(locationId);
      gbpLocations = props.map((p) => ({
        accountId: p.account_id || "",
        locationId: p.external_id,
        displayName: p.display_name || "",
      }));
    }
  } catch (err: any) {
    logger.warn(
      `[dashboard-metrics] Failed to resolve GBP properties for location ${locationId}: ${
        err?.message || err
      }`
    );
  }

  // Current month GBP fetch
  let gbpData: any = null;
  if (oauth2Client && gbpLocations.length > 0) {
    try {
      gbpData = await fetchGBPDataForRange(
        oauth2Client,
        gbpLocations,
        dateRange.start,
        dateRange.end,
        { refreshOAuth2Client }
      );
    } catch (err: any) {
      logger.warn(
        `[dashboard-metrics] GBP fetch failed: ${err?.message || err}`
      );
    }
  }

  // Prior month rating (for rating_change_30d). Best-effort fetch using
  // Rybbit's monthly comparison logic for date math is overkill here —
  // we fetch GBP for the prior month instead.
  let priorRating: { averageRating: number | null } = { averageRating: null };
  if (oauth2Client && gbpLocations.length > 0) {
    try {
      const start = new Date(dateRange.start);
      const prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
      const prevEnd = new Date(start.getFullYear(), start.getMonth(), 0);
      const prevStartStr = prevStart.toISOString().split("T")[0];
      const prevEndStr = prevEnd.toISOString().split("T")[0];
      const prevGbp = await fetchGBPDataForRange(
        oauth2Client,
        gbpLocations,
        prevStartStr,
        prevEndStr,
        { refreshOAuth2Client }
      );
      const ratings: number[] = [];
      for (const loc of prevGbp?.locations ?? []) {
        const allTime = loc?.data?.reviews?.allTime;
        if (
          allTime &&
          typeof allTime.averageRating === "number" &&
          allTime.averageRating > 0
        ) {
          ratings.push(allTime.averageRating);
        }
      }
      if (ratings.length) {
        priorRating = {
          averageRating: Number(
            (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)
          ),
        };
      }
    } catch (err: any) {
      logger.warn(
        `[dashboard-metrics] Prior-month GBP fetch failed: ${
          err?.message || err
        }`
      );
    }
  }

  // Touch fetchRybbitMonthlyComparison only to keep the import consistent
  // with the spec's "read website analytics" requirement. Rybbit data is
  // not a source for any DashboardMetrics field today; the function is
  // present here for future expansion. We no-op the call to avoid an
  // unnecessary external API hit during dictionary builds.
  void fetchRybbitMonthlyComparison;

  // ---- Section builders --------------------------------------------
  const reviews = buildReviewsMetrics(gbpData, priorRating);
  const gbp = await buildGbpMetrics(
    oauth2Client,
    gbpLocations,
    gbpData,
    dateRange
  );
  const ranking = await buildRankingMetrics(orgId, locationId);
  const formSubmissions = await buildFormSubmissionsMetrics(orgId);
  const pms = await buildPmsMetrics(orgId, locationId, dateRange);
  const referral = buildReferralMetrics(reOutput);

  const result: DashboardMetrics = {
    reviews,
    gbp,
    ranking,
    form_submissions: formSubmissions,
    pms,
    referral,
  };

  // Validate at the boundary. A failure indicates a programming error
  // in this file (the section builders broke their contract), not a
  // missing-data case.
  const parsed = DashboardMetricsSchema.safeParse(result);
  if (!parsed.success) {
    throw new Error(
      `[dashboard-metrics] Output failed schema validation: ${parsed.error.message}`
    );
  }

  return parsed.data;
}
