import { Request, Response } from "express";
import { LocationScopedRequest } from "../../middleware/rbac";
import logger from "../../lib/logger";
import {
  computeDashboardMetrics,
  DashboardMetricsSchema,
} from "../../utils/dashboard-metrics/service.dashboard-metrics";
import { DashboardMetricsError } from "./feature-utils/DashboardMetricsError";
import {
  handleDashboardMetricsError,
  ok,
} from "./feature-utils/controllerResponses";

type DashboardContext = {
  organizationId: number;
  locationId: number;
};

function getDashboardContext(req: Request): DashboardContext {
  const scopedRequest = req as LocationScopedRequest;
  const { organizationId, locationId, accessibleLocationIds } = scopedRequest;

  if (!organizationId) {
    throw new DashboardMetricsError(
      "DASHBOARD_CONTEXT_MISSING",
      "Organization context is required."
    );
  }
  if (!accessibleLocationIds) {
    throw new DashboardMetricsError(
      "DASHBOARD_LOCATION_SCOPE_UNAVAILABLE",
      "Location access could not be verified."
    );
  }
  if (typeof locationId !== "number") {
    throw new DashboardMetricsError(
      "DASHBOARD_LOCATION_REQUIRED",
      "A valid locationId is required."
    );
  }
  if (!accessibleLocationIds.includes(locationId)) {
    throw new DashboardMetricsError(
      "DASHBOARD_LOCATION_ACCESS_DENIED",
      "No access to this location."
    );
  }

  return { organizationId, locationId };
}

function getCurrentMonthDateRange(now = new Date()): {
  start: string;
  end: string;
} {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  return {
    start: start.toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
  };
}

/** GET /api/dashboard/metrics — deterministic metrics for one scoped location. */
export async function getMetrics(req: Request, res: Response): Promise<Response> {
  try {
    const context = getDashboardContext(req);
    const metrics = await computeDashboardMetrics(
      context.organizationId,
      context.locationId,
      getCurrentMonthDateRange(),
      null
    );
    const parsed = DashboardMetricsSchema.safeParse(metrics);

    if (!parsed.success) {
      logger.error(
        {
          organizationId: context.organizationId,
          locationId: context.locationId,
          validation: parsed.error.flatten(),
        },
        "[dashboard-metrics] Schema validation failed"
      );
      throw new DashboardMetricsError(
        "DASHBOARD_METRICS_SCHEMA_INVALID",
        "Dashboard metrics are temporarily unavailable."
      );
    }

    return ok(res, parsed.data);
  } catch (error: unknown) {
    const scopedRequest = req as LocationScopedRequest;
    logger.error(
      {
        err: error,
        organizationId: scopedRequest.organizationId ?? null,
        locationId: scopedRequest.locationId ?? null,
        route: "/api/dashboard/metrics",
      },
      "[dashboard-metrics] Request failed"
    );
    return handleDashboardMetricsError(res, error);
  }
}
