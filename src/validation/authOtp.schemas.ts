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

/**
 * POST /api/auth/otp/validate — body { token? }
 * Token may instead arrive in the Authorization header, so the body is fully
 * optional; the handler resolves header-or-body itself.
 *
 * (The request/verify schemas were removed with the OTP login flow — T7,
 * plans/07052026-google-sso-admin-and-user-login.)
 */
export const otpValidateSchema = z
  .object({
    token: z.string().optional(),
  })
  .passthrough();

export type OtpValidateBody = z.infer<typeof otpValidateSchema>;
