/**
 * Ranking Response Helpers
 *
 * Small response shapers for the practice-ranking controllers. These collapse
 * the repeated `res.status(...).json({ success:false, error, message })` blocks
 * into single calls while preserving the exact wire shape (success flag, error
 * code string, message) that the frontend already depends on.
 */

import { Response } from "express";

/**
 * Emit a `{ success:false, error, message }` body at the given status.
 * `message` falls back to `fallback` when empty/undefined.
 */
export function fail(
  res: Response,
  status: number,
  error: string,
  message: string | undefined,
  fallback: string,
): Response {
  return res.status(status).json({
    success: false,
    error,
    message: message || fallback,
  });
}

/**
 * Standard 500 shape used by every handler's catch block:
 * `{ success:false, error, message: error.message || fallback }`.
 */
export function fail500(
  res: Response,
  error: string,
  err: any,
  fallback: string,
): Response {
  return fail(res, 500, error, err?.message, fallback);
}
