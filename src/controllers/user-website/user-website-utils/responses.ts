/**
 * User Website — HTTP Response Helpers
 *
 * Controller-layer (HTTP) response shaping shared across the user-website
 * handler modules. No business logic — just status/body mapping. Extracted from
 * UserWebsiteController so the post/menu handler modules can reuse the same
 * error envelope verbatim.
 */

import { Response } from "express";
import * as gscIntegration from "../../admin-websites/feature-services/service.gsc-integration";
import logger from "../../../lib/logger";

/**
 * Map a thrown error to an HTTP response. Service-level errors carrying a
 * `statusCode` are surfaced as-is (with optional rate-limit fields); anything
 * else becomes a logged 500. Matches the original controller behavior exactly.
 */
export function handleError(
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: any,
  operation: string
): Response {
  // Check for service-level errors with statusCode
  if (error.statusCode) {
    const body: Record<string, unknown> = {
      error: error.errorCode || error.message,
      message: error.message,
    };
    if (error.limit !== undefined) body.limit = error.limit;
    if (error.reset_at !== undefined) body.reset_at = error.reset_at;
    return res.status(error.statusCode).json(body);
  }

  logger.error({ err: error?.message || error }, `[User/Website] ${operation} Error:`);
  return res.status(500).json({
    success: false,
    error: `Failed to ${operation.toLowerCase()}`,
    message: error?.message || "Unknown error occurred",
  });
}

/** As `handleError`, but first maps GSC integration errors to their status. */
export function handleGscError(
  res: Response,
  error: unknown,
  operation: string
): Response {
  if (error instanceof gscIntegration.GscIntegrationError) {
    return res.status(error.status).json({
      success: false,
      error: error.code,
      message: error.message,
    });
  }

  return handleError(res, error, operation);
}

// ---------------------------------------------------------------------
// Manager-style result envelope.
//
// Managers (post/menu/post-type) return `{ error?: { status, code, ... } }`
// alongside a data field. This collapses the identical guard/response control
// flow every routing handler shares without moving any logic.
// ---------------------------------------------------------------------

export type ManagerError = { status: number } & Record<string, unknown>;

/** Send a manager result: error branch → its status; else success + payload. */
export function sendManagerResult(
  res: Response,
  result: { error?: ManagerError | null },
  opts: { successStatus?: number; data?: unknown } = {}
): Response {
  if (result.error) {
    return res
      .status(result.error.status)
      .json({ success: false, ...result.error });
  }
  const body: Record<string, unknown> = { success: true };
  if (opts.data !== undefined) body.data = opts.data;
  return res.status(opts.successStatus ?? 200).json(body);
}
