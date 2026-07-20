/**
 * Response builders for the proof-receipt domain (§8.1, §8.2).
 *
 * `fail()` is the single writer of the error envelope, so the contract cannot
 * drift per-handler, and `statusForCode()` is the one error-code -> HTTP-status
 * map (§8.3). Copied from gbp-automation/feature-utils/controllerResponses.ts,
 * the reference implementation named by §6.1/§8.2, with request context added
 * to the log calls (§9.3).
 */

import { Response } from "express";
import logger from "../../../lib/logger";
import { ProofReceiptError } from "./ProofReceiptError";

/**
 * The fixed message returned for any unrecognised failure. §3.4 — a caught
 * error's own message may describe internal state (table names, constraint
 * names, driver text) and must never reach the client.
 */
const PROOF_RECEIPT_FAILURE_MESSAGE =
  "Proof receipt is temporarily unavailable.";

/** Request context attached to every proof-receipt log line (§9.3). */
export interface ProofReceiptLogContext {
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
 * The one error-code -> HTTP-status map (§8.3).
 *
 * A caller who is authenticated but carries no organization context is
 * authorized-against, not unauthenticated, so it is 403 and not 401 (§8.4) —
 * a 401 would tell the client its session had expired and send it into a
 * pointless re-login loop.
 */
function statusForCode(code: string): number {
  if (
    code.includes("ACCESS_DENIED") ||
    code.includes("SCOPE_UNAVAILABLE") ||
    code.includes("CONTEXT_MISSING")
  ) {
    return 403;
  }
  return 500;
}

/**
 * Terminal error handler for the domain. A typed ProofReceiptError is a known
 * failure mode and keeps its own message; anything else is unexpected and gets
 * the fixed message, with the real error object (not its message string) handed
 * to Pino so the serializer records a stack (§9.3).
 */
export function handleProofReceiptError(
  res: Response,
  error: unknown,
  context: ProofReceiptLogContext
): Response {
  if (error instanceof ProofReceiptError) {
    logger.warn(
      { err: error, ...context },
      "[PROOF-RECEIPT] Request could not be completed"
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
    "[PROOF-RECEIPT] Unexpected request failure"
  );
  return fail(
    res,
    500,
    "PROOF_RECEIPT_ERROR",
    PROOF_RECEIPT_FAILURE_MESSAGE
  );
}
