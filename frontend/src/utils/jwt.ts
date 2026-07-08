/**
 * jwt — decode claims from a JWT payload on the client without a full library.
 *
 * The token's signature is verified server-side; this only reads a non-sensitive
 * claim (the signed-in userId) already present in the browser's own token, e.g.
 * to confirm two tokens belong to the same user. Returns null on a missing or
 * malformed token — callers must treat that as "cannot determine identity" and
 * fail safe (the server still enforces the real authorization check).
 */

interface JwtIdentityClaims {
  userId?: unknown;
  id?: unknown;
  user_id?: unknown;
}

/** Decode the signed-in user id from a JWT's payload, or null if unreadable. */
export function decodeJwtUserId(
  token: string | null | undefined
): number | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    ) as JwtIdentityClaims;
    const id = decoded?.userId ?? decoded?.id ?? decoded?.user_id;
    return typeof id === "number" ? id : null;
  } catch {
    return null;
  }
}
