/**
 * JWT Configuration — single source of truth for the signing/verification secret.
 *
 * Fails CLOSED: if JWT_SECRET is unset, every call throws instead of falling
 * back to a hardcoded default. This removes the previous fail-open behavior
 * where a missing env var silently used `"dev-secret-key-change-in-prod"` (or,
 * in the billing gate, a different `"secret"` literal — a sign/verify desync).
 *
 * Read lazily at call time (not at module load) so dotenv.config() has already
 * run regardless of import order. The throw still fires on the first auth
 * operation at startup, which is the intended "refuse to operate without the
 * secret" safety net. Mirrors the centralization pattern in config/stripe.ts.
 */

/**
 * Returns the JWT secret. Throws if JWT_SECRET is not configured.
 * All sign and verify call sites MUST use this so they agree on one secret.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not configured. Set JWT_SECRET in environment variables — the app will not sign or verify tokens without it."
    );
  }
  return secret;
}
