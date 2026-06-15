/**
 * Auth-password route schemas (src/routes/auth-password.ts).
 *
 * Covers register / verify-email / login / resend-verification /
 * forgot-password / reset-password bodies. PERMISSIVE-FIRST (warn-only soak):
 * the controller already enforces password strength (>=8, upper, digit) and
 * email format imperatively — these schemas only assert presence + sane length
 * caps so the warn pass does not flag a password that the controller would have
 * accepted. Strength is intentionally NOT duplicated here yet; tighten from the
 * soak, not from imagination.
 *
 * REDACTION: the middleware logs field NAMES + issue codes only — passwords and
 * verification/reset codes never reach the logs even on a validation miss.
 */

import { z } from "zod";

const EMAIL_MAX = 320; // RFC 5321 practical address cap
const PASSWORD_MAX = 200; // generous cap; bcrypt truncates at 72 bytes anyway

/** Loose email: non-empty, length-capped, trimmed. Controller does format check. */
const emailField = z
  .string({ message: "email is required" })
  .trim()
  .min(1, "email is required")
  .max(EMAIL_MAX);

/** Presence + length only — strength stays in the controller during the soak. */
const passwordField = z
  .string({ message: "password is required" })
  .min(1, "password is required")
  .max(PASSWORD_MAX);

/** 6-digit code today; accept any short non-empty string during the warn soak. */
const codeField = z
  .string({ message: "code is required" })
  .trim()
  .min(1, "code is required")
  .max(12);

const leadgenSessionField = z.string().max(64).optional();

/** POST /api/auth/register — { email, password, confirmPassword } */
export const registerSchema = z
  .object({
    email: emailField,
    password: passwordField,
    confirmPassword: passwordField,
  })
  .passthrough();

/** POST /api/auth/verify-email — { email, code, leadgen_session_id? } */
export const verifyEmailSchema = z
  .object({
    email: emailField,
    code: codeField,
    leadgen_session_id: leadgenSessionField,
  })
  .passthrough();

/** POST /api/auth/login — { email, password } */
export const loginSchema = z
  .object({
    email: emailField,
    password: passwordField,
  })
  .passthrough();

/** POST /api/auth/resend-verification — { email } */
export const resendVerificationSchema = z
  .object({
    email: emailField,
  })
  .passthrough();

/** POST /api/auth/forgot-password — { email } */
export const forgotPasswordSchema = z
  .object({
    email: emailField,
  })
  .passthrough();

/** POST /api/auth/reset-password — { email, code, password, confirmPassword } */
export const resetPasswordSchema = z
  .object({
    email: emailField,
    code: codeField,
    password: passwordField,
    confirmPassword: passwordField,
  })
  .passthrough();

export type RegisterBody = z.infer<typeof registerSchema>;
export type VerifyEmailBody = z.infer<typeof verifyEmailSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type ResendVerificationBody = z.infer<typeof resendVerificationSchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;
