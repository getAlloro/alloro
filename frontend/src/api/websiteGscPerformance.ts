import { apiGet } from "./index";

/**
 * Website Search Console performance API client (owner-facing GSC keywords).
 *
 * Wraps `GET /api/user/website/gsc/performance?rangeDays=90`. Auth-derived org
 * context — no orgId/projectId in the URL, mirroring `websiteAnalytics.ts`
 * (Rybbit). The backend resolves the project's GSC integration and reuses the
 * admin GSC dashboard service; this client only surfaces the trimmed,
 * client-facing slice (totals + daily trend + top queries/pages).
 *
 * Spec: plans/06112026-client-dashboard-gsc-keywords/spec.html (T2).
 */

export interface GscMetricSummary {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscDailyPoint extends GscMetricSummary {
  date: string;
  sourceRows: number;
}

export interface GscDimensionRow extends GscMetricSummary {
  /** Query string, page URL, country code, or device type. */
  key: string;
}

/** Mirrors the backend `GscPerformanceDashboard` (service.gsc-performance.ts). */
export interface GscPerformanceDashboard {
  rangeDays: number;
  fromDate: string | null;
  toDate: string | null;
  latestReportDate: string | null;
  earliestReportDate: string | null;
  dataDays: number;
  totals: GscMetricSummary;
  daily: GscDailyPoint[];
  topQueries: GscDimensionRow[];
  topPages: GscDimensionRow[];
  topCountries: GscDimensionRow[];
  topDevices: GscDimensionRow[];
  limitations: string[];
}

export interface WebsiteGscPerformance {
  hasIntegration: boolean;
  dashboard: GscPerformanceDashboard | null;
}

interface WebsiteGscPerformanceResponse extends WebsiteGscPerformance {
  success: boolean;
  errorMessage?: string;
}

export async function fetchWebsiteGscPerformance(
  rangeDays = 90
): Promise<WebsiteGscPerformance> {
  const response = (await apiGet({
    path: `/user/website/gsc/performance?rangeDays=${rangeDays}`,
  })) as WebsiteGscPerformanceResponse;

  if (!response?.success) {
    throw new Error(
      response?.errorMessage || "Failed to fetch Search Console performance"
    );
  }

  return {
    hasIntegration: response.hasIntegration,
    dashboard: response.dashboard ?? null,
  };
}
