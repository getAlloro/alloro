import type { WebsiteAnalytics } from "../../../api/websiteAnalytics";
import type { TimeseriesPoint } from "../../../api/formSubmissionsTimeseries";

/**
 * Owner-readable website performance metrics, computed client-side from the
 * existing analytics (daily) + form-submissions (monthly) series. No backend.
 *
 * Framing: the current calendar month, month-to-date (MTD).
 * - Visitor deltas: MTD vs the SAME day-range last month (daily data → accurate).
 * - Leads delta: this month is projected to full-month "pace" and compared to
 *   last month's full total (leads only arrive monthly, so pacing keeps the
 *   partial-month comparison honest).
 * - Conversion = verified leads ÷ unique visitors, this month.
 */
export interface WebsiteMetrics {
  hasAnalytics: boolean;
  monthVisitors: number;
  monthSessions: number;
  monthPageviews: number;
  monthLeads: number;
  /** 0..1 */
  conversionRate: number;
  prevConversionRate: number;
  /** percentage points (this month − last month) */
  conversionDeltaPp: number | null;
  /** % change, MTD vs same day-range last month */
  visitorsDeltaPct: number | null;
  /** % change, projected full-month leads vs last month full */
  leadsPaceDeltaPct: number | null;
  prevMonthLeads: number;
  /** daily visitor series for the sparkline */
  visitorSeries: Array<{ label: string; visitors: number }>;
  /** monthly leads series for the sparkline */
  leadSeries: Array<{ label: string; leads: number }>;
  /** totals over the analytics window (for the traffic modal) */
  totals: WebsiteAnalytics["totals"] | null;
  rangeDays: number;
}

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function shortDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Month-over-month % change, shown only when it's MEANINGFUL. Early in a month
 * (or for low-traffic sites) the prior baseline is tiny, which turns normal
 * swings into absurd percentages (e.g. 813 visitors vs a 3-visitor baseline =
 * +27000%). Suppress (return null) when the baseline is below `minBase` or the
 * swing is extreme enough to be noise rather than a trend.
 */
function meaningfulDelta(
  current: number,
  prior: number,
  minBase: number,
): number | null {
  if (prior < minBase) return null;
  const pct = ((current - prior) / prior) * 100;
  if (Math.abs(pct) > 500) return null;
  return pct;
}

export function computeWebsiteMetrics(
  analytics: WebsiteAnalytics | undefined,
  timeseries: TimeseriesPoint[],
  now: Date,
): WebsiteMetrics {
  const year = now.getFullYear();
  const monthIdx = now.getMonth();
  const today = now.getDate();
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const curKey = monthKey(year, monthIdx);
  const prevKey = monthKey(monthIdx === 0 ? year - 1 : year, (monthIdx + 11) % 12);

  const daily = analytics?.daily ?? [];
  const hasAnalytics = !!analytics?.hasIntegration && (analytics?.dataDays ?? 0) > 0;

  // Visitors: sum unique users by calendar window from the daily series.
  let monthVisitors = 0;
  let monthSessions = 0;
  let monthPageviews = 0;
  let prevVisitorsMtd = 0; // last month, days 1..today
  for (const point of daily) {
    const key = point.date.slice(0, 7);
    const day = Number(point.date.slice(8, 10));
    if (key === curKey) {
      monthVisitors += point.users;
      monthSessions += point.sessions;
      monthPageviews += point.pageviews;
    } else if (key === prevKey && day <= today) {
      prevVisitorsMtd += point.users;
    }
  }

  const tsByMonth = new Map(timeseries.map((p) => [p.month, p]));
  const monthLeads = tsByMonth.get(curKey)?.verified ?? 0;
  const prevMonthLeads = tsByMonth.get(prevKey)?.verified ?? 0;

  // Prior-month full visitors for the prior conversion rate.
  let prevMonthVisitorsFull = 0;
  for (const point of daily) {
    if (point.date.slice(0, 7) === prevKey) prevMonthVisitorsFull += point.users;
  }

  const conversionRate = monthVisitors > 0 ? monthLeads / monthVisitors : 0;
  const prevConversionRate =
    prevMonthVisitorsFull > 0 ? prevMonthLeads / prevMonthVisitorsFull : 0;

  const leadsPace = today > 0 ? monthLeads * (daysInMonth / today) : monthLeads;

  return {
    hasAnalytics,
    monthVisitors,
    monthSessions,
    monthPageviews,
    monthLeads,
    conversionRate,
    prevConversionRate,
    conversionDeltaPp:
      prevMonthVisitorsFull > 0 && monthVisitors > 0
        ? (conversionRate - prevConversionRate) * 100
        : null,
    visitorsDeltaPct: meaningfulDelta(monthVisitors, prevVisitorsMtd, 10),
    leadsPaceDeltaPct: meaningfulDelta(leadsPace, prevMonthLeads, 3),
    prevMonthLeads,
    visitorSeries: daily.map((p) => ({ label: shortDate(p.date), visitors: p.users })),
    leadSeries: timeseries.map((p) => ({ label: p.month, leads: p.verified })),
    totals: analytics?.totals ?? null,
    rangeDays: analytics?.dataDays ?? 0,
  };
}

const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;

/** "0.4%" style conversion-rate label. */
export function formatConversion(rate: number): string {
  return pct1(rate);
}
