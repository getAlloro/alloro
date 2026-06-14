/**
 * Auth OTP Controller
 *
 * Handles OTP-based authentication:
 * - POST /request  — Request an OTP code via email
 * - POST /verify   — Verify OTP code and login/register
 * - POST /validate — Validate a JWT token and return user info
 */

import { Request, Response } from "express";

import { normalizeEmail } from "./feature-utils/util.email-normalization";
import { isTestAccount } from "./feature-utils/util.test-account";
import { buildAuthCookieOptions } from "./feature-utils/util.cookie-config";
import { isSuperAdmin } from "./feature-services/service.super-admin";
import { createAndSendOtp } from "./feature-services/service.otp-generation";
import { verifyAndConsume } from "./feature-services/service.otp-verification";
import { onboardUser } from "./feature-services/service.user-onboarding";
import {
  generateToken,
  verifyToken,
} from "./feature-services/service.jwt-management";
import { linkAccountCreation } from "../leadgen-tracking/feature-services/service.account-linking";

import { UserModel } from "../../models/UserModel";
import { InvitationModel } from "../../models/InvitationModel";
import { OrganizationUserModel } from "../../models/OrganizationUserModel";
import { GoogleConnectionModel } from "../../models/GoogleConnectionModel";
import logger from "../../lib/logger";

const LEADGEN_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/auth/otp/request
 * Request an OTP code via email
 */
export async function requestOtp(req: Request, res: Response) {
  try {
    const { email, isAdminLogin } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const normalizedEmail = normalizeEmail(email);

    // Test account bypass — no OTP required
    if (isTestAccount(normalizedEmail)) {
      logger.info("[AUTH] Test account detected, skipping OTP email");
      return res.json({
        success: true,
        message: "Test account - no OTP required",
        isTestAccount: true,
      });
    }

    const superAdmin = isSuperAdmin(normalizedEmail);

    // Admin login strictly requires super admin status
    if (isAdminLogin && !superAdmin) {
      return res.status(403).json({
        error: "Access denied. Your email is not authorized for Admin access.",
      });
    }

    // Check if user exists
    const user = await UserModel.findByEmail(normalizedEmail);

    // Check if invitation exists
    const invitation = await InvitationModel.findPendingByEmail(normalizedEmail);

    if (!user && !invitation && !superAdmin) {
      return res
        .status(404)
        .json({ error: "Email not found. Please ask an admin to invite you." });
    }

    const sent = await createAndSendOtp(normalizedEmail);

    if (!sent) {
      return res.status(500).json({ error: "Failed to send email" });
    }

    res.json({ success: true, message: "OTP sent to email" });
  } catch (error) {
    logger.error({ err: error }, "OTP Request Error:");
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/auth/otp/verify
 * Verify OTP code and login/register
 */
export async function verifyOtp(req: Request, res: Response) {
  try {
    const { email, code, isAdminLogin, leadgen_session_id } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: "Email and code are required" });
    }

    // Optional leadgen tracking id carried through the signup URL (`?ls=<uuid>`).
    // If present but malformed, silently drop — a bad tracking id must never
    // fail OTP verify.
    const leadgenSessionId =
      typeof leadgen_session_id === "string" &&
      LEADGEN_UUID_REGEX.test(leadgen_session_id)
        ? leadgen_session_id
        : undefined;

    const normalizedEmail = normalizeEmail(email);
    const testAccount = isTestAccount(normalizedEmail);
    const superAdmin = isSuperAdmin(normalizedEmail);

    // Admin login strictly requires super admin status
    if (isAdminLogin && !superAdmin) {
      return res.status(403).json({
        error: "Access denied. Your email is not authorized for Admin access.",
      });
    }

    // Skip OTP verification for test account
    if (!testAccount) {
      const valid = await verifyAndConsume(normalizedEmail, code);
      if (!valid) {
        return res.status(400).json({ error: "Invalid or expired code" });
      }
    } else {
      logger.info("[AUTH] Test account - bypassing OTP verification");
    }

    // Find or create user
    let user = await UserModel.findByEmail(normalizedEmail);
    let isNewUser = false;

    if (!user) {
      const invitation = await InvitationModel.findPendingByEmail(normalizedEmail);

      // Re-check super admin (same as original — scoped inside this block)
      const superAdminInner = isSuperAdmin(normalizedEmail);

      if (!invitation && !superAdminInner) {
        return res
          .status(400)
          .json({ error: "No account found and no pending invitation." });
      }

      const result = await onboardUser(normalizedEmail, invitation ?? undefined);
      user = result.user;
      isNewUser = result.isNewUser;

      // Fire-and-forget: link this new user back to any pre-signup leadgen
      // session(s) so the admin funnel can count them as converted. Never
      // awaited in a way that delays the OTP response — the service catches
      // its own errors but we defensively `.catch` the promise here too.
      if (isNewUser) {
        linkAccountCreation({
          email: normalizedEmail,
          userId: user.id,
          sessionId: leadgenSessionId,
        }).catch((err) => {
          logger.error({ err: err }, "[AUTH] linkAccountCreation post-onboard failed:");
        });
      }
    }

    // Generate JWT
    const token = generateToken(user.id, user.email);

    // Get user role and org (if any)
    const orgUser = await OrganizationUserModel.findByUserId(user.id);

    let googleAccountId: number | null = null;
    if (orgUser) {
      // Find the primary google account for this organization
      const googleAccount = await GoogleConnectionModel.findOne({
        organization_id: orgUser.organization_id,
      });

      if (googleAccount) {
        googleAccountId = googleAccount.id;
      }
    }

    // Set cookie for cross-app auth sync
    res.cookie("auth_token", token, buildAuthCookieOptions());

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organizationId: orgUser?.organization_id,
        role: orgUser?.role || "viewer",
        googleAccountId,
      },
      isNewUser,
    });
  } catch (error) {
    logger.error({ err: error }, "OTP Verify Error:");
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/auth/otp/validate
 * Validate a JWT token and return user info
 * Used by website-builder for unified auth
 */
export async function validateToken(req: Request, res: Response) {
  try {
    // Get token from Authorization header or body
    const authHeader = req.headers["authorization"];
    const headerToken = authHeader && authHeader.split(" ")[1];
    const bodyToken = req.body.token;
    const token = headerToken || bodyToken;

    if (!token) {
      return res.status(401).json({
        valid: false,
        error: "No token provided",
      });
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({
        valid: false,
        error: "Invalid or expired token",
      });
    }

    const { userId, email: decodedEmail } = decoded;
    const superAdmin = isSuperAdmin(decodedEmail);

    // Get user from database
    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(401).json({
        valid: false,
        error: "User not found",
      });
    }

    // Get user role and org (if any)
    const orgUser = await OrganizationUserModel.findByUserId(userId);

    res.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organizationId: orgUser?.organization_id,
        role: orgUser?.role || "viewer",
        isSuperAdmin: superAdmin,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Token Validate Error:");
    res.status(500).json({
      valid: false,
      error: "Internal server error",
    });
  }
}
