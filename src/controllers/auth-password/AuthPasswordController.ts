/**
 * Auth Password Controller
 *
 * Handles email/password authentication:
 * - POST /register            — Register with email + password
 * - POST /verify-email        — Verify email with 6-digit code
 * - POST /login               — Login with email + password
 * - POST /resend-verification — Resend verification code
 * - POST /forgot-password     — Request password reset code
 * - POST /reset-password      — Reset password with code
 */

import { Request, Response } from "express";
import bcrypt from "bcrypt";

import { UserModel } from "../../models/UserModel";
import { OrganizationUserModel } from "../../models/OrganizationUserModel";
import { InvitationModel } from "../../models/InvitationModel";
import { generateToken } from "../auth-otp/feature-services/service.jwt-management";
import { generateSixDigitCode } from "../auth-otp/feature-services/service.otp-generation";
import { buildAuthCookieOptions } from "../auth-otp/feature-utils/util.cookie-config";
import { sendEmail } from "../../emails/emailService";
import {
  buildPasswordResetEmail,
  buildVerificationCodeEmail,
} from "../../emails/templates/AccountEmailTemplates";
import { linkAccountCreation } from "../leadgen-tracking/feature-services/service.account-linking";
import logger from "../../lib/logger";

const BCRYPT_SALT_ROUNDS = 12;
const VERIFICATION_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const LEADGEN_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PASSWORD_RESET_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
const PASSWORD_MIN_LENGTH = 8;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isStrongPassword(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

/**
 * POST /api/auth/register
 */
export async function register(req: Request, res: Response) {
  try {
    const { email, password, confirmPassword } = req.body;

    if (!email || !password || !confirmPassword) {
      return res
        .status(400)
        .json({ error: "Email, password, and confirmPassword are required" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        error:
          "Password must be at least 8 characters with 1 uppercase letter and 1 number",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existing = await UserModel.findByEmail(normalizedEmail);
    if (existing) {
      // Don't reveal whether the email exists — generic message
      return res.status(409).json({
        error: "An account with this email already exists",
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // Generate verification code
    const code = generateSixDigitCode();
    const expiresAt = new Date(Date.now() + VERIFICATION_EXPIRY_MS);

    // Create user
    await UserModel.create({
      email: normalizedEmail,
      password_hash: passwordHash,
      email_verification_code: code,
      email_verification_expires_at: expiresAt,
    });

    // Send verification email
    const emailResult = await sendEmail({
      category: "auth",
      subject: "Verify your Alloro account",
      body: buildVerificationCodeEmail({ code }),
      recipients: [normalizedEmail],
    });
    if (!emailResult.success) {
      logger.error({ err: emailResult.error }, `[AUTH] Failed to send verification email to ${normalizedEmail}:`);
    }

    logger.info(`[AUTH] User registered: ${normalizedEmail}`);

    return res.status(201).json({
      success: true,
      message: "Verification code sent to your email",
    });
  } catch (error) {
    logger.error({ err: error }, "[AUTH] Register error:");
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/auth/verify-email
 */
export async function verifyEmail(req: Request, res: Response) {
  try {
    const { email, code, leadgen_session_id } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: "Email and code are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Optional leadgen tracking id forwarded from the signup URL (?ls=<uuid>).
    // Bad value silently dropped so a malformed tracking id never breaks
    // email verification.
    const leadgenSessionId =
      typeof leadgen_session_id === "string" &&
      LEADGEN_UUID_REGEX.test(leadgen_session_id)
        ? leadgen_session_id
        : undefined;

    // Find user by email + valid code
    const user = await UserModel.findByVerificationCode(normalizedEmail, code);

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired verification code" });
    }

    // Mark email as verified
    await UserModel.setEmailVerified(user.id);

    // Fire-and-forget: link this newly-verified account back to any
    // pre-signup leadgen session(s) so the admin funnel can count this
    // signup as a conversion. Idempotent on the service side; safe even
    // if a re-verify ever races in.
    linkAccountCreation({
      email: normalizedEmail,
      userId: user.id,
      sessionId: leadgenSessionId,
    }).catch((err) => {
      logger.error({ err: err }, "[AUTH] linkAccountCreation post-verify failed:");
    });

    // Accept pending invitation if one exists (invited user joins existing org)
    let orgUser = await OrganizationUserModel.findByUserId(user.id);
    if (!orgUser) {
      const invitation = await InvitationModel.findPendingByEmail(normalizedEmail);
      if (invitation && new Date(invitation.expires_at) > new Date()) {
        await OrganizationUserModel.create({
          organization_id: invitation.organization_id,
          user_id: user.id,
          role: invitation.role,
        });
        await InvitationModel.updateStatus(invitation.id, "accepted");
        orgUser = await OrganizationUserModel.findByUserId(user.id);
        logger.info(`[AUTH] User ${user.id} joined org ${invitation.organization_id} via invitation (role: ${invitation.role})`);
      }
    }

    // Generate JWT
    const token = generateToken(user.id, user.email);

    // Set cookie for cross-app auth sync
    res.cookie("auth_token", token, buildAuthCookieOptions());

    logger.info(`[AUTH] Email verified: ${normalizedEmail}`);

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organizationId: orgUser?.organization_id || null,
        role: orgUser?.role || "viewer",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[AUTH] Verify email error:");
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/auth/login
 */
export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await UserModel.findByEmail(normalizedEmail);

    if (!user || !user.password_hash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!user.email_verified) {
      return res
        .status(403)
        .json({ error: "Please verify your email first" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Get org info — accept pending invitation if user has no org yet
    let orgUser = await OrganizationUserModel.findByUserId(user.id);
    if (!orgUser) {
      const invitation = await InvitationModel.findPendingByEmail(normalizedEmail);
      if (invitation && new Date(invitation.expires_at) > new Date()) {
        await OrganizationUserModel.create({
          organization_id: invitation.organization_id,
          user_id: user.id,
          role: invitation.role,
        });
        await InvitationModel.updateStatus(invitation.id, "accepted");
        orgUser = await OrganizationUserModel.findByUserId(user.id);
        logger.info(`[AUTH] User ${user.id} joined org ${invitation.organization_id} via invitation (role: ${invitation.role})`);
      }
    }

    // Generate JWT
    const token = generateToken(user.id, user.email);

    // Set cookie for cross-app auth sync
    res.cookie("auth_token", token, buildAuthCookieOptions());

    logger.info(`[AUTH] User logged in: ${normalizedEmail}`);

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organizationId: orgUser?.organization_id || null,
        role: orgUser?.role || "viewer",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[AUTH] Login error:");
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/auth/resend-verification
 */
export async function resendVerification(req: Request, res: Response) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await UserModel.findByEmail(normalizedEmail);

    if (!user) {
      // Don't reveal whether email exists
      return res.json({
        success: true,
        message: "If an account exists, a new code has been sent",
      });
    }

    if (user.email_verified) {
      return res.status(400).json({ error: "Email is already verified" });
    }

    // Generate new code
    const code = generateSixDigitCode();
    const expiresAt = new Date(Date.now() + VERIFICATION_EXPIRY_MS);

    await UserModel.setVerificationCode(user.id, code, expiresAt);

    // SECURITY: never log the one-time code value. The "resent" confirmation
    // below logs the email only, without the code.

    const emailResult = await sendEmail({
      category: "auth",
      subject: "Verify your Alloro account",
      body: buildVerificationCodeEmail({ code }),
      recipients: [normalizedEmail],
    });
    if (!emailResult.success) {
      logger.error({ err: emailResult.error }, `[AUTH] Failed to resend verification email to ${normalizedEmail}:`);
    }

    logger.info(`[AUTH] Verification code resent: ${normalizedEmail}`);

    return res.json({
      success: true,
      message: "If an account exists, a new code has been sent",
    });
  } catch (error) {
    logger.error({ err: error }, "[AUTH] Resend verification error:");
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/auth/forgot-password
 */
export async function forgotPassword(req: Request, res: Response) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await UserModel.findByEmail(normalizedEmail);

    if (!user) {
      // Don't reveal whether email exists
      return res.json({
        success: true,
        message: "If an account exists, a reset code has been sent",
      });
    }

    // Generate reset code
    const code = generateSixDigitCode();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);

    await UserModel.setPasswordResetCode(user.id, code, expiresAt);

    const emailResult = await sendEmail({
      category: "auth",
      subject: "Reset your Alloro password",
      body: buildPasswordResetEmail({ code }),
      recipients: [normalizedEmail],
    });
    if (!emailResult.success) {
      logger.error({ err: emailResult.error }, `[AUTH] Failed to send password reset email to ${normalizedEmail}:`);
    }

    logger.info(`[AUTH] Password reset code sent: ${normalizedEmail}`);

    return res.json({
      success: true,
      message: "If an account exists, a reset code has been sent",
    });
  } catch (error) {
    logger.error({ err: error }, "[AUTH] Forgot password error:");
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/auth/reset-password
 */
export async function resetPassword(req: Request, res: Response) {
  try {
    const { email, code, password, confirmPassword } = req.body;

    if (!email || !code || !password || !confirmPassword) {
      return res
        .status(400)
        .json({ error: "Email, code, password, and confirmPassword are required" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        error:
          "Password must be at least 8 characters with 1 uppercase letter and 1 number",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find user by email + valid reset code
    const user = await UserModel.findByPasswordResetCode(normalizedEmail, code);

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset code" });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // Update password + clear reset code
    await UserModel.updatePasswordHash(user.id, passwordHash);
    await UserModel.clearPasswordResetCode(user.id);

    // Also mark email as verified (in case user came from old Google-only account)
    if (!user.email_verified) {
      await UserModel.setEmailVerified(user.id);
    }

    // Auto-login: generate JWT
    const orgUser = await OrganizationUserModel.findByUserId(user.id);
    const token = generateToken(user.id, user.email);

    res.cookie("auth_token", token, buildAuthCookieOptions());

    logger.info(`[AUTH] Password reset: ${normalizedEmail}`);

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organizationId: orgUser?.organization_id || null,
        role: orgUser?.role || "viewer",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[AUTH] Reset password error:");
    return res.status(500).json({ error: "Internal server error" });
  }
}
