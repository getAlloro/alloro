import type { RankingHistoryPoint } from "../../../api/rankingHistory";

/**
 * rankingPeriod — period helpers for the Local Rankings MONTH/QTR/YTD toggle.
 *
 * The toggle ships DISABLED: rankings are run-snapshots and most locations do
 * not yet have enough history for a meaningful period delta. Flip
 * PERIOD_TOGGLE_ENABLED to true (and wire the existing `useRankingHistory`
 * hook into RankingsHubSurface) once history depth is sufficient — that is
 * the single enable point.
 *
 * Spec: plans/06102026-local-rankings-simplification/spec.html (T2)
 */

export type RankingPeriod = "MONTH" | "QTR" | "YTD";

export const RANKING_PERIODS: RankingPeriod[] = ["MONTH", "QTR", "YTD"];

/** Single enable point for the period toggle + its history-backed delta. */
export const PERIOD_TOGGLE_ENABLED = false;

export const PERIOD_DISABLED_TOOLTIP = "Not enough ranking history yet";

/** Start of the selected period relative to `now`. */
export function periodStart(period: RankingPeriod, now: Date): Date {
  const year = now.getFullYear();
  if (period === "YTD") return new Date(year, 0, 1);
  if (period === "QTR") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    return new Date(year, quarterStartMonth, 1);
  }
  return new Date(year, now.getMonth(), 1); // MONTH
}

export interface RankDelta {
  /** Rank position at (or just after) the start of the period. */
  startRank: number | null;
  /** Latest rank position in the series. */
  latestRank: number | null;
  /** startRank - latestRank (positive = improved, i.e. moved up). */
  improvement: number | null;
}

/**
 * Compute the rank movement across the selected period from a history series.
 * Uses `searchPosition` (the owner-facing position); null-safe throughout.
 */
export function rankDeltaForPeriod(
  history: RankingHistoryPoint[],
  period: RankingPeriod,
  now: Date = new Date(),
): RankDelta {
  const sorted = [...history].sort(
    (a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime(),
  );
  const latest = sorted.at(-1) ?? null;
  const start = periodStart(period, now).getTime();
  const firstInPeriod =
    sorted.find((p) => new Date(p.observedAt).getTime() >= start) ?? sorted[0] ?? null;

  const startRank = firstInPeriod?.searchPosition ?? null;
  const latestRank = latest?.searchPosition ?? null;
  const improvement =
    startRank !== null && latestRank !== null ? startRank - latestRank : null;

  return { startRank, latestRank, improvement };
}
