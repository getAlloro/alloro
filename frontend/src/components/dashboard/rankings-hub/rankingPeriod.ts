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

/**
 * Start of the selected period relative to `now`, computed in UTC so it lines
 * up with the UTC `observedAt` timestamps on the history points. Using local
 * time here would classify points near a month/quarter/year boundary
 * differently per viewer timezone (a real false-negative near boundaries).
 */
export function periodStart(period: RankingPeriod, now: Date): Date {
  const year = now.getUTCFullYear();
  if (period === "YTD") return new Date(Date.UTC(year, 0, 1));
  if (period === "QTR") {
    const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
    return new Date(Date.UTC(year, quarterStartMonth, 1));
  }
  return new Date(Date.UTC(year, now.getUTCMonth(), 1)); // MONTH
}

/**
 * Why a period can show no movement. Two genuinely different pieces of news
 * that a single "not enough history yet" sentence used to collapse:
 *
 *  - `thin-history` — we really do not hold enough runs yet.
 *  - `current-position-unknown` — we hold plenty, but the most recent check did
 *    not place the practice at all. Telling that owner they have no history is
 *    false, and it buries the news they actually needed.
 */
export type NoMovementReason = "thin-history" | "current-position-unknown";

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
  /** Null when movement IS showable; otherwise which of the two reasons it is not. */
  noMovementReason: NoMovementReason | null;
}

/**
 * Compute the rank movement across the selected period from a history series.
 * Uses `searchPosition` (the owner-facing position); null-safe throughout.
 *
 * The baseline (`firstInPeriod`) is the earliest point AT OR AFTER the period
 * start — so each period reflects its OWN window. When the series has no point
 * inside the selected period there is no in-period baseline, the delta is null,
 * and the surface reads "not enough history yet" for that period. It is never
 * back-filled from an out-of-period point (which would make Month, Quarter and
 * YTD render an identical, mislabelled line). `startObservedAt` is therefore
 * always within the period; for YTD against a 6-month window it is the earliest
 * point we hold this year, honestly dated ("since Jun 3"), never Jan 1.
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
    sorted.find((p) => new Date(p.observedAt).getTime() >= start) ?? null;

  const startRank = firstInPeriod?.searchPosition ?? null;
  const latestRank = latest?.searchPosition ?? null;
  const improvement =
    startRank !== null && latestRank !== null ? startRank - latestRank : null;

  const delta: RankDelta = {
    startRank,
    latestRank,
    improvement,
    startObservedAt: firstInPeriod?.observedAt ?? null,
    latestObservedAt: latest?.observedAt ?? null,
    noMovementReason: null,
  };

  if (hasDatableMovement(delta)) return delta;

  // A latest run that placed nobody is not thin history — it is a different
  // fact, and it is period-independent (`latest` is the last point in the whole
  // series). Only claim it when the series HAS placed the practice before;
  // otherwise there is genuinely nothing to compare against.
  const everPlaced = sorted.some((p) => p.searchPosition !== null);
  delta.noMovementReason =
    latestRank === null && everPlaced ? "current-position-unknown" : "thin-history";
  return delta;
}

/**
 * Every period's delta, computed once. The surface needs all three to decide
 * whether the toggle is worth rendering at all (see shouldShowPeriodToggle).
 */
export function rankDeltasForAllPeriods(
  history: RankingHistoryPoint[],
  now: Date = new Date(),
): Record<RankingPeriod, RankDelta> {
  return {
    MONTH: rankDeltaForPeriod(history, "MONTH", now),
    QTR: rankDeltaForPeriod(history, "QTR", now),
    YTD: rankDeltaForPeriod(history, "YTD", now),
  };
}

/**
 * Whether a three-way toggle earns its place: at least ONE period must carry
 * real movement.
 *
 * hasEnoughRankingHistory is the cheap precondition and asks the wrong
 * question on its own — "is there history?" rather than "is there a usable
 * delta in any period?". An org whose latest run found no position answers yes
 * to the first and no to every period, and the toggle then renders the same
 * dead line on all three tabs. That is the empty control, arrived at from the
 * other direction.
 */
export function shouldShowPeriodToggle(
  deltas: Record<RankingPeriod, RankDelta>,
): boolean {
  return RANKING_PERIODS.some((period) => hasDatableMovement(deltas[period]));
}

/**
 * True only when the delta rests on two DISTINCT datable observations — the
 * honest precondition for showing any movement. A single snapshot (start point
 * === latest point) is "not enough history yet", never "no change".
 */
export function hasDatableMovement(
  delta: RankDelta,
): delta is RankDelta & {
  improvement: number;
  startObservedAt: string;
  latestObservedAt: string;
} {
  return (
    delta.improvement !== null &&
    delta.startObservedAt !== null &&
    delta.latestObservedAt !== null &&
    delta.startObservedAt !== delta.latestObservedAt
  );
}

/**
 * Whether the toggle should render at all. Requires two DISTINCT observations
 * that carry a known position — the minimum for any period to show a real
 * movement. Without it (no runs, or an org that never cracks the top 20, so
 * every `searchPosition` is null) the toggle would be permanently dead, so we
 * hide it rather than ship a control that only ever says "not enough history".
 */
export function hasEnoughRankingHistory(history: RankingHistoryPoint[]): boolean {
  const datedTimestamps = new Set(
    history
      .filter((p) => p.searchPosition !== null)
      .map((p) => p.observedAt),
  );
  return datedTimestamps.size >= 2;
}
