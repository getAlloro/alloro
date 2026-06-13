import type { PmsDashboardMonth } from "./types";

/**
 * pmsPeriod — pure helpers for the Referrals Hub MONTH / QTR / YTD toggle.
 *
 * All aggregation is client-side from the existing 12-month `months[]`
 * series — no backend param. "Current" is anchored to the LATEST month
 * present in the data (not wall-clock now), matching how the vitals row
 * already derives "this month".
 *
 * Spec: plans/06102026-referrals-hub-simplification/spec.html (T2)
 */

export type Period = "MONTH" | "QTR" | "YTD";

export interface HubTrendDatum {
  /** Short x-axis label ("Sep", "Q3 '25"). */
  label: string;
  /** Disambiguated label for the hover-scoped stat tile ("Sep '25"). */
  fullLabel: string;
  production: number;
  referrals: number;
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * The orchestrator hands the surface DISPLAY labels ("Apr 2026"), not
 * "YYYY-MM" keys (PMSVisualPillars formats months before passing them
 * down). Parse both forms — same dual handling the retired
 * PmsDashboardSurface used in normalizeMonthKey.
 *
 * Exported: ProductionPanel (Practice Hub) reuses this as the canonical
 * month-key parser so its YTD filter works on BOTH formats.
 */
export function parseYM(month: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})/.exec(month);
  if (m) return { year: Number(m[1]), month: Number(m[2]) };
  const parsed = new Date(`${month} 1`);
  if (Number.isNaN(parsed.getTime())) return null;
  return { year: parsed.getFullYear(), month: parsed.getMonth() + 1 };
}

function monthShort(month: string): string {
  const p = parseYM(month);
  return p && p.month >= 1 && p.month <= 12 ? MONTH_SHORT[p.month - 1] : month;
}

/** "Sep '25" — short month + 2-digit year for the hover-scoped tile. */
function monthShortWithYear(month: string): string {
  const p = parseYM(month);
  if (!p || p.month < 1 || p.month > 12) return month;
  return `${MONTH_SHORT[p.month - 1]} '${String(p.year).slice(2)}`;
}

function quarterOf(monthNum: number): number {
  return Math.floor((monthNum - 1) / 3) + 1;
}

/** Chronological sort via parsed keys — label strings sort alphabetically. */
function sortAsc(months: PmsDashboardMonth[]): PmsDashboardMonth[] {
  return [...months].sort((a, b) => {
    const pa = parseYM(a.month);
    const pb = parseYM(b.month);
    if (!pa || !pb) return a.month.localeCompare(b.month);
    return pa.year * 12 + pa.month - (pb.year * 12 + pb.month);
  });
}

function sum(months: PmsDashboardMonth[]): { production: number; referrals: number } {
  return months.reduce(
    (acc, m) => ({
      production: acc.production + (Number(m.productionTotal) || 0),
      referrals: acc.referrals + (Number(m.totalReferrals) || 0),
    }),
    { production: 0, referrals: 0 },
  );
}

/** Chart series for the selected period. */
export function bucketByPeriod(
  months: PmsDashboardMonth[],
  period: Period,
): HubTrendDatum[] {
  const sorted = sortAsc(months);

  if (period === "MONTH") {
    return sorted.map((m) => ({
      label: monthShort(m.month),
      fullLabel: monthShortWithYear(m.month),
      production: Number(m.productionTotal) || 0,
      referrals: Number(m.totalReferrals) || 0,
    }));
  }

  if (period === "YTD") {
    const latest = parseYM(sorted.at(-1)?.month ?? "");
    if (!latest) return [];
    return sorted
      .filter((m) => parseYM(m.month)?.year === latest.year)
      .map((m) => ({
        label: monthShort(m.month),
        fullLabel: monthShortWithYear(m.month),
        production: Number(m.productionTotal) || 0,
        referrals: Number(m.totalReferrals) || 0,
      }));
  }

  // QTR — sum months into year-quarter buckets.
  const buckets = new Map<
    string,
    { year: number; q: number; production: number; referrals: number }
  >();
  for (const m of sorted) {
    const p = parseYM(m.month);
    if (!p) continue;
    const q = quarterOf(p.month);
    const key = `${p.year}-Q${q}`;
    const b = buckets.get(key) ?? { year: p.year, q, production: 0, referrals: 0 };
    b.production += Number(m.productionTotal) || 0;
    b.referrals += Number(m.totalReferrals) || 0;
    buckets.set(key, b);
  }
  return [...buckets.values()]
    .sort((a, b) => a.year - b.year || a.q - b.q)
    .map((b) => {
      const label = `Q${b.q} '${String(b.year).slice(2)}`;
      return {
        label,
        fullLabel: label,
        production: b.production,
        referrals: b.referrals,
      };
    });
}

/**
 * The latest uploaded month KEY (display-label form, e.g. "Apr 2026") — the
 * canonical "current" anchor the surface names via formatDataMonth. Reuses the
 * same ascending sort scopedTotals/bucketByPeriod use, so "latest" is identical
 * across the chart, the tiles, and the named-month label. Null when no months.
 */
export function latestMonthKey(months: PmsDashboardMonth[]): string | null {
  return sortAsc(months).at(-1)?.month ?? null;
}

/** Headline totals scoped to the selected period (anchored to latest data month). */
export function scopedTotals(
  months: PmsDashboardMonth[],
  period: Period,
): { production: number; referrals: number } {
  const sorted = sortAsc(months);
  const last = sorted.at(-1);
  if (!last) return { production: 0, referrals: 0 };
  const lp = parseYM(last.month);

  if (period === "MONTH") {
    return {
      production: Number(last.productionTotal) || 0,
      referrals: Number(last.totalReferrals) || 0,
    };
  }

  if (period === "YTD") {
    return sum(sorted.filter((m) => parseYM(m.month)?.year === lp?.year));
  }

  // QTR — months sharing the latest month's year + quarter.
  const lastQ = lp ? quarterOf(lp.month) : 0;
  return sum(
    sorted.filter((m) => {
      const p = parseYM(m.month);
      return p && p.year === lp?.year && quarterOf(p.month) === lastQ;
    }),
  );
}

/** Label appended to the chart eyebrow. */
export function periodChartLabel(period: Period): string {
  return period === "MONTH" ? "Last 12 mo" : period === "QTR" ? "By quarter" : "Year to date";
}
