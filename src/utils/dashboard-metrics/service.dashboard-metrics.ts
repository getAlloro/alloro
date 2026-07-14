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

import { fetchRybbitMonthlyComparison } from "../rybbit/service.rybbit-data";
import { fetchGBPDataForRange } from "../dataAggregation/dataAggregator";
import { GooglePropertyModel } from "../../models/GooglePropertyModel";
import { getValidOAuth2ClientByOrg } from "../../auth/oauth2Helper";
import { DashboardMetrics, DashboardMetricsSchema } from "./types";
import {
  buildReviewsMetrics,
  buildGbpMetrics,
  buildRankingMetrics,
  buildFormSubmissionsMetrics,
  buildPmsMetrics,
  buildReferralMetrics,
} from "./sectionBuilders";
import { ChoosableMetricsService } from "../../controllers/dashboard/feature-services/ChoosableMetricsService";
import logger from "../../lib/logger";
import { weightedAverageRating } from "./metricsHelpers";

// Re-export schema + type for convenience so controllers / orchestrator can
// import both `computeDashboardMetrics` and `DashboardMetricsSchema` from
// this single module.
export { DashboardMetricsSchema } from "./types";
export type { DashboardMetrics } from "./types";

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
      const ratings: Array<{ rating: number; count: number }> = [];
      for (const loc of prevGbp?.locations ?? []) {
        const allTime = loc?.data?.reviews?.allTime;
        const locCount =
          allTime &&
          typeof allTime.totalReviewCount === "number" &&
          Number.isFinite(allTime.totalReviewCount)
            ? allTime.totalReviewCount
            : 0;
        if (
          allTime &&
          typeof allTime.averageRating === "number" &&
          allTime.averageRating > 0
        ) {
          ratings.push({ rating: allTime.averageRating, count: locCount });
        }
      }
      const avg = weightedAverageRating(ratings);
      if (avg !== null) {
        priorRating = { averageRating: avg };
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
  // Choosable (Stage 3) reuses the already-computed `reviews` for the practice
  // side (one source of truth per number — no second GBP fetch).
  const choosable = await ChoosableMetricsService.build(
    orgId,
    locationId,
    reviews
  );

  const result: DashboardMetrics = {
    reviews,
    gbp,
    ranking,
    form_submissions: formSubmissions,
    pms,
    referral,
    choosable,
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
