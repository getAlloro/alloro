/**
 * Auth Password Routes
 *
 * Email/password authentication endpoints:
 * - POST /api/auth/register            — Register with email + password
 * - POST /api/auth/verify-email        — Verify email with 6-digit code
 * - POST /api/auth/login               — Login with email + password
 * - POST /api/auth/resend-verification — Resend verification code
 * - POST /api/auth/forgot-password    — Request password reset code
 * - POST /api/auth/reset-password     — Reset password with code
 */

import express from "express";
import * as authPasswordController from "../controllers/auth-password/AuthPasswordController";
import { authLimiter } from "../middleware/publicRateLimiter";
import { validate } from "../middleware/validate";
import {
  registerSchema,
  verifyEmailSchema,
  loginSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validation/authPassword.schemas";

const authPasswordRoutes = express.Router();

// Every endpoint here is part of an unauthenticated credential/code flow
// (registration, login, email verification, password reset). All are
// rate-limited to blunt credential stuffing and code brute-force.
//
// Validation: WARN-ONLY for this pass — logs would-be rejections (field names
// + issue codes only, never password/code values) and lets the request
// through. Flip to enforce only after a clean soak. The existing inline
// presence/strength guards in the controller stay in place alongside this.
authPasswordRoutes.post(
  "/register",
  authLimiter,
  validate(registerSchema),
  authPasswordController.register
);
authPasswordRoutes.post(
  "/verify-email",
  authLimiter,
  validate(verifyEmailSchema),
  authPasswordController.verifyEmail
);
authPasswordRoutes.post(
  "/login",
  authLimiter,
  validate(loginSchema),
  authPasswordController.login
);
authPasswordRoutes.post(
  "/resend-verification",
  authLimiter,
  validate(resendVerificationSchema),
  authPasswordController.resendVerification
);
authPasswordRoutes.post(
  "/forgot-password",
  authLimiter,
  validate(forgotPasswordSchema),
  authPasswordController.forgotPassword
);
authPasswordRoutes.post(
  "/reset-password",
  authLimiter,
  validate(resetPasswordSchema),
  authPasswordController.resetPassword
);

export default authPasswordRoutes;
