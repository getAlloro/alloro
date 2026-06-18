/**
 * User Website — Analytics Service
 *
 * Owner-facing website analytics: Rybbit traffic (slim) and Google Search
 * Console performance. The controller resolves the org's project and shapes the
 * HTTP response; this layer takes a resolved `projectId`, resolves the relevant
 * integration, and returns plain DTOs (including the empty/no-integration
 * states the client renders).
 *
 * Extracted from UserWebsiteController to keep the controller thin.
 */

import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { WebsiteIntegrationModel } from "../../../models/website-builder/WebsiteIntegrationModel";
import {
  getDashboard as getRybbitDashboard,
  fetchRybbitMonthlyUniques,
  fetchRybbitOverview,
  type RybbitMonthlyPoint,
  type RybbitMetricSummary,
} from "../../admin-websites/feature-services/service.rybbit-performance";
import {
  getDashboard as getGscDashboard,
  type GscPerformanceDashboard,
} from "../../admin-websites/feature-services/service.gsc-performance";
import { resolveRybbitTimeZone } from "../../../utils/rybbit/rybbit-time-zone";

const EMPTY_TOTALS = {
  sessions: 0,
  pageviews: 0,
  users: 0,
  bounceRate: 0,
  pagesPerSession: 0,
  sessionDuration: 0,
};

// =====================================================================
// Rybbit traffic (slim) — daily + live-deduped monthly/overview
// =====================================================================

export async function getWebsiteAnalytics(projectId: string, rangeDays: unknown) {
  const integration = await WebsiteIntegrationModel.findByProjectAndPlatform(
    projectId,
    "rybbit"
  );
  if (!integration) {
    return {
      hasIntegration: false as const,
      latestReportDate: null,
      dataDays: 0,
      totals: EMPTY_TOTALS,
      daily: [] as RybbitDashboardDaily,
      monthly: [] as RybbitMonthlyPoint[],
      windowVisitors: null as number | null,
      windowFromDate: null as string | null,
      windowToDate: null as string | null,
    };
  }

  // Stored daily series powers the daily traffic modal + is a safe fallback.
  const dashboard = await getRybbitDashboard(integration, rangeDays, 0, 0);

  // TRUE unique visitors come from live Rybbit queries (deduped per period) —
  // summing the stored daily `users` over-counts repeat visitors by ~10%.
  // Sessions/pageviews are additive, so the stored daily series stays correct.
  // Both live calls fall back to stored values on any failure (see helpers).
  let monthly: RybbitMonthlyPoint[] = [];
  let liveTotals: RybbitMetricSummary | null = null;
  // Deduplicated visitor total for the last-3-month window the overview's
  // bottom Traffic card plots. Summing the per-month uniques double-counts
  // visitors who return across months, so the card needs a single overview
  // query scoped to that window (Rybbit dedupes within the from→to range).
  let windowOverview: RybbitMetricSummary | null = null;
  let windowFromDate: string | null = null;
  if (dashboard.fromDate && dashboard.latestReportDate) {
    const timeZone = resolveRybbitTimeZone(
      await ProjectModel.getRybbitTimeZone(integration.project_id)
    );
    // The card window is the last 3 calendar months ending at the latest
    // report month (first day of two months back → latest report date),
    // matching the "Last 3 mo" the card shows for a typical practice.
    windowFromDate = firstDayOfMonthsBack(dashboard.latestReportDate, 2);
    const [monthlyResult, totalsResult, windowResult] = await Promise.all([
      fetchRybbitMonthlyUniques(
        integration,
        dashboard.fromDate,
        dashboard.latestReportDate,
        timeZone
      ),
      fetchRybbitOverview(
        integration,
        dashboard.fromDate,
        dashboard.latestReportDate,
        timeZone
      ),
      fetchRybbitOverview(
        integration,
        windowFromDate,
        dashboard.latestReportDate,
        timeZone
      ),
    ]);
    monthly = monthlyResult ?? [];
    liveTotals = totalsResult;
    windowOverview = windowResult;
  }

  return {
    hasIntegration: true as const,
    latestReportDate: dashboard.latestReportDate,
    dataDays: dashboard.dataDays,
    totals: liveTotals ?? dashboard.totals,
    daily: dashboard.daily,
    monthly,
    // Deduplicated traffic for the last-3-month card window. Null when the live
    // query failed — the card falls back to the most defensible client value.
    windowVisitors: windowOverview?.users ?? null,
    windowFromDate,
    windowToDate: dashboard.latestReportDate,
  };
}

/**
 * First day (YYYY-MM-DD) of the calendar month `monthsBack` months before the
 * month of `dateString`. e.g. firstDayOfMonthsBack("2026-06-14", 2) → "2026-04-01".
 */
function firstDayOfMonthsBack(dateString: string, monthsBack: number): string {
  const [year, month] = dateString.split("-").map(Number);
  if (!year || !month) return dateString;
  const date = new Date(Date.UTC(year, month - 1 - monthsBack, 1));
  return date.toISOString().split("T")[0];
}

// `daily` is whatever the Rybbit dashboard returns; alias keeps the empty-state
// literal assignable without re-deriving the dashboard's daily element type.
type RybbitDashboardDaily = Awaited<
  ReturnType<typeof getRybbitDashboard>
>["daily"];

// =====================================================================
// Google Search Console performance
// =====================================================================

export interface GscPerformanceResult {
  hasIntegration: boolean;
  dashboard: GscPerformanceDashboard | null;
}

export async function getGscPerformance(
  projectId: string,
  rangeDays: unknown
): Promise<GscPerformanceResult> {
  const integration = await WebsiteIntegrationModel.findByProjectAndPlatform(
    projectId,
    "gsc"
  );
  if (!integration || integration.status !== "active") {
    return { hasIntegration: false, dashboard: null };
  }

  const dashboard = await getGscDashboard(integration, rangeDays);
  return { hasIntegration: true, dashboard };
}
