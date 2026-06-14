import crypto from "crypto";
import { getJwtSecret } from "../../../config/jwt";
import logger from "../../../lib/logger";

/**
 * Generates a secure random state parameter for CSRF protection.
 * Uses crypto.randomBytes (cryptographically secure) rather than Math.random,
 * which is predictable and unsuitable for security tokens.
 * @returns Random state string (48 hex chars)
 */
export function generateSecureState(): string {
  return crypto.randomBytes(24).toString("hex");
}

/** State TTL — 10 minutes */
const STATE_TTL_MS = 10 * 60 * 1000;

export interface AuthenticatedContext {
  userId: number;
  orgId?: number;
}

/**
 * Encodes userId and orgId into a signed state string for OAuth.
 * Format: base64(payload).hmac
 */
export function encodeAuthState(userId: number, orgId?: number | null): string {
  const payload = JSON.stringify({
    userId,
    ...(orgId ? { orgId } : {}),
    nonce: crypto.randomBytes(8).toString("hex"),
    exp: Date.now() + STATE_TTL_MS,
  });
  const data = Buffer.from(payload).toString("base64url");
  const hmac = crypto
    .createHmac("sha256", getJwtSecret())
    .update(data)
    .digest("base64url");
  return `${data}.${hmac}`;
}

/**
 * Decodes and verifies a signed auth state string.
 * Returns null if invalid, expired, or tampered.
 */
export function decodeAuthState(state: string): AuthenticatedContext | null {
  try {
    const [data, hmac] = state.split(".");
    if (!data || !hmac) return null;

    const expectedHmac = crypto
      .createHmac("sha256", getJwtSecret())
      .update(data)
      .digest("base64url");

    if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(data, "base64url").toString());

    if (!payload.exp || Date.now() > payload.exp) {
      logger.info("[AUTH] Auth state expired");
      return null;
    }

    if (!payload.userId) return null;

    return {
      userId: payload.userId,
      orgId: payload.orgId || undefined,
    };
  } catch {
    return null;
  }
}
