/**
 * CTR-hypothesis — centralized error→HTTP status mapping (§8.3).
 *
 * One mapper owns the translation from a thrown CtrHypothesisError into a
 * response, so the controller carries no scattered res.status() calls. The
 * success/failure wire shapes are the domain's existing ones, reused from
 * util.integration-responses rather than re-declared, so every admin-websites
 * endpoint answers in the same shape.
 *
 * Unrecognized errors log in full internally and return a generic 500 message
 * (§3.4) — no internal detail reaches the client.
 */

import type { Response } from "express";
import logger from "../../../lib/logger";
import { CtrHypothesisError } from "../feature-services/service.ctr-hypothesis";
import { fail } from "./util.integration-responses";

export const CTR_HYPOTHESIS_LOG_PREFIX = "[CTR Hypothesis]";

export function failCtrHypothesisError(
  res: Response,
  error: unknown,
  fallbackMessage: string,
): Response {
  if (error instanceof CtrHypothesisError) {
    return fail(res, error.status, error.code, error.message);
  }

  logger.error({ err: error }, `${CTR_HYPOTHESIS_LOG_PREFIX} ${fallbackMessage}:`);
  return fail(res, 500, "CTR_HYPOTHESIS_ERROR", fallbackMessage);
}
