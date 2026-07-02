/**
 * Thin response builders for the billing domain's NEW endpoints
 * (location-add quote + purchase). Canonical { success, data, error } shape.
 *
 * Copied from gbp-automation/feature-utils/controllerResponses.ts — the
 * certified-clean reference. The pre-existing billing endpoints keep their
 * legacy spread-shape responses; only new endpoints use these builders.
 */

import { Response } from "express";
import { BillingLocationError } from "./BillingLocationError";
import { LocationError } from "../../locations/feature-utils/LocationError";

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

export function handleBillingLocationError(
  res: Response,
  error: unknown
): Response {
  // Location-domain guards thrown from inside the purchase transaction
  // (GBP reuse, missing Google connection) surface through this handler too
  if (error instanceof LocationError) {
    let status = 400;
    if (error.code === "GBP_ALREADY_LINKED") status = 409;
    if (error.code === "LOCATION_NOT_FOUND") status = 404;
    return fail(res, status, error.code, error.message, error.details);
  }

  if (error instanceof BillingLocationError) {
    let status = 400;
    if (error.code.includes("NOT_FOUND")) status = 404;
    if (error.code === "GBP_ALREADY_LINKED" || error.code === "QUOTE_STALE")
      status = 409;
    if (error.code === "PAYMENT_FAILED" || error.code === "NO_PAYMENT_METHOD")
      status = 402;
    return fail(res, status, error.code, error.message, error.details);
  }

  return fail(
    res,
    500,
    "LOCATION_BILLING_ERROR",
    "Location billing operation failed."
  );
}
