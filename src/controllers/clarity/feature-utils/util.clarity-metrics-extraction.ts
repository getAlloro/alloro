/**
 * Pure function for extracting KPI metrics from Clarity JSON responses.
 *
 * Rage-clicks and scroll depth are the two signals the CRO constellation needs
 * and the extractor was dropping on the floor. No API change was required:
 * `service.clarity-api.ts` and `clarityHarvestAdapter` both call
 * project-live-insights with no metric filter, and the controller stores the raw
 * payload, so these values were already arriving and already sitting in stored
 * history — they were simply never read out.
 *
 * Verified against a live project-live-insights response (2026-07-22): the
 * payload carries sixteen metricName entries including `RageClickCount` and
 * `ScrollDepth`. Their shapes differ, and that difference matters:
 *   • RageClickCount mirrors DeadClickCount — sessionsCount / subTotal /
 *     sessionsWithMetricPercentage.
 *   • ScrollDepth carries a single field, `averageScrollDepth`, and it is NULL
 *     when Clarity has no scroll data for the window.
 *
 * That null is preserved as null rather than coerced to 0. `|| 0` on a scroll
 * depth would turn "we have no reading" into "visitors scrolled 0%", which is a
 * fabricated measurement pointing the wrong way — exactly the failure the funnel
 * rule warns about (do not optimize a phantom). Counts still coerce to 0,
 * because an absent count genuinely means none were recorded.
 */

export interface ClarityMetrics {
  sessions: number;
  deadClicks: number;
  bounceRate: number;
  /** Sessions-weighted count of rage-click events. Absent means none recorded. */
  rageClicks: number;
  /** Average scroll depth (percent). NULL means Clarity had no reading — never 0. */
  scrollDepth: number | null;
}

/**
 * Extract KPI metrics from clarity JSON data array.
 * Parses Traffic, DeadClickCount, QuickbackClick, RageClickCount and ScrollDepth.
 */
export const extractMetrics = (data: any[]): ClarityMetrics => {
  const findMetric = (name: string) =>
    data.find((m) => m.metricName === name)?.information?.[0] || {};

  const traffic = findMetric("Traffic");
  const deadClicks = findMetric("DeadClickCount");
  const quickbacks = findMetric("QuickbackClick");
  const rageClicks = findMetric("RageClickCount");
  const scrollDepth = findMetric("ScrollDepth");

  const rawScrollDepth = scrollDepth.averageScrollDepth;
  const hasScrollReading =
    rawScrollDepth !== null &&
    rawScrollDepth !== undefined &&
    Number.isFinite(Number(rawScrollDepth));

  return {
    sessions: Number(traffic.totalSessionCount || 0),
    deadClicks: Number(deadClicks.subTotal || 0),
    bounceRate: Number(quickbacks.sessionsWithMetricPercentage || 0) / 100, // %
    rageClicks: Number(rageClicks.subTotal || 0),
    scrollDepth: hasScrollReading ? Number(rawScrollDepth) : null,
  };
};
