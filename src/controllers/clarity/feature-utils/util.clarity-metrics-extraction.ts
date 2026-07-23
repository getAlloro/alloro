/**
 * Pure function for extracting KPI metrics from Clarity JSON responses.
 */

export interface ClarityMetrics {
  sessions: number;
  deadClicks: number;
  bounceRate: number;
}

/**
 * Extract KPI metrics from clarity JSON data array.
 * Parses Traffic, DeadClickCount, and QuickbackClick metric entries.
 */
export const extractMetrics = (data: any[]): ClarityMetrics => {
  const findMetric = (name: string) =>
    data.find((m) => m.metricName === name)?.information?.[0] || {};

  const traffic = findMetric("Traffic");
  const deadClicks = findMetric("DeadClickCount");
  const quickbacks = findMetric("QuickbackClick");

  return {
    sessions: Number(traffic.totalSessionCount || 0),
    deadClicks: Number(deadClicks.subTotal || 0),
    bounceRate: Number(quickbacks.sessionsWithMetricPercentage || 0) / 100, // %
  };
};
