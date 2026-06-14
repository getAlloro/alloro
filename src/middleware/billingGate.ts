/**
 * Billing Gate Middleware
 *
 * Blocks locked-out organizations from accessing protected routes.
 * Returns 402 when subscription_status === 'inactive'.
 *
 * Self-sufficient — parses JWT from Authorization header and does its own
 * user → org lookup. Mounted globally; skips exempt paths.
 *
 * Exempt paths (always pass through):
 *  - /api/auth          — login/register
 *  - /api/billing       — must be accessible to add payment
 *  - /api/admin         — admin panel
 *  - /api/onboarding    — onboarding flow
 *  - /api/profile       — need to load profile/settings
 *  - /api/support       — help form
 *  - /api/websites      — public contact form
 *  - /api/imports       — public file serving
 *  - /api/scraper       — n8n webhooks
 *  - /api/places        — GBP search
 *  - /api/audit         — audit tracking
 *  - /api/minds         — public skill API
 */

import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { db } from "../database/connection";
import { getJwtSecret } from "../config/jwt";

const EXEMPT_PREFIXES = [
  "/api/auth",
  "/api/billing",
  "/api/admin",
  "/api/onboarding",
  "/api/profile",
  "/api/support",
  "/api/websites",
  "/api/imports",
  "/api/scraper",
  "/api/places",
  "/api/audit",
  "/api/minds",
  "/api/pm",
];

export const billingGateMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check exempt paths
    const path = req.path;
    if (EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return next();
    }

    // Parse JWT from Authorization header (non-blocking — skips if absent or invalid)
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.slice(7);
    let userId: number | undefined;

    try {
      const decoded = jwt.verify(token, getJwtSecret()) as any;
      userId = decoded.userId;
    } catch {
      // Invalid/expired JWT — let downstream auth middleware handle it
      return next();
    }

    if (!userId) {
      return next();
    }

    // Look up the user's organization
    const orgUser = await db("organization_users")
      .where({ user_id: userId })
      .select("organization_id")
      .first();

    if (!orgUser) {
      // No org yet (pre-onboarding) — pass through
      return next();
    }

    const org = await db("organizations")
      .where({ id: orgUser.organization_id })
      .select("subscription_status")
      .first();

    if (!org) {
      return next();
    }

    if (org.subscription_status === "inactive") {
      return res.status(402).json({
        success: false,
        errorCode: "ACCOUNT_LOCKED",
        message:
          "Your account is locked. Please add billing information to continue.",
      });
    }

    return next();
  } catch (error) {
    console.error("[BillingGate] Error checking billing status:", error);
    // On error, let the request through — don't lock out on middleware failure
    return next();
  }
};
