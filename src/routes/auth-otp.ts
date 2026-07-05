/**
 * Auth OTP Routes
 *
 * The OTP login endpoints (/request, /verify) were retired when admin sign-in
 * moved to Google SSO (plans/07052026-google-sso-admin-and-user-login, T7).
 * What remains is token validation, still used by website-builder:
 * - POST /api/auth/otp/validate — Validate a JWT token and return user info
 */

import express from "express";
import * as authOtpController from "../controllers/auth-otp/AuthOtpController";
import { validate } from "../middleware/validate";
import { otpValidateSchema } from "../validation/authOtp.schemas";

const otpRoutes = express.Router();

// /validate just checks an existing JWT — no rate limiter needed.
otpRoutes.post(
  "/validate",
  validate(otpValidateSchema),
  authOtpController.validateToken
);

export default otpRoutes;
