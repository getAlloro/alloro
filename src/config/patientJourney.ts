/**
 * Patient Journey — named constants (§4.2).
 */

/**
 * Earliest date (inclusive, `YYYY-MM-DD`) whose stored daily GBP rows are
 * trusted for the "Get Found" Maps term.
 *
 * Before the unmapped-location fix, the daily processor stored the account's
 * FIRST listing's payload under every unmapped sibling location's id, so one
 * listing's Maps impressions appear N times in history. The reader gates
 * counting to locations that have a mapped GBP listing, but that judges PAST
 * rows by PRESENT mapping: the day an unmapped location gets a
 * `google_properties` row, its entire fabricated history becomes "mapped" and
 * the double count silently returns for every past month. A read-time
 * allow-list cannot hold, because the allow-list is exactly the thing that
 * changes.
 *
 * So the window is time-bound instead: only rows written after the fix are
 * trusted, and those cannot be fabricated because the fix stops writing them.
 * The cost is zero — every stored Maps value in history is 0 (1,229 of 1,229
 * rows measured 2026-07-13), so the dropped contribution is literally nothing.
 * That is why this is a clamp and not a destructive backfill: a migration over
 * live rows would change no computed number.
 *
 * A window entirely before this date makes the Maps term absent, and the gate
 * falls back to organic-only — an already-supported state.
 *
 * Set to the deploy date of the unmapped-location fix. If that fix deploys
 * LATER than this date, bump this constant to the actual deploy date —
 * otherwise rows written by the old processor in the gap stay trusted.
 * See `plans/07202026-pr-merge-remediation/pr-183-impressions.spec.html` (T6).
 */
export const MAPS_IMPRESSIONS_TRUSTED_FROM: number = "2026-07-21";
