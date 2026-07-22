/**
 * GBP window selector
 *
 * Pure, side-effect-free helpers that turn ONE trailing-window GBP Performance
 * response into the most-recent day(s) that actually carry data.
 *
 * THE BUG THIS EXISTS TO FIX. The daily agent used to fetch exactly yesterday
 * and the day before. The Business Profile Performance API trails several days
 * for impression metrics, so those two dates were usually absent from the
 * response entirely — `datedValues` came back empty, summing an empty array
 * produced `0`, and a live practice's Get Found number read zero for months.
 *
 * THE TWO STATES THE API DISTINGUISHES, and why they must never be conflated:
 *   - a datedValue ENTRY EXISTS for a date, with `value` omitted → the day
 *     reported and there were zero interactions. A real, measured zero.
 *   - NO entry exists for a date → Google has not published that day yet.
 *     Unknown, not zero.
 * Summing collapsed both into `0`. Everything here keeps them apart: a date is
 * "covered" if an entry exists, whatever its value.
 *
 * The mechanism is most-recent-day-with-data, NOT a fixed offset. Subtracting a
 * hard-coded "skip N lagging days" would break silently the day Google changes
 * the lag; picking the newest covered day is correct for any lag shorter than
 * the window, and reports nothing when the window is genuinely empty.
 */

/** Metrics the daily run reads per day. Impressions first (the funnel gate). */
export const DAILY_WINDOW_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
] as const;

export type DailyWindowMetric = (typeof DAILY_WINDOW_METRICS)[number];

/** One calendar day the API actually reported, with every metric's value. */
export interface ResolvedMetricDay {
  /** YYYY-MM-DD — the date these values genuinely belong to. */
  date: string;
  /** Metric name → value. A metric absent for this date reads 0. */
  values: Record<string, number>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Format a Google `{ year, month, day }` date object as YYYY-MM-DD. */
function formatApiDate(dateObj: unknown): string | null {
  const rec = asRecord(dateObj);
  if (!rec) return null;
  const year = Number(rec.year);
  const month = Number(rec.month);
  const day = Number(rec.day);
  if (!year || !month || !day) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Resolve the nested performance series for the first location, if any. */
function getPerformanceSeries(data: unknown): unknown[] {
  const root = asRecord(data);
  const gbpData = asRecord(root?.gbpData);
  const locations = asArray(gbpData?.locations);
  const firstLocation = asRecord(locations[0]);
  const locationData = asRecord(firstLocation?.data);
  const performance = asRecord(locationData?.performance);
  return asArray(performance?.series);
}

/**
 * Every date the response actually covers, newest first, with each metric's
 * value for that date.
 *
 * A date appears here if ANY metric reported an entry for it — that is what
 * "Google published this day" means. A metric with no entry for a covered date
 * reads 0, which is correct: the day was published and that metric had nothing.
 */
export function collectCoveredDays(data: unknown): ResolvedMetricDay[] {
  const series = getPerformanceSeries(data);
  const byDate = new Map<string, Record<string, number>>();

  for (const multiSeries of series) {
    const dailyList = asArray(asRecord(multiSeries)?.dailyMetricTimeSeries);
    for (const entry of dailyList) {
      const entryRec = asRecord(entry);
      const metricName = entryRec?.dailyMetric;
      if (typeof metricName !== "string") continue;

      const values = asArray(asRecord(entryRec?.timeSeries)?.datedValues);
      for (const dv of values) {
        const dvRec = asRecord(dv);
        const date = formatApiDate(dvRec?.date);
        // An entry without a readable date cannot be attributed to a day, and
        // guessing which day it belongs to is exactly the fabrication this
        // module exists to prevent. Drop it.
        if (!date) continue;

        const raw = dvRec?.value;
        // `value` omitted = the day reported zero interactions (see header).
        const numeric = raw === undefined || raw === null ? 0 : Number(raw);
        const existing = byDate.get(date) ?? {};
        existing[metricName] = Number.isNaN(numeric) ? 0 : numeric;
        byDate.set(date, existing);
      }
    }
  }

  return [...byDate.entries()]
    .map(([date, values]) => ({ date, values }))
    // YYYY-MM-DD sorts lexicographically as chronologically. Newest first.
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/**
 * The most-recent `count` days the response actually covers, newest first.
 * Returns fewer than `count` — possibly none — when the window is that empty.
 * An empty array means "no recent data", which callers must report as such and
 * never as zero.
 */
export function selectRecentDaysWithData(
  data: unknown,
  count: number,
): ResolvedMetricDay[] {
  if (count <= 0) return [];
  return collectCoveredDays(data).slice(0, count);
}

/** Read one metric off a resolved day. A metric absent for a covered day is 0. */
export function metricValue(
  day: ResolvedMetricDay | null | undefined,
  metricName: string,
): number {
  if (!day) return 0;
  const value = day.values[metricName];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
