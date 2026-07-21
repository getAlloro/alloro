/**
 * GBP Impressions Diagnostic
 *
 * Pure, side-effect-free log-shaping helpers for the "zero-Maps" investigation.
 * Given a fetched GBP service result for one day/window, they walk the nested
 * Google Business Profile Performance response and surface the ACTUAL per-date
 * values the API returned for the impression metrics — not just their sum.
 *
 * This module writes nothing and changes no behavior. Its output is logged by
 * the daily agent processor (via the Pino-backed `log()` in agentLogger) so the
 * next real run confirms or refutes the hypothesis that recent dates are empty
 * because the Performance API trails several days.
 *
 * See plans/07202026-zero-maps-fix/spec.html.
 */

/** Impression metrics the diagnostic inspects, per the daily fetch metric set. */
export const IMPRESSION_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
] as const;

export interface DiagnosticDatedValue {
  /** Calendar date the value belongs to, as YYYY-MM-DD, or null if unparseable. */
  date: string | null;
  /** Numeric value; the API omits `value` for a zero day, reported here as 0. */
  value: number;
}

export interface DiagnosticMetric {
  metric: string;
  /** True if this metric's series was present in the response at all. */
  present: boolean;
  /** Per-date values the API returned for this metric (may be empty). */
  datedValues: DiagnosticDatedValue[];
  /** Sum of the values (matches how the payload builder totals a day). */
  total: number;
}

export interface GbpImpressionsDiagnostic {
  /** Human label for the fetched window/day (e.g. "yesterday 2026-07-19"). */
  window: string;
  /** Number of GBP locations in the response. */
  locationCount: number;
  /** True if the first location carried a performance series at all. */
  hasPerformanceSeries: boolean;
  metrics: DiagnosticMetric[];
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

/** Count locations present in the response. */
function getLocationCount(data: unknown): number {
  const gbpData = asRecord(asRecord(data)?.gbpData);
  return asArray(gbpData?.locations).length;
}

/**
 * Build the structured diagnostic for one fetched day/window.
 * Pure: reads the response, returns a plain object, logs nothing.
 */
export function buildGbpImpressionsDiagnostic(
  data: unknown,
  window: string,
): GbpImpressionsDiagnostic {
  const series = getPerformanceSeries(data);

  const metrics: DiagnosticMetric[] = IMPRESSION_METRICS.map((metricName) => {
    let present = false;
    const datedValues: DiagnosticDatedValue[] = [];

    for (const multiSeries of series) {
      const dailyList = asArray(asRecord(multiSeries)?.dailyMetricTimeSeries);
      for (const entry of dailyList) {
        const entryRec = asRecord(entry);
        if (entryRec?.dailyMetric !== metricName) continue;
        present = true;
        const values = asArray(asRecord(entryRec?.timeSeries)?.datedValues);
        for (const dv of values) {
          const dvRec = asRecord(dv);
          const rawValue = dvRec?.value;
          const numeric = rawValue !== undefined ? Number(rawValue) : 0;
          datedValues.push({
            date: formatApiDate(dvRec?.date),
            value: Number.isNaN(numeric) ? 0 : numeric,
          });
        }
      }
    }

    const total = datedValues.reduce((sum, dv) => sum + dv.value, 0);
    return { metric: metricName, present, datedValues, total };
  });

  return {
    window,
    locationCount: getLocationCount(data),
    hasPerformanceSeries: series.length > 0,
    metrics,
  };
}

/**
 * Render the diagnostic as a compact one-line-per-metric string for logs.
 * Pure: no side effects.
 */
export function summarizeGbpImpressionsDiagnostic(
  diagnostic: GbpImpressionsDiagnostic,
): string {
  const header =
    `[GBP-IMPRESSIONS-DIAG] window=${diagnostic.window} ` +
    `locations=${diagnostic.locationCount} ` +
    `perfSeries=${diagnostic.hasPerformanceSeries ? "yes" : "no"}`;

  const lines = diagnostic.metrics.map((m) => {
    const perDate = m.datedValues.length
      ? m.datedValues.map((dv) => `${dv.date ?? "?"}=${dv.value}`).join(", ")
      : "(no datedValues)";
    return `  ${m.metric}: present=${m.present ? "yes" : "no"} total=${m.total} [${perDate}]`;
  });

  return [header, ...lines].join("\n");
}
