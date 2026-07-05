/**
 * Response builders for the admin OS domain — the §8.1 envelope, built once
 * (§8.2) and the single error→status mapping (§8.3). Shape copied from
 * gbp-automation/feature-utils/controllerResponses.ts, the certified analog.
 */
import { Response } from "express";
import { OsError } from "./OsError";
import logger from "../../../lib/logger";

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

export function handleOsError(res: Response, error: unknown): Response {
  if (error instanceof OsError) {
    let status = 400;
    if (error.code.includes("NOT_FOUND")) status = 404;
    if (error.code.includes("ACCESS_DENIED")) status = 403;
    if (error.code.includes("CONFLICT") || error.code.includes("LOCKED")) status = 409;
    return fail(res, status, error.code, error.message, error.details);
  }

  // §3.2/§3.4 — log full detail internally, generic message externally.
  logger.error({ err: error }, "[ADMIN-OS] Unexpected error:");
  return fail(res, 500, "OS_ERROR", "OS knowledge base request failed.");
}
