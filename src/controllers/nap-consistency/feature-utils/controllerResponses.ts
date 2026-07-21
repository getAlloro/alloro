import { Response } from "express";
import { NapConsistencyError } from "./NapConsistencyError";

/**
 * Response builders for the NAP-consistency read surface. Copied from
 * `gbp-automation/feature-utils/controllerResponses.ts` (§6.1 / §8.2) so this
 * domain returns exactly the one `{ success, data, error }` contract (§8.1) and
 * maps a typed domain error to an HTTP status in a single place (§8.3).
 */

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

/** Parse a query/body value that should be a positive integer, else null. */
export function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function handleNapError(res: Response, error: unknown): Response {
  if (error instanceof NapConsistencyError) {
    let status = 400;
    if (error.code.includes("NOT_FOUND")) status = 404;
    if (error.code.includes("ACCESS_DENIED") || error.code.includes("PERMISSION")) {
      status = 403;
    }
    return fail(res, status, error.code, error.message, error.details);
  }
  // §3.4 — never leak internals to the client; full detail is logged at the
  // model/service layer via Pino.
  return fail(res, 500, "NAP_CONSISTENCY_ERROR", "NAP consistency read failed.");
}
