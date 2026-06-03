/**
 * Per-site Rybbit reporting timezone resolution.
 *
 * Rybbit has no per-site timezone of its own — its stats endpoints bucket purely
 * by the `time_zone` query parameter. We store an optional IANA zone per practice
 * on `website_builder.projects.rybbit_time_zone`. When it is unset (or invalid),
 * every caller falls back to Eastern, which preserves the behavior every Rybbit
 * site shipped with before the column existed.
 *
 * This module is the single source of truth for that default — no other file
 * should hardcode the zone literal.
 */

export const RYBBIT_DEFAULT_TIME_ZONE = "America/New_York";

/**
 * True when `value` is a non-empty IANA timezone the platform recognizes.
 * Validation is delegated to the `Intl` API (a RangeError marks it invalid),
 * so no external timezone dependency is required.
 */
export function isValidIanaTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a stored per-site zone to the zone Rybbit requests should use,
 * falling back to {@link RYBBIT_DEFAULT_TIME_ZONE} when absent or invalid.
 */
export function resolveRybbitTimeZone(value: string | null | undefined): string {
  return isValidIanaTimeZone(value) ? value : RYBBIT_DEFAULT_TIME_ZONE;
}
