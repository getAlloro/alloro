/**
 * JWT Management Service
 *
 * Handles JWT token generation and verification for auth.
 */

import jwt from "jsonwebtoken";

/**
 * Read JWT_SECRET lazily at call time so dotenv.config() has already run.
 * Top-level const would capture the value before dotenv loads .env (ESM hoisting).
 */
function getJwtSecret(): string {
  return process.env.JWT_SECRET || "dev-secret-key-change-in-prod";
}

export interface JwtPayload {
  userId: number;
  email: string;
  isPilot?: boolean;
}

/** Session lifetime for all login tokens (regular, admin, pilot). */
export const SESSION_TOKEN_TTL = "7d";

/** Response header carrying a re-issued token when a session is past half-life. */
export const SESSION_REFRESH_HEADER = "x-session-refresh";

const SESSION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_THRESHOLD_MS = SESSION_TOKEN_TTL_MS / 2;

/**
 * Generates a JWT token with a 7-day expiry.
 */
export function generateToken(userId: number, email: string): string {
  return jwt.sign(
    { userId, email },
    getJwtSecret(),
    { expiresIn: SESSION_TOKEN_TTL }
  );
}

/**
 * Sliding expiry: re-issues a fresh 7-day token once the current one is past
 * half its life, so active users never get logged out while sessions left
 * idle for 7+ days still expire.
 *
 * Builds a clean payload (jwt.sign throws if the payload already carries exp)
 * and preserves the isPilot claim so pilot sessions stay marked across refreshes.
 * Returns null while the token is still young.
 */
export function getRefreshedSessionToken(
  decoded: JwtPayload & { exp?: number }
): string | null {
  if (!decoded.exp) return null;

  const remainingMs = decoded.exp * 1000 - Date.now();
  if (remainingMs >= REFRESH_THRESHOLD_MS) return null;

  const payload: JwtPayload = {
    userId: decoded.userId,
    email: decoded.email,
    ...(decoded.isPilot ? { isPilot: true } : {}),
  };

  return jwt.sign(payload, getJwtSecret(), { expiresIn: SESSION_TOKEN_TTL });
}

/**
 * Verifies a JWT token and returns the decoded payload.
 * Returns null if the token is invalid or expired.
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}
