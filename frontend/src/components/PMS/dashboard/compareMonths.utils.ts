import type { PmsKeyDataMonth, PmsKeyDataMonthSource } from "../../../api/pms";
import { monthSortValue } from "../../../utils/timeframe";

/**
 * Pure helpers for the Referrals Hub month-comparison modal. Per-month source
 * values can arrive as strings (raw monthly_rollup shape), so everything is
 * normalized through Number() here before the UI reads it.
 */

const toNumber = (value: unknown): number => {
  const parsed =
    typeof value === "string"
      ? Number(value.replace(/[^0-9.-]/g, ""))
      : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface NormalizedSource {
  name: string;
  referrals: number;
  production: number;
}

/** Normalize + sort a month's sources (highest referrals first). */
export function normalizeSources(
  sources: PmsKeyDataMonthSource[] | undefined
): NormalizedSource[] {
  if (!sources?.length) return [];
  return sources
    .map((source) => ({
      name: String(source.name ?? "").trim(),
      referrals: toNumber(source.referrals),
      production: toNumber(source.production),
    }))
    .filter((source) => source.name.length > 0)
    .sort((a, b) => b.referrals - a.referrals || b.production - a.production);
}

export type SourceMoveStatus = "up" | "down" | "same" | "new" | "gone";

export interface SourceComparisonRow {
  name: string;
  referralsA: number;
  referralsB: number;
  delta: number;
  status: SourceMoveStatus;
}

/**
 * Compare per-source referrals left-to-right (month A -> month B). Returns the
 * union of sources, most-changed first. "new"/"gone"/"up"/"down" describe the
 * move from A to B, so a source going 0 -> 4 reads as "new" (appeared in B).
 */
export function buildSourceComparison(
  monthA: PmsKeyDataMonth | null,
  monthB: PmsKeyDataMonth | null
): SourceComparisonRow[] {
  const a = new Map(
    normalizeSources(monthA?.sources).map((s) => [s.name, s.referrals])
  );
  const b = new Map(
    normalizeSources(monthB?.sources).map((s) => [s.name, s.referrals])
  );
  const names = new Set([...a.keys(), ...b.keys()]);

  const rows: SourceComparisonRow[] = [];
  for (const name of names) {
    const referralsA = a.get(name) ?? 0;
    const referralsB = b.get(name) ?? 0;
    const inA = a.has(name);
    const inB = b.has(name);

    // Move reads A -> B: "new" appeared in B, "gone" dropped out by B.
    let status: SourceMoveStatus;
    if (!inA && inB) status = "new";
    else if (inA && !inB) status = "gone";
    else if (referralsB > referralsA) status = "up";
    else if (referralsB < referralsA) status = "down";
    else status = "same";

    rows.push({ name, referralsA, referralsB, delta: referralsB - referralsA, status });
  }

  return rows.sort(
    (x, y) => Math.abs(y.delta) - Math.abs(x.delta) || y.referralsA - x.referralsA
  );
}

/** Available months sorted newest-first for the pickers. */
export function sortMonthsDesc(months: PmsKeyDataMonth[]): PmsKeyDataMonth[] {
  return [...months].sort((a, b) => monthSortValue(b.month) - monthSortValue(a.month));
}

/** Whole-number percent change of current vs previous; null when no baseline. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export interface InsightSegment {
  text: string;
  highlight: boolean;
}

/**
 * Split AI insight text on ==highlight== markers into renderable segments.
 * Text with no markers returns a single non-highlighted segment, so unmarked
 * model output still renders cleanly.
 */
export function parseHighlights(text: string): InsightSegment[] {
  const segments: InsightSegment[] = [];
  const regex = /==(.+?)==/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), highlight: false });
    }
    segments.push({ text: match[1], highlight: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), highlight: false });
  }
  return segments;
}
