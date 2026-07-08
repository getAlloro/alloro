/**
 * Identity gating for Google SSO (ported from
 * alloro-os/backend/src/auth/domainGate.ts). Security-critical: gate on the
 * verified email + email_verified, never on the `hd` claim alone. Any failure
 * rejects and creates no user.
 */

import type { TokenPayload } from "google-auth-library";
import { ADMIN_ALLOWED_DOMAIN } from "../../../config/googleLogin";
import { AuthSsoError } from "../feature-utils/AuthSsoError";

export interface VerifiedIdentity {
  googleSub: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * Turn a verified Google token payload into our identity shape, or throw.
 * Requires a subject and a Google-verified email.
 */
export function assertGoogleIdentity(payload: TokenPayload): VerifiedIdentity {
  if (!payload.sub) {
    throw new AuthSsoError(
      "AUTH_INVALID_TOKEN",
      "Sign-in failed. Please try again.",
      401
    );
  }

  const email = (payload.email ?? "").trim().toLowerCase();
  if (!email || payload.email_verified !== true) {
    throw new AuthSsoError(
      "AUTH_EMAIL_UNVERIFIED",
      "Use your @getalloro.com Google account to sign in.",
      403
    );
  }

  return {
    googleSub: payload.sub,
    email,
    name: (payload.name ?? "").trim() || email,
    avatarUrl: payload.picture ?? null,
  };
}

/**
 * Admin gate: the verified email must be on the allowed domain. Defense in
 * depth on top of the project's Internal consent screen (which already blocks
 * non-Workspace accounts at Google's layer).
 */
export function assertAdminDomain(email: string): void {
  if (!email.endsWith(`@${ADMIN_ALLOWED_DOMAIN}`)) {
    throw new AuthSsoError(
      "AUTH_DOMAIN_FORBIDDEN",
      `Admin access requires an @${ADMIN_ALLOWED_DOMAIN} Google account.`,
      403
    );
  }
}
