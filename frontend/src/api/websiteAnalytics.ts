import { apiGet } from "./index";

/**
 * Website Analytics API client (owner-facing Rybbit performance).
 *
 * Wraps `GET /api/user/website/analytics?rangeDays=90`. Auth-derived org
 * context — no orgId in URL, mirroring the `/user/website/form-submissions/stats`
 * pattern. Backend resolves the project's Rybbit integration and reuses the admin
 * Rybbit dashboard service; the card only needs totals + the daily series.
 *
 * Spec: plans/05312026-no-ticket-websites-tab-cards-overview/spec.md (T1/T3).
 */

export interface WebsiteAnalyticsTotals {
  sessions: number;
  pageviews: number;
  users: number;
  bounceRate: number;
  pagesPerSession: number;
  sessionDuration: number;
}

export interface WebsiteAnalyticsDailyPoint extends WebsiteAnalyticsTotals {
  date: string;
}

/** Per-month metrics with TRUE unique visitors (deduped by Rybbit, not summed). */
export interface WebsiteAnalyticsMonthlyPoint extends WebsiteAnalyticsTotals {
  month: string;
}

export interface WebsiteAnalytics {
  hasIntegration: boolean;
  latestReportDate: string | null;
  dataDays: number;
  totals: WebsiteAnalyticsTotals;
  daily: WebsiteAnalyticsDailyPoint[];
  /** True per-month uniques for cards/headline; empty if the live fetch failed. */
  monthly: WebsiteAnalyticsMonthlyPoint[];
}

interface WebsiteAnalyticsResponse extends WebsiteAnalytics {
  success: boolean;
  errorMessage?: string;
}

export async function fetchWebsiteAnalytics(
  rangeDays = 90
): Promise<WebsiteAnalytics> {
  const response = (await apiGet({
    path: `/user/website/analytics?rangeDays=${rangeDays}`,
  })) as WebsiteAnalyticsResponse;

  if (!response?.success) {
    throw new Error(
      response?.errorMessage || "Failed to fetch website analytics"
    );
  }

  return {
    hasIntegration: response.hasIntegration,
    latestReportDate: response.latestReportDate,
    dataDays: response.dataDays,
    totals: response.totals,
    daily: response.daily,
    monthly: response.monthly ?? [],
  };
}
