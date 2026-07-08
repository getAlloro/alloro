/**
 * OTP Generation Service
 *
 * The OTP login email flow (createAndSendOtp) was retired with the admin OTP
 * login (plans/07052026-google-sso-admin-and-user-login, T7). This module now
 * only exposes the shared 6-digit code generator, still used by the
 * email/password auth flow (email verification + password reset).
 */

import crypto from "crypto";

export function generateSixDigitCode(): string {
  // crypto.randomInt is uniform over [min, max). 100000–999999 inclusive keeps
  // the output a 6-digit string with no modulo bias (unlike Math.random()).
  return crypto.randomInt(100000, 1000000).toString();
}
