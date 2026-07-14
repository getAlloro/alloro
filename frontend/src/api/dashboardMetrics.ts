import { apiGet, unwrap } from "./index";
import type { DashboardMetrics } from "../types/dashboardMetrics";

/**
 * Dashboard Metrics API client
 *
 * Wraps `GET /api/dashboard/metrics` (Plan 1 backend).
 * Backend envelope: `{ success: true, data: DashboardMetrics }`.
 * This helper unwraps the envelope and returns `data` directly.
 *
 * Spec: plans/04282026-no-ticket-focus-dashboard-frontend/spec.md (T9)
 */

export async function fetchDashboardMetrics(
  _organizationId: number,
  locationId: number | null
): Promise<DashboardMetrics> {
  if (locationId === null) {
    throw new Error("A location is required to fetch dashboard metrics.");
  }

  const params = new URLSearchParams();
  params.set("locationId", String(locationId));

  const response = await apiGet({
    path: `/dashboard/metrics?${params.toString()}`,
  });
  return unwrap<DashboardMetrics>(response);
}
