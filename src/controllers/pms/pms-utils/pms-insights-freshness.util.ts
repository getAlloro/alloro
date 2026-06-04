export interface InsightsFreshnessInput {
  /** ISO timestamp of the most recent data_edited/file_deleted event, or null. */
  lastDataChangeAt: string | null;
  /** ISO timestamp of the most recent completed monthly-agent run, or null. */
  lastInsightsRunAt: string | null;
  /** Whether a monthly-agent run is currently pending/processing/awaiting approval. */
  hasActiveRun: boolean;
}

/**
 * Insights are stale when a location's PMS data was edited or deleted after its
 * most recent completed monthly-agent run, and no run is currently in progress.
 *
 * Edge cases that resolve to NOT stale:
 *  - A run is currently active (the processing view owns that state).
 *  - The location has never completed a run (nothing to be stale against).
 *  - The location has no recorded edit/delete events.
 */
export function computeInsightsStale({
  lastDataChangeAt,
  lastInsightsRunAt,
  hasActiveRun,
}: InsightsFreshnessInput): boolean {
  if (hasActiveRun) return false;
  if (!lastInsightsRunAt || !lastDataChangeAt) return false;

  const changedAt = new Date(lastDataChangeAt).getTime();
  const ranAt = new Date(lastInsightsRunAt).getTime();
  if (Number.isNaN(changedAt) || Number.isNaN(ranAt)) return false;

  return changedAt > ranAt;
}
