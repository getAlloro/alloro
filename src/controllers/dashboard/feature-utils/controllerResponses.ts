import { Response } from "express";
import type { LocationScopeFailureCode } from "../../../middleware/rbac";
import { DashboardMetricsError } from "./DashboardMetricsError";

export function ok(res: Response, data: unknown, status = 200): Response {
  return res.status(status).json({ success: true, data, error: null });
}

function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  details: unknown = null
): Response {
  return res.status(status).json({
    success: false,
    data: null,
    error: { code, message, details },
  });
}

function statusForCode(code: string): number {
  if (code.includes("ACCESS_DENIED") || code.includes("SCOPE_UNAVAILABLE")) {
    return 403;
  }
  if (code.includes("CONTEXT_MISSING")) return 401;
  if (code.includes("REQUIRED")) return 400;
  return 500;
}

export function dashboardScopeFailure(
  res: Response,
  status: number,
  code: LocationScopeFailureCode,
  message: string
): Response {
  return fail(res, status, `DASHBOARD_${code}`, message);
}

export function handleDashboardMetricsError(
  res: Response,
  error: unknown
): Response {
  if (error instanceof DashboardMetricsError) {
    return fail(
      res,
      statusForCode(error.code),
      error.code,
      error.message,
      error.details
    );
  }
  return fail(
    res,
    500,
    "DASHBOARD_METRICS_ERROR",
    "Dashboard metrics are temporarily unavailable."
  );
}
