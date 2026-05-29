import { apiGet } from "./index";

/**
 * Form Submissions Timeseries API client
 *
 * Wraps `GET /api/user/website/form-submissions/timeseries?range=12m|6m|3m`
 * (Plan 1 backend). Auth-derived org context — no orgId in URL, mirroring
 * the existing `/user/website/form-submissions/stats` pattern.
 *
 * Backend envelope: `{ success: true, data: TimeseriesPoint[] }`.
 *
 * Spec: plans/04282026-no-ticket-focus-dashboard-frontend/spec.md (T9)
 */

export interface TimeseriesPoint {
  month: string;
  total: number;
  verified: number;
  unread: number;
  flagged: number;
  blocked: number;
}

interface TimeseriesResponse {
  success: boolean;
  data?: TimeseriesPoint[];
  errorMessage?: string;
}

export async function fetchFormSubmissionsTimeseries(
  range: "3m" | "6m" | "12m" = "12m"
): Promise<TimeseriesPoint[]> {
  const response = (await apiGet({
    path: `/user/website/form-submissions/timeseries?range=${range}`,
  })) as TimeseriesResponse;

  if (!response?.success || !response.data) {
    throw new Error(
      response?.errorMessage || "Failed to fetch form submissions timeseries"
    );
  }

  return response.data;
}
