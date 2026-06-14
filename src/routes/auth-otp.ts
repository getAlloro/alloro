/**
 * Auth OTP Routes
 *
 * OTP-based authentication endpoints:
 * - POST /api/auth/otp/request  — Request an OTP code via email
 * - POST /api/auth/otp/verify   — Verify OTP code and login/register
 * - POST /api/auth/otp/validate — Validate a JWT token and return user info
 */

import express from "express";
import * as authOtpController from "../controllers/auth-otp/AuthOtpController";
import { authLimiter } from "../middleware/publicRateLimiter";

const otpRoutes = express.Router();

// Rate-limited: /request (OTP email send) and /verify (code-guess) are the
// brute-force surface. /validate just checks an existing JWT — no limiter.
otpRoutes.post("/request", authLimiter, authOtpController.requestOtp);
otpRoutes.post("/verify", authLimiter, authOtpController.verifyOtp);
otpRoutes.post("/validate", authOtpController.validateToken);

export default otpRoutes;
