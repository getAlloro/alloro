/**
 * Auth route schemas (OAuth flow — src/routes/auth.ts).
 *
 * NOTE on scope: the plan's T2 anticipated "login/register/refresh bodies" on
 * this router, but the CURRENT src/routes/auth.ts is the Google OAuth flow and
 * is entirely GET-based — it takes NO request body. The email/password
 * login + register bodies actually live on src/routes/auth-password.ts and are
 * covered by authPassword.schemas.ts. The OTP bodies live on src/routes/
 * auth-otp.ts (authOtp.schemas.ts). So the only validatable input on THIS
 * router is the `:connectionId` route param on GET /google/validate/:connectionId.
 *
 * Schemas are permissive-first (warn-only soak): they encode the obvious shape
 * the handler relies on, nothing tighter, until warn logs show real traffic.
 */

import { z } from "zod";

/**
 * GET /api/auth/google/validate/:connectionId
 * The controller looks the connection up by id. It is a positive integer in
 * the DB; accept the numeric-string form Express delivers in params. Coerced
 * so enforce mode (later) hands the controller a clean value, but kept loose
 * (any positive int) rather than asserting an upper bound we haven't observed.
 */
export const validateTokenParamsSchema = z.object({
  connectionId: z.coerce
    .number({ message: "connectionId must be numeric" })
    .int()
    .positive(),
});

export type ValidateTokenParams = z.infer<typeof validateTokenParamsSchema>;
