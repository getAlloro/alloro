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
import { validate } from "../middleware/validate";
import {
  otpRequestSchema,
  otpVerifySchema,
  otpValidateSchema,
} from "../validation/authOtp.schemas";

const otpRoutes = express.Router();

// Rate-limited: /request (OTP email send) and /verify (code-guess) are the
// brute-force surface. /validate just checks an existing JWT — no limiter.
// Validation: WARN-ONLY for this pass — logs would-be rejections (field names
// + issue codes only, never the email/code values) and lets the request
// through. Flip to enforce only after a clean soak.
otpRoutes.post(
  "/request",
  authLimiter,
  validate(otpRequestSchema),
  authOtpController.requestOtp
);
otpRoutes.post(
  "/verify",
  authLimiter,
  validate(otpVerifySchema),
  authOtpController.verifyOtp
);
otpRoutes.post(
  "/validate",
  validate(otpValidateSchema),
  authOtpController.validateToken
);

export default otpRoutes;
