import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AuthRequest } from "../../../middleware/auth";
import { getJwtSecret } from "../../../config/jwt";

/**
 * Auth for the OS asset-delivery GET only (plans/07042026-alloro-os-admin-port
 * P6 T5). The asset endpoint is rendered inside an <img> tag, which cannot send
 * an Authorization header — so this accepts the same super-admin JWT from either
 * the Authorization header (API/tests) OR a `?token=` query param (the <img>
 * path). It verifies with the identical secret and populates req.user exactly
 * like the global authenticateToken, then superAdminMiddleware runs unchanged.
 *
 * Scope note (§11.1): this is deliberately confined to ONE read-only GET that
 * only 302-redirects to a short-lived presigned URL. It does not alter the
 * global header-only auth model. Keeping the query-token path off every other
 * route avoids leaking bearer tokens into logs/referrers on mutating endpoints.
 */
export function authenticateOsAsset(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Response | void {
  const authHeader = req.headers["authorization"];
  const headerToken = authHeader ? authHeader.split(" ")[1] : undefined;
  const queryToken =
    typeof req.query.token === "string" ? req.query.token : undefined;
  const token = headerToken || queryToken;

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const user = jwt.verify(token, getJwtSecret()) as {
      userId: number;
      email: string;
    };
    req.user = user;
    next();
  } catch {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}
