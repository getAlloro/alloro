import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { isSuperAdmin } from "../controllers/auth-otp/feature-services/service.super-admin";
import logger from "../lib/logger";

/**
 * Super Admin Middleware
 * Restricts access to super admins. Authorization is DOMAIN-based (any verified
 * @getalloro.com account), with SUPER_ADMIN_EMAILS as an optional extra grant —
 * both live in one place, service.super-admin.isSuperAdmin (§4.3). Requires
 * authenticateToken to run first (populates req.user).
 */
export const superAdminMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userEmail = req.user?.email;

    if (!userEmail) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!isSuperAdmin(userEmail)) {
      return res.status(403).json({
        error: "Access denied. Super Admin privileges required.",
      });
    }

    next();
  } catch (error) {
    logger.error({ err: error }, "[SuperAdmin] Error checking permissions:");
    return res.status(500).json({ error: "Failed to verify permissions" });
  }
};
