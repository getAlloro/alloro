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
 * - Conversion: headline is the "typical" blended rate (leads ÷ visitors across
 *   all months with data) so a partial month or a one-off traffic spike doesn't
 *   deflate it; MTD conversion is kept as a smaller secondary figure.
 *
 * Card charts are MONTHLY (daily series aggregated into month buckets, leading
 * no-data months trimmed) so the traffic cards share the leads cadence. The
 * traffic modal uses the DAILY series with absent days marked no-data (gaps).
 * Visitor months are never zero-filled — a missing month means Rybbit wasn't
 * tracking yet, not zero.
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
  /** blended verified-leads ÷ visitors across months with data — the "typical" rate */
  typicalConversionRate: number;
  /** how many months the typical rate is blended over */
  typicalMonths: number;
  /** % change, MTD vs same day-range last month */
  visitorsDeltaPct: number | null;
  /** % change, projected full-month leads vs last month full */
  leadsPaceDeltaPct: number | null;
  prevMonthLeads: number;
  /** monthly visitor series for the cards (aggregated, trimmed, last 12 months) */
  visitorSeries: Array<{
    label: string;
    visitors: number;
    sessions: number;
    pageviews: number;
    month: string;
    monthName: string;
  }>;
  /** daily visitor series for the traffic modal; absent days are no-data (null) */
  visitorDaily: Array<{
    date: string;
    label: string;
    visitors: number | null;
    sessions: number | null;
    pageviews: number | null;
    noData: boolean;
  }>;
  /** monthly leads series, full window (for the modal) */
  leadSeries: Array<{ label: string; leads: number }>;
  /** monthly leads series with the leading no-data run trimmed (for the card) */
  leadSeriesCompact: Array<{ label: string; leads: number }>;
  /** YYYY-MM → verified leads that month (to show leads for a hovered day's month) */
  leadsByMonth: Record<string, number>;
  /** totals over the analytics window (for the traffic modal) */
  totals: WebsiteAnalytics["totals"] | null;
  rangeDays: number;
}

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

function shortDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Drop the leading run of zero-value points — the "no data / pre-launch" stretch
 * (e.g. a flat zero line before the practice's first lead). Interior zeros are
 * kept (a real dip between active periods). An all-zero series is returned
 * unchanged so the caller still has something to render.
 */
function trimLeadingZeros<T>(items: T[], getValue: (item: T) => number): T[] {
  const firstActive = items.findIndex((item) => getValue(item) > 0);
  return firstActive > 0 ? items.slice(firstActive) : items;
}

/** Every ISO date (YYYY-MM-DD) from `firstISO` to `lastISO`, inclusive. */
function enumerateDays(firstISO: string, lastISO: string): string[] {
  const out: string[] = [];
  const start = Date.parse(`${firstISO}T00:00:00Z`);
  const end = Date.parse(`${lastISO}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return out;
  const DAY_MS = 86_400_000;
  for (let t = start; t <= end; t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Fallback monthly visitor buckets aggregated from the daily series. Used only
 * when the live per-month uniques aren't available — note this SUMS daily
 * `users`, which slightly over-counts true monthly uniques (repeat visitors).
 */
function aggregateMonthlyFromDaily(
  daily: WebsiteAnalytics["daily"],
): Array<{ month: string; visitors: number; sessions: number; pageviews: number }> {
  const map = new Map<
    string,
    { month: string; visitors: number; sessions: number; pageviews: number }
  >();
  for (const point of daily) {
    const month = point.date.slice(0, 7);
    const bucket = map.get(month) ?? { month, visitors: 0, sessions: 0, pageviews: 0 };
    bucket.visitors += point.users;
    bucket.sessions += point.sessions;
    bucket.pageviews += point.pageviews;
    map.set(month, bucket);
  }
  return Array.from(map.values());
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

  const monthlyTrue = analytics?.monthly ?? [];
  const hasMonthly = monthlyTrue.length > 0;
  const trueByMonth = new Map(monthlyTrue.map((p) => [p.month, p]));

  // Daily sums (month-to-date) from the stored daily series — used for the fair
  // MTD-vs-MTD visitor delta, and as the fallback for the headline counts when
  // the live monthly series is unavailable.
  let dailyCurUsers = 0;
  let dailyCurSessions = 0;
  let dailyCurPageviews = 0;
  let prevVisitorsMtd = 0; // last month, days 1..today
  let dailyPrevFull = 0;
  for (const point of daily) {
    const key = point.date.slice(0, 7);
    const day = Number(point.date.slice(8, 10));
    if (key === curKey) {
      dailyCurUsers += point.users;
      dailyCurSessions += point.sessions;
      dailyCurPageviews += point.pageviews;
    } else if (key === prevKey) {
      dailyPrevFull += point.users;
      if (day <= today) prevVisitorsMtd += point.users;
    }
  }

  const tsByMonth = new Map(timeseries.map((p) => [p.month, p]));
  const monthLeads = tsByMonth.get(curKey)?.verified ?? 0;
  const prevMonthLeads = tsByMonth.get(prevKey)?.verified ?? 0;

  // Headline counts prefer TRUE uniques (deduped per period by Rybbit) — summing
  // daily `users` over-counts repeat visitors ~10%. Sessions/pageviews are
  // additive so they match either way. Fall back to the daily sums when the live
  // monthly series isn't available (e.g. the live fetch failed, or wizard demo).
  const trueCur = trueByMonth.get(curKey);
  const truePrev = trueByMonth.get(prevKey);
  const monthVisitors = trueCur ? trueCur.users : dailyCurUsers;
  const monthSessions = trueCur ? trueCur.sessions : dailyCurSessions;
  const monthPageviews = trueCur ? trueCur.pageviews : dailyCurPageviews;
  const prevMonthVisitorsFull = truePrev ? truePrev.users : dailyPrevFull;

  // Monthly visitor series for the cards: TRUE per-month uniques when available,
  // else aggregated from the daily series. Most recent 12 months; the leading
  // no-data run is trimmed downstream (visitorSeriesTrimmed).
  const visitorSeries = (
    hasMonthly
      ? monthlyTrue.map((p) => ({
          month: p.month,
          visitors: p.users,
          sessions: p.sessions,
          pageviews: p.pageviews,
        }))
      : aggregateMonthlyFromDaily(daily)
  )
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12)
    .map((bucket) => ({
      label: monthLabel(bucket.month),
      monthName: monthLabel(bucket.month),
      month: bucket.month,
      visitors: bucket.visitors,
      sessions: bucket.sessions,
      pageviews: bucket.pageviews,
    }));

  const conversionRate = monthVisitors > 0 ? monthLeads / monthVisitors : 0;
  const prevConversionRate =
    prevMonthVisitorsFull > 0 ? prevMonthLeads / prevMonthVisitorsFull : 0;

  const leadsPace = today > 0 ? monthLeads * (daysInMonth / today) : monthLeads;

  // Cards drop the leading no-data run; the leads modal keeps the full window.
  const visitorSeriesTrimmed = trimLeadingZeros(visitorSeries, (p) => p.visitors);
  const leadSeriesFull = timeseries.map((p) => ({
    label: monthLabel(p.month),
    leads: p.verified,
  }));
  const leadSeriesCompact = trimLeadingZeros(leadSeriesFull, (p) => p.leads);

  // Continuous DAILY visitor series for the traffic detail modal. Rybbit stores
  // a row only for days that have data, so walk every calendar day from the
  // first to the last data day and mark absent days as no-data (null → the line
  // breaks at the gap instead of implying zero traffic).
  const dailyByDate = new Map(daily.map((p) => [p.date, p]));
  const firstDay = daily[0]?.date;
  const lastDay = daily[daily.length - 1]?.date;
  const visitorDaily =
    firstDay && lastDay
      ? enumerateDays(firstDay, lastDay).map((date) => {
          const point = dailyByDate.get(date);
          return {
            date,
            label: shortDate(date),
            visitors: point ? point.users : null,
            sessions: point ? point.sessions : null,
            pageviews: point ? point.pageviews : null,
            noData: !point,
          };
        })
      : [];

  // "Typical" conversion: verified leads ÷ visitors blended across the months we
  // actually have visitor data for. Steadier than a single partial month — it is
  // not deflated by a month-to-date window or a one-off traffic spike.
  let blendLeads = 0;
  let blendVisitors = 0;
  let typicalMonths = 0;
  for (const point of visitorSeriesTrimmed) {
    if (point.visitors <= 0) continue;
    blendVisitors += point.visitors;
    blendLeads += tsByMonth.get(point.month)?.verified ?? 0;
    typicalMonths += 1;
  }
  const typicalConversionRate =
    blendVisitors > 0 ? blendLeads / blendVisitors : conversionRate;

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
    visitorsDeltaPct: meaningfulDelta(dailyCurUsers, prevVisitorsMtd, 10),
    leadsPaceDeltaPct: meaningfulDelta(leadsPace, prevMonthLeads, 3),
    prevMonthLeads,
    typicalConversionRate,
    typicalMonths,
    visitorSeries: visitorSeriesTrimmed,
    visitorDaily,
    leadSeries: leadSeriesFull,
    leadSeriesCompact,
    leadsByMonth: Object.fromEntries(
      timeseries.map((p) => [p.month, p.verified]),
    ),
    totals: analytics?.totals ?? null,
    rangeDays: analytics?.dataDays ?? 0,
  };
}

const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;

/** "0.4%" style conversion-rate label. */
export function formatConversion(rate: number): string {
  return pct1(rate);
}
