/**
 * Pure control logic for the Owner Receipt card's transparency controls.
 *
 * The card lets the owner pick WHICH honest window they compare and filter the
 * dated actions — the control itself is the honesty: an owner who can move the
 * window and watch the number recompute (including seeing "not measured" when a
 * window lacks coverage) never has to trust one hand-picked number. This module
 * holds only the date arithmetic and the filter predicate, kept pure and
 * framework-free so it is unit-testable apart from React (§13.x — logic out of
 * the view). No clock lives inside a pure function: callers pass `today`.
 *
 * These controls change only WHICH honest number shows. Every honesty gate
 * (null -> "not measured" never 0; delta only when sufficient; diagnosis only
 * when diagnosable; the coverage reason) lives upstream in ownerReceiptCopy.ts
 * and the backend, and is untouched here.
 */

import type {
  OwnerReceiptActionItem,
  OwnerReceiptWindows,
} from "../../../api/ownerReceipt";

/** `YYYY-MM-DD` for a Date, read in the viewer's local calendar (not UTC). */
export function isoDayLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** True when `iso` is a real `YYYY-MM-DD` calendar day. */
export function isValidIsoDay(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/** `iso` shifted by `delta` whole days, still `YYYY-MM-DD`. UTC math, no clock. */
export function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/** Inclusive day count of `[start, end]`, or `null` when the range is invalid. */
export function daysInclusive(start: string, end: string): number | null {
  if (!isValidIsoDay(start) || !isValidIsoDay(end)) return null;
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * Two adjacent, equal-length windows ending at `postEnd`: a POST window of
 * `days` days ending on `postEnd`, and a PRE window of the same length sitting
 * immediately before it. Equal length is what keeps the before/after fair.
 */
export function deriveAdjacentWindows(
  postEnd: string,
  days: number,
): OwnerReceiptWindows {
  const postStart = addDays(postEnd, -(days - 1));
  const preEnd = addDays(postStart, -1);
  const preStart = addDays(preEnd, -(days - 1));
  return { preStart, preEnd, postStart, postEnd };
}

/**
 * Windows for a custom POST range: the given `[postStart, postEnd]` plus an
 * equal-length PRE window immediately before it. `null` when the range is
 * invalid, so the caller keeps the last honest windows rather than querying a
 * broken pair.
 */
export function deriveWindowsFromPost(
  postStart: string,
  postEnd: string,
): OwnerReceiptWindows | null {
  const len = daysInclusive(postStart, postEnd);
  if (len === null) return null;
  const preEnd = addDays(postStart, -1);
  const preStart = addDays(preEnd, -(len - 1));
  return { preStart, preEnd, postStart, postEnd };
}

/** A named comparison window the owner can pick. */
export interface WindowPreset {
  /** Stable id (the day-length as a string), also the segmented-control value. */
  id: string;
  /** Full owner-facing label. */
  label: string;
  /** Short label for a compact control. */
  shortLabel: string;
  days: number;
  windows: OwnerReceiptWindows;
}

/** The honest presets, computed from `today` (`YYYY-MM-DD`). Longest last. */
export function buildWindowPresets(today: string): WindowPreset[] {
  return [28, 90].map((days) => ({
    id: String(days),
    label: `Last ${days} days vs previous ${days}`,
    shortLabel: `${days} days`,
    days,
    windows: deriveAdjacentWindows(today, days),
  }));
}

/** True when two window pairs are the same four days. */
export function windowsEqual(
  a: OwnerReceiptWindows,
  b: OwnerReceiptWindows,
): boolean {
  return (
    a.preStart === b.preStart &&
    a.preEnd === b.preEnd &&
    a.postStart === b.postStart &&
    a.postEnd === b.postEnd
  );
}

/**
 * Which preset the given windows match, or `null` when they match none (a
 * custom range). Lets the control light up the active preset honestly.
 */
export function matchPresetId(
  windows: OwnerReceiptWindows,
  presets: WindowPreset[],
): string | null {
  const hit = presets.find((p) => windowsEqual(p.windows, windows));
  return hit ? hit.id : null;
}

/**
 * Filter dated actions by a plain text query over each item's owner-facing
 * label. An empty/whitespace query returns every item unchanged. Pure: the
 * caller supplies `labelFor` so the filter matches exactly what's on screen.
 */
export function filterActionItems(
  items: OwnerReceiptActionItem[],
  query: string,
  labelFor: (item: OwnerReceiptActionItem) => string,
): OwnerReceiptActionItem[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return items;
  return items.filter((item) =>
    labelFor(item).toLowerCase().includes(needle),
  );
}
