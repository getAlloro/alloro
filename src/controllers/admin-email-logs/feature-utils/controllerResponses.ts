import { Response } from "express";

/**
 * Thin { success, data, error } response builders for the admin-email-logs
 * domain (§8.1/§8.2). Copied from the gbp-automation reference.
 */
export function ok(res: Response, data: unknown, status = 200): Response {
  return res.status(status).json({ success: true, data, error: null });
}

export function fail(
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
