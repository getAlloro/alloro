import { Response } from "express";
import { PatientJourneyError } from "./PatientJourneyError";
import { PatientJourneyNotFoundError } from "../feature-services/PatientJourneyService";

/** Success envelope (§8.1): { success, data, error }. */
export function ok(res: Response, data: unknown, status = 200): Response {
  return res.status(status).json({ success: true, data, error: null });
}

/** Failure envelope (§8.1): { success, data, error }. */
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

/** Parse an optional numeric query/body value, null when absent or invalid. */
export function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Parse an optional YYYY-MM month string, null when absent or malformed. */
export function parseOptionalMonth(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return /^\d{4}-\d{2}$/.test(value) ? value : null;
}

/**
 * Resolve the report month (first-of-month key, YYYY-MM-01) the service expects.
 * An explicit valid `month` (YYYY-MM) wins; otherwise default to the current
 * UTC month. Never derived from tenant identity — purely a window selector.
 */
export function resolveReportMonth(value: unknown): string {
  const explicit = parseOptionalMonth(value);
  if (explicit) return `${explicit}-01`;
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

/**
 * Central status map (§8.3) for the typed domain error. Mirrors the
 * gbp-automation pattern: code substrings drive the HTTP status; anything
 * unrecognized is a 500 with a generic message (no internals leaked).
 */
export function handlePatientJourneyError(res: Response, error: unknown): Response {
  if (error instanceof PatientJourneyNotFoundError) {
    return fail(res, 404, "PATIENT_JOURNEY_NOT_FOUND", error.message);
  }

  if (error instanceof PatientJourneyError) {
    let status = 400;
    if (error.code.includes("NOT_FOUND")) status = 404;
    if (error.code.includes("ACCESS_DENIED") || error.code.includes("PERMISSION")) status = 403;
    if (error.code.includes("RECONNECT_REQUIRED")) status = 401;
    if (error.code.includes("RATE_LIMITED")) status = 429;
    if (error.code.includes("TRANSIENT_FAILURE")) status = 503;
    return fail(res, status, error.code, error.message, error.details);
  }

  return fail(res, 500, "PATIENT_JOURNEY_ERROR", "Patient journey assembly failed.");
}
