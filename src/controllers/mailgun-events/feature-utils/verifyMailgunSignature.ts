import crypto from "crypto";

/**
 * Mailgun webhook HMAC verification. Mailgun signs each event POST with
 * HMAC-SHA256 over the concatenation (timestamp + token), keyed by the
 * account's webhook signing key. Timing-safe comparison; any malformed input
 * fails closed.
 */
export function verifyMailgunSignature(
  signingKey: string,
  timestamp: string,
  token: string,
  signature: string
): boolean {
  try {
    const expected = crypto
      .createHmac("sha256", signingKey)
      .update(timestamp + token)
      .digest("hex");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
