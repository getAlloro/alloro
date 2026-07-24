/**
 * Receipt date-window arithmetic (pure, framework-free — §6.2).
 *
 * A "before -> after" number is only honest when the two windows are
 * COMPARABLE. Completeness is not comparability: two windows can each have
 * every single day stored and still produce a delta that measures the calendar
 * rather than the practice.
 *
 * Why it matters, concretely: impressions and leads are COUNTS — they scale
 * with window length. CTR and CRO are RATES — they do not. So a 14-day PRE
 * against a 28-day POST inflates the impressions term by exactly
 * `ln(28/14)` and leaves the rate terms untouched. A practice whose daily
 * performance did not move by one point reads as "+100%, driven by
 * impressions". Nothing downstream can undo that, because by the time the
 * numbers are subtracted the window lengths are gone.
 *
 * These helpers are the single place that decides whether a pair of windows may
 * be subtracted at all. Shared by the patient-journey impressions-lift reader
 * and the owner-receipt boundary so the two cannot drift apart (§4.3).
 *
 * Every reason string here is owner-safe plain words: it may be surfaced
 * verbatim in a card, so it names what is wrong with the request, never an
 * internal symbol.
 */

import { MAX_RECEIPT_WINDOW_DAYS } from "../config/patientJourney";

/** A closed date window, inclusive of both ends, as `YYYY-MM-DD` strings. */
export interface DateWindow {
  start: string;
  end: string;
}

/** Trim a text / timestamp date to `YYYY-MM-DD`, or `null` if unusable. */
export function isoDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = String(value).split(/[T ]/)[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

const MS_PER_DAY = 86_400_000;

/**
 * Inclusive count of calendar days in [start, end]. Returns `null` for a
 * malformed or inverted window (start after end) — a null span makes the window
 * un-coverable, which surfaces honestly rather than inventing a span.
 *
 * Both bounds are parsed as UTC midnights so no DST transition can perturb the
 * arithmetic.
 */
export function inclusiveDaySpan(start: string, end: string): number | null {
  const s = isoDay(start);
  const e = isoDay(end);
  if (!s || !e) return null;
  const startMs = Date.parse(`${s}T00:00:00Z`);
  const endMs = Date.parse(`${e}T00:00:00Z`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return null;
  }
  return Math.round((endMs - startMs) / MS_PER_DAY) + 1;
}

/** Why a pair of windows may not be subtracted. */
export type WindowIncomparability =
  | "invalid_window"
  | "window_too_long"
  | "unequal_length"
  | "overlapping";

export interface WindowComparability {
  /** True only when a before -> after delta over this pair would be honest. */
  comparable: boolean;
  /** Inclusive day span of each window; `null` when the window is malformed. */
  preDays: number | null;
  postDays: number | null;
  /** Machine-readable cause; `null` when comparable. */
  kind: WindowIncomparability | null;
  /** Owner-safe plain-words reason; `null` when comparable. */
  reason: string | null;
}

/**
 * Decide whether a PRE/POST pair may be compared.
 *
 * Refuses, in order: a malformed or inverted window, a window longer than
 * `MAX_RECEIPT_WINDOW_DAYS`, an unequal-length pair, and an overlapping pair.
 * A pair that survives all four is safe to subtract.
 */
export function compareReceiptWindows(
  preWindow: DateWindow,
  postWindow: DateWindow,
): WindowComparability {
  const preDays = inclusiveDaySpan(preWindow.start, preWindow.end);
  const postDays = inclusiveDaySpan(postWindow.start, postWindow.end);

  if (preDays === null || postDays === null) {
    return {
      comparable: false,
      preDays,
      postDays,
      kind: "invalid_window",
      reason:
        "the before/after dates are not a valid range (each window needs a start on or before its end)",
    };
  }

  if (
    preDays > MAX_RECEIPT_WINDOW_DAYS ||
    postDays > MAX_RECEIPT_WINDOW_DAYS
  ) {
    return {
      comparable: false,
      preDays,
      postDays,
      kind: "window_too_long",
      reason: `each window must be ${MAX_RECEIPT_WINDOW_DAYS} days or fewer (asked for ${Math.max(preDays, postDays)})`,
    };
  }

  if (preDays !== postDays) {
    return {
      comparable: false,
      preDays,
      postDays,
      kind: "unequal_length",
      reason: `the before and after windows are different lengths (${preDays} vs ${postDays} days), so a change would measure the calendar, not the practice`,
    };
  }

  const preEnd = isoDay(preWindow.end);
  const postStart = isoDay(postWindow.start);
  // Non-null: a null span was already refused above.
  if (preEnd !== null && postStart !== null && postStart <= preEnd) {
    return {
      comparable: false,
      preDays,
      postDays,
      kind: "overlapping",
      reason:
        "the before and after windows overlap, so this is not a before-and-after comparison",
    };
  }

  return {
    comparable: true,
    preDays,
    postDays,
    kind: null,
    reason: null,
  };
}
