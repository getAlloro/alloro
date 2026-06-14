import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import logger from "../lib/logger";

/**
 * Super Admin Middleware
 * Restricts access to users whose emails are in the SUPER_ADMIN_EMAILS env var.
 * Requires authenticateToken to run first (populates req.user).
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

    // Check against allowed emails
    const allowedEmails = (process.env.SUPER_ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0);

    if (!allowedEmails.includes(userEmail.toLowerCase())) {
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
