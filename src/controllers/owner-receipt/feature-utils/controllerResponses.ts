/**
 * Response builders for the owner-receipt domain (§8.1, §8.2).
 *
 * `fail()` is the single writer of the error envelope, so the contract cannot
 * drift per-handler, and `statusForCode()` is the one error-code -> HTTP-status
 * map (§8.3). Mirrors proof-receipt/feature-utils/controllerResponses.ts.
 */

import { Response } from "express";
import logger from "../../../lib/logger";
import { OwnerReceiptError } from "./OwnerReceiptError";

/**
 * The fixed message returned for any unrecognised failure. §3.4 — a caught
 * error's own message may describe internal state and must never reach the client.
 */
const OWNER_RECEIPT_FAILURE_MESSAGE = "Owner receipt is temporarily unavailable.";

/** Request context attached to every owner-receipt log line (§9.3). */
export interface OwnerReceiptLogContext {
  route: string;
  userId: number | null;
  organizationId: number | null;
  locationId: number | null;
}

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

/**
 * The one error-code -> HTTP-status map (§8.3). A caller authenticated but
 * carrying no organization context is authorized-against, not unauthenticated,
 * so it is 403 not 401 (§8.4). A malformed window is a bad request (400).
 */
function statusForCode(code: string): number {
  if (
    code.includes("ACCESS_DENIED") ||
    code.includes("SCOPE_UNAVAILABLE") ||
    code.includes("CONTEXT_MISSING")
  ) {
    return 403;
  }
  if (code.includes("WINDOW_INVALID")) return 400;
  return 500;
}

/**
 * Terminal error handler for the domain. A typed OwnerReceiptError is a known
 * failure mode and keeps its own message; anything else is unexpected and gets
 * the fixed message, with the real error object handed to Pino for a stack (§9.3).
 */
export function handleOwnerReceiptError(
  res: Response,
  error: unknown,
  context: OwnerReceiptLogContext
): Response {
  if (error instanceof OwnerReceiptError) {
    logger.warn(
      { err: error, ...context },
      "[OWNER-RECEIPT] Request could not be completed"
    );
    return fail(
      res,
      statusForCode(error.code),
      error.code,
      error.message,
      error.details
    );
  }

  logger.error(
    { err: error, ...context },
    "[OWNER-RECEIPT] Unexpected request failure"
  );
  return fail(res, 500, "OWNER_RECEIPT_ERROR", OWNER_RECEIPT_FAILURE_MESSAGE);
}
