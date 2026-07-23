/**
 * Business logic for Clarity metrics processing.
 * Aggregation, trend scoring, and month-range splitting.
 */
import type { IClarityData } from "../../../models/ClarityDataModel";
import {
  extractMetrics,
  ClarityMetrics,
} from "../feature-utils/util.clarity-metrics-extraction";
import type { MonthRanges } from "../feature-utils/util.clarity-date-ranges";

export interface KeyDataResult {
  sessions: { prevMonth: number; currMonth: number };
  bounceRate: { prevMonth: number; currMonth: number };
  deadClicks: { prevMonth: number; currMonth: number };
  /** Rage clicks per month. Additive: no existing consumer reads it yet. */
  rageClicks: { prevMonth: number; currMonth: number };
  /** Average scroll depth, null when Clarity had no reading for that month. */
  scrollDepth: { prevMonth: number | null; currMonth: number | null };
  trendScore: number;
}

/**
 * Orchestrator: process key data from rows and month ranges.
 * Splits rows by month, aggregates each, and computes trend score.
 */
export const processKeyData = (
  rows: IClarityData[],
  ranges: MonthRanges
): KeyDataResult => {
  const { prevMonthRows, currMonthRows } = splitRowsByMonthRanges(
    rows,
    ranges
  );

  const prevMonthData = aggregateMetrics(prevMonthRows);
  const currMonthData = aggregateMetrics(currMonthRows);
  const trendScore = calculateTrendScore(currMonthData, prevMonthData);

  return {
    sessions: {
      prevMonth: prevMonthData.sessions,
      currMonth: currMonthData.sessions,
    },
    bounceRate: {
      prevMonth: prevMonthData.bounceRate,
      currMonth: currMonthData.bounceRate,
    },
    deadClicks: {
      prevMonth: prevMonthData.deadClicks,
      currMonth: currMonthData.deadClicks,
    },
    rageClicks: {
      prevMonth: prevMonthData.rageClicks,
      currMonth: currMonthData.rageClicks,
    },
    scrollDepth: {
      prevMonth: prevMonthData.scrollDepth,
      currMonth: currMonthData.scrollDepth,
    },
    trendScore,
  };
};

/**
 * Normalize report_date to a YYYY-MM-DD string.
 * Handles both string and Date values (DB drivers may return either).
 */
const normalizeReportDate = (reportDate: string | Date): string =>
  typeof reportDate === "string"
    ? reportDate
    : (reportDate as Date).toISOString().slice(0, 10);

/**
 * Split rows into previous-month and current-month buckets.
 */
export const splitRowsByMonthRanges = (
  rows: IClarityData[],
  ranges: MonthRanges
): { prevMonthRows: IClarityData[]; currMonthRows: IClarityData[] } => {
  const prevMonthRows = rows.filter((r) => {
    const reportDate = normalizeReportDate(r.report_date as string | Date);

    return (
      reportDate >= ranges.prevMonth.start &&
      reportDate <= ranges.prevMonth.end
    );
  });

  const currMonthRows = rows.filter((r) => {
    const reportDate = normalizeReportDate(r.report_date as string | Date);

    return (
      reportDate >= ranges.currMonth.start &&
      reportDate <= ranges.currMonth.end
    );
  });

  return { prevMonthRows, currMonthRows };
};

/**
 * Aggregate metrics across multiple data rows.
 * Sessions, dead clicks and rage clicks are summed; bounce rate is averaged.
 *
 * Scroll depth averages only the days that actually carried a reading. Days
 * Clarity reported as null are skipped rather than counted as zero, so a month
 * with no readings stays null instead of reporting that nobody scrolled.
 */
export const aggregateMetrics = (rows: IClarityData[]): ClarityMetrics => {
  let totalSessions = 0;
  let totalDeadClicks = 0;
  let totalRageClicks = 0;
  let bounceRates: number[] = [];
  let scrollDepths: number[] = [];

  for (const r of rows) {
    const parsed = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
    const m = extractMetrics(parsed);
    totalSessions += m.sessions;
    totalDeadClicks += m.deadClicks;
    totalRageClicks += m.rageClicks;
    bounceRates.push(m.bounceRate);
    if (m.scrollDepth !== null) scrollDepths.push(m.scrollDepth);
  }

  return {
    sessions: totalSessions,
    deadClicks: totalDeadClicks,
    rageClicks: totalRageClicks,
    bounceRate:
      bounceRates.length > 0
        ? bounceRates.reduce((a, b) => a + b, 0) / bounceRates.length
        : 0,
    scrollDepth:
      scrollDepths.length > 0
        ? scrollDepths.reduce((a, b) => a + b, 0) / scrollDepths.length
        : null,
  };
};

/**
 * Calculate weighted trend score comparing current vs previous period.
 *
 * Formula (PRESERVED EXACTLY):
 *   sessionsChange * 0.4 + -bounceChange * 0.35 + -deadClickChange * 0.25
 *
 * Sessions improvement is positive, bounce/dead-click improvement (decrease) is positive.
 *
 * Rage clicks and scroll depth are deliberately NOT folded in. Reweighting this
 * would silently move a number clients already see, on no evidence that the new
 * weights are better. They are extracted and exposed; changing the score is a
 * separate, argued decision.
 */
export const calculateTrendScore = (
  curr: ClarityMetrics,
  prev: ClarityMetrics
): number => {
  const sessionsChange =
    prev.sessions === 0
      ? 0
      : ((curr.sessions - prev.sessions) / prev.sessions) * 100;

  const bounceChange =
    prev.bounceRate === 0
      ? 0
      : ((curr.bounceRate - prev.bounceRate) / prev.bounceRate) * 100;

  const deadClickChange =
    prev.deadClicks === 0
      ? 0
      : ((curr.deadClicks - prev.deadClicks) / prev.deadClicks) * 100;

  // weights: sessions +40%, bounce (inverse) +35%, dead clicks (inverse) +25%
  const trendScore =
    sessionsChange * 0.4 + -bounceChange * 0.35 + -deadClickChange * 0.25;

  return Math.round(trendScore * 100) / 100;
};
