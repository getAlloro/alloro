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

const authPasswordRoutes = express.Router();

// Every endpoint here is part of an unauthenticated credential/code flow
// (registration, login, email verification, password reset). All are
// rate-limited to blunt credential stuffing and code brute-force.
authPasswordRoutes.post("/register", authLimiter, authPasswordController.register);
authPasswordRoutes.post("/verify-email", authLimiter, authPasswordController.verifyEmail);
authPasswordRoutes.post("/login", authLimiter, authPasswordController.login);
authPasswordRoutes.post(
  "/resend-verification",
  authLimiter,
  authPasswordController.resendVerification
);
authPasswordRoutes.post(
  "/forgot-password",
  authLimiter,
  authPasswordController.forgotPassword
);
authPasswordRoutes.post(
  "/reset-password",
  authLimiter,
  authPasswordController.resetPassword
);

export default authPasswordRoutes;
