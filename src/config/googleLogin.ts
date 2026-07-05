/**
 * Google SSO Login Configuration — single source of truth for the login OAuth
 * client (admin sign-in; plans/07052026-google-sso-admin-and-user-login).
 *
 * DISTINCT from the GBP/GSC OAuth client (config/env `GOOGLE_CLIENT_ID` used by
 * controllers/auth + controllers/googleauth). This login client lives in the
 * Internal "Alloro" Google project and uses the `GOOGLE_LOGIN_*` env vars.
 *
 * Fails CLOSED (mirrors config/jwt.ts): if the vars are unset, the getter
 * throws instead of falling back — the throw fires on the first sign-in
 * attempt, which is the intended "refuse to operate without config" net (§5.6).
 * Read lazily at call time so dotenv.config() has already run.
 */

export interface GoogleLoginConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Returns the login OAuth client config. Throws if any of the three
 * GOOGLE_LOGIN_* env vars is missing.
 */
export function getGoogleLoginConfig(): GoogleLoginConfig {
  const clientId = process.env.GOOGLE_LOGIN_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_LOGIN_SECRET;
  const redirectUri = process.env.GOOGLE_LOGIN_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google SSO login is not configured. Set GOOGLE_LOGIN_CLIENT_ID, " +
        "GOOGLE_LOGIN_SECRET, and GOOGLE_LOGIN_REDIRECT_URI in the environment."
    );
  }

  return { clientId, clientSecret, redirectUri };
}

/**
 * The domain that grants admin access. A verified Google account on this domain
 * is an admin (the "any @getalloro = admin" model). Enforced in code
 * (service.google-identity + middleware/superAdmin) on top of the project's
 * Internal consent screen. Overridable via ADMIN_ALLOWED_DOMAIN for testing.
 */
export const ADMIN_ALLOWED_DOMAIN = (
  process.env.ADMIN_ALLOWED_DOMAIN || "getalloro.com"
)
  .trim()
  .toLowerCase();
