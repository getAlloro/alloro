import type { RankingHistoryPoint } from "../../../api/rankingHistory";

/**
 * rankingPeriod — period helpers for the Local Rankings MONTH/QTR/YTD toggle.
 *
 * ENABLED (2026-07-23): the toggle is wired into RankingsHubSurface, reading
 * the history series from `useRankingHistory`. Honesty is structural, not a
 * label: `rankDeltaForPeriod` returns nulls / equal start-and-latest markers
 * when a period lacks two datable points, and the surface renders that as
 * "not enough history yet" — it never invents a movement. The movement line is
 * dated from the ACTUAL earliest point used (`startObservedAt`), so a period
 * whose data does not reach its calendar start reads honestly ("since Apr"),
 * never as a fabricated full-period delta.
 *
 * Spec: plans/06102026-local-rankings-simplification/spec.html (T2)
 */

export type RankingPeriod = "MONTH" | "QTR" | "YTD";

export const RANKING_PERIODS: RankingPeriod[] = ["MONTH", "QTR", "YTD"];

/** Single enable point for the period toggle + its history-backed delta. */
export const PERIOD_TOGGLE_ENABLED = true;

export const PERIOD_LABELS: Record<RankingPeriod, string> = {
  MONTH: "Month",
  QTR: "Quarter",
  YTD: "YTD",
};

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
  /** observedAt of the EARLIEST point used for the delta (never fabricated). */
  startObservedAt: string | null;
  /** observedAt of the latest point in the series. */
  latestObservedAt: string | null;
}

/**
 * Compute the rank movement across the selected period from a history series.
 * Uses `searchPosition` (the owner-facing position); null-safe throughout.
 *
 * `startObservedAt` is the timestamp of the actual earliest point used — which
 * may be LATER than the calendar period start when the series does not reach
 * back that far (e.g. YTD in H2 against a 6-month window). Callers must date
 * the movement from it rather than implying the full calendar period.
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

  return {
    startRank,
    latestRank,
    improvement,
    startObservedAt: firstInPeriod?.observedAt ?? null,
    latestObservedAt: latest?.observedAt ?? null,
  };
}

/**
 * True only when the delta rests on two DISTINCT datable observations — the
 * honest precondition for showing any movement. A single snapshot (start point
 * === latest point) is "not enough history yet", never "no change".
 */
export function hasDatableMovement(delta: RankDelta): boolean {
  return (
    delta.improvement !== null &&
    delta.startObservedAt !== null &&
    delta.latestObservedAt !== null &&
    delta.startObservedAt !== delta.latestObservedAt
  );
}
