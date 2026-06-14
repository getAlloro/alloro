/**
 * Temporary Password Generator
 *
 * Generates a 12-character temporary password using a CSPRNG.
 * Guarantees at least one uppercase, one lowercase, and one digit, then
 * applies an unbiased Fisher–Yates shuffle.
 *
 * crypto.randomInt is uniform and unpredictable (unlike Math.random, which is
 * not a CSPRNG and must never seed a credential).
 */

import crypto from "crypto";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const DIGITS = "23456789";

/**
 * Generate a CSPRNG-backed 12-char temporary password.
 * Matches the original generateTempPassword logic exactly.
 */
export function generate(): string {
  const all = UPPER + LOWER + DIGITS;

  const pick = (charset: string): string =>
    charset[crypto.randomInt(charset.length)];

  // Ensure at least 1 uppercase, 1 lowercase, 1 digit
  const chars: string[] = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  for (let i = 3; i < 12; i++) {
    chars.push(pick(all));
  }

  // Unbiased Fisher–Yates shuffle (the old `.sort(() => Math.random() - 0.5)`
  // is statistically biased and non-cryptographic).
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}
