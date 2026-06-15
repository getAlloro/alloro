import { Request, Response } from "express";
import {
  computeDashboardMetrics,
  DashboardMetricsSchema,
} from "../../utils/dashboard-metrics/service.dashboard-metrics";
import logger from "../../lib/logger";

/**
 * GET /api/dashboard/metrics
 *
 * Thin HTTP wrapper around `computeDashboardMetrics`. Returns the
 * deterministic dashboard metrics dictionary for the calendar month
 * (1st-of-month → today) for the given org/location.
 *
 * Auth: standard authenticated user middleware (mirrors `/api/pms/keyData`).
 *
 * Query params:
 *   - organization_id (required, int)
 *   - location_id     (optional, int)
 *
 * Response: { success: true, data: DashboardMetrics }
 *
 * `reOutput` is passed as `null` here — this endpoint is HTTP-scoped and
 * does not have Referral Engine context. The orchestrator passes a real
 * `reOutput` when it computes metrics in the monthly chain.
 *
 * See plan: plans/04282026-no-ticket-monthly-agents-v2-backend/spec.md (T6)
 */
export async function getMetrics(req: Request, res: Response) {
  try {
    const organizationId = parseInt(String(req.query.organization_id), 10);

    if (!organizationId || isNaN(organizationId)) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid organization_id parameter",
      });
    }

    const locationIdRaw = req.query.location_id
      ? parseInt(String(req.query.location_id), 10)
      : undefined;
    const locationId =
      locationIdRaw !== undefined && !isNaN(locationIdRaw)
        ? locationIdRaw
        : null;

    // Calendar-month range: 1st-of-month (UTC) through today (UTC).
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );
    const startStr = start.toISOString().slice(0, 10);
    const endStr = now.toISOString().slice(0, 10);
    const dateRange = { start: startStr, end: endStr };

    const metrics = await computeDashboardMetrics(
      organizationId,
      locationId,
      dateRange,
      null
    );

    const parsed = DashboardMetricsSchema.safeParse(metrics);
    if (!parsed.success) {
      logger.error({ err: JSON.stringify(parsed.error.flatten()) }, "[dashboard-metrics] Schema validation failed:");
      return res.status(500).json({
        success: false,
        error: "Dashboard metrics failed schema validation",
      });
    }

    return res.json({
      success: true,
      data: parsed.data,
    });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "Error in /dashboard/metrics:");
    return res.status(error?.statusCode || 500).json({
      success: false,
      error: `Failed to fetch dashboard metrics: ${error?.message || "Unknown error"}`,
    });
  }
}
