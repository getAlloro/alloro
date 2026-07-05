/**
 * Auth OTP Controller
 *
 * The OTP login flow (POST /request, /verify) was retired when admin sign-in
 * moved to Google SSO (plans/07052026-google-sso-admin-and-user-login, T7) —
 * OTP was only ever the admin login path. What remains is token validation,
 * still consumed by website-builder for unified auth:
 * - POST /validate — Validate a JWT token and return user info
 */

import { Request, Response } from "express";

import { isSuperAdmin } from "./feature-services/service.super-admin";
import { verifyToken } from "./feature-services/service.jwt-management";

import { UserModel } from "../../models/UserModel";
import { OrganizationUserModel } from "../../models/OrganizationUserModel";
import logger from "../../lib/logger";

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
