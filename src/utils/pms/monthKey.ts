/**
 * monthKey — chronological ordering for PMS month keys.
 *
 * Month keys arrive in TWO formats depending on the ingest path: the
 * adapters emit "YYYY-MM", but the LLM monthly_rollup can emit display
 * labels ("Apr 2026"). Alphabetical sorts (localeCompare) silently
 * misorder labeled months, which broke:
 *   - the aggregator's 12-month cap (kept the wrong months),
 *   - production_change_30d (compared the wrong pair → ~0% deltas),
 *   - "this month" grounding values (alphabetically-last month),
 *   - per-source trend labels (latest vs prior were wrong months).
 *
 * Mirrors the frontend's pmsPeriod.parseYM dual handling.
 * Spec: plans/06112026-design-consistency-pass (T3 — wire up comparisons)
 */

export function parseMonthKey(
  month: string
): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})/.exec(month);
  if (m) return { year: Number(m[1]), month: Number(m[2]) };
  const parsed = new Date(`${month} 1`);
  if (Number.isNaN(parsed.getTime())) return null;
  return { year: parsed.getFullYear(), month: parsed.getMonth() + 1 };
}

/** Sortable scalar (YYYYMM); unparseable keys sort first. */
export function monthSortValue(month: string): number {
  const p = parseMonthKey(month);
  return p ? p.year * 100 + p.month : 0;
}

export function compareMonthKeys(a: string, b: string): number {
  return monthSortValue(a) - monthSortValue(b);
}
