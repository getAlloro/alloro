/**
 * Auth-OTP route schemas (src/routes/auth-otp.ts).
 *
 * Covers the OTP request/verify/validate bodies. Schemas are PERMISSIVE-FIRST
 * (warn-only soak): they assert only the fields the controller hard-requires
 * today and stay loose on optionals, `.passthrough()`-ing unknown keys so the
 * warn pass surfaces real misses rather than noise. Tightening happens from the
 * soak logs, not from imagination.
 *
 * REDACTION: the middleware logs field NAMES + zod issue codes only — never
 * values — so the OTP `code` and emails never reach the logs even on a miss.
 */

import { z } from "zod";

const EMAIL_MAX = 320; // RFC 5321 practical address cap

/** Loose email: non-empty, length-capped, lowercased+trimmed. Not RFC-strict. */
const emailField = z
  .string({ message: "email is required" })
  .trim()
  .toLowerCase()
  .min(1, "email is required")
  .max(EMAIL_MAX);

/** POST /api/auth/otp/request — body { email, isAdminLogin? } */
export const otpRequestSchema = z
  .object({
    email: emailField,
    isAdminLogin: z.boolean().optional(),
  })
  .passthrough();

/** POST /api/auth/otp/verify — body { email, code, isAdminLogin?, leadgen_session_id? } */
export const otpVerifySchema = z
  .object({
    email: emailField,
    // 6-digit code today, but accept any short non-empty string to avoid
    // rejecting a legitimate-but-unexpected format during the warn soak.
    code: z
      .string({ message: "code is required" })
      .trim()
      .min(1, "code is required")
      .max(12),
    isAdminLogin: z.boolean().optional(),
    leadgen_session_id: z.string().max(64).optional(),
  })
  .passthrough();

/**
 * POST /api/auth/otp/validate — body { token? }
 * Token may instead arrive in the Authorization header, so the body is fully
 * optional; the handler resolves header-or-body itself.
 */
export const otpValidateSchema = z
  .object({
    token: z.string().optional(),
  })
  .passthrough();

export type OtpRequestBody = z.infer<typeof otpRequestSchema>;
export type OtpVerifyBody = z.infer<typeof otpVerifySchema>;
export type OtpValidateBody = z.infer<typeof otpValidateSchema>;
