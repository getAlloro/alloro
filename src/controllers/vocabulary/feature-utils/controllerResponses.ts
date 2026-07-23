import { Response } from "express";
import logger from "../../../lib/logger";

/**
 * Thin response builders for the vocabulary domain. Copied from the
 * certified-clean reference,
 * controllers/gbp-automation/feature-utils/controllerResponses.ts (§6.1), so
 * every handler returns the one { success, data, error } contract (§8.1).
 *
 * This domain currently exposes only a read endpoint that raises no typed
 * domain errors, so there is no VocabularyError / status-mapping ladder here —
 * an unexpected failure is logged internally and returned as a generic 500,
 * never leaking internal detail to the client (§3.2, §3.4). Add a typed error +
 * centralized mapping (§8.3) if this domain grows write handlers.
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

/**
 * Log the failure internally and return a generic 500 — the error is surfaced
 * to the operator (§3.2), not swallowed, and no internal detail reaches the
 * client (§3.4).
 */
export function handleVocabularyError(res: Response, error: unknown): Response {
  logger.error(
    { err: error instanceof Error ? error.message : error },
    "[Vocabulary] Failed to resolve vocabulary"
  );
  return fail(res, 500, "VOCABULARY_ERROR", "Failed to resolve vocabulary.");
}
