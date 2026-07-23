import { describe, expect, it } from "vitest";

import type { RankingHistoryPoint } from "../../../api/rankingHistory";
import {
  hasDatableMovement,
  hasEnoughRankingHistory,
  periodStart,
  rankDeltaForPeriod,
} from "./rankingPeriod";

/**
 * rankingPeriod — honesty guards for the MONTH/QTR/YTD rank-over-time toggle.
 *
 * The toggle must never manufacture a movement. These pin the ways it could
 * lie: a single snapshot read as "no change", a fabricated full-period delta
 * when data does not reach the calendar start, a movement claimed when the
 * current position is unknown, an out-of-period point back-filling a period
 * that has no data of its own, and a permanently-dead toggle.
 */

const point = (
  observedAt: string,
  searchPosition: number | null,
): RankingHistoryPoint => ({
  observedAt,
  rankScore: 0,
  rankPosition: 0,
  searchPosition,
  factorScores: {},
});

// A fixed UTC "now": 2026-07-15 → YTD starts 2026-01-01, quarter 2026-07-01,
// month 2026-07-01 (all in UTC).
const NOW = new Date("2026-07-15T12:00:00.000Z");

describe("periodStart — UTC boundaries", () => {
  it("anchors YTD to Jan 1, quarter to the quarter start, month to the 1st (UTC)", () => {
    expect(periodStart("YTD", NOW).getUTCFullYear()).toBe(2026);
    expect(periodStart("YTD", NOW).getUTCMonth()).toBe(0);
    expect(periodStart("QTR", NOW).getUTCMonth()).toBe(6); // Q3 starts July (idx 6)
    expect(periodStart("MONTH", NOW).getUTCMonth()).toBe(6);
    expect(periodStart("MONTH", NOW).getUTCDate()).toBe(1);
  });
});

describe("rankDeltaForPeriod + hasDatableMovement — no fabricated trend", () => {
  it("reads a single snapshot as NOT enough history (never 'no change')", () => {
    const delta = rankDeltaForPeriod([point("2026-07-10", 5)], "MONTH", NOW);
    // improvement is 0 arithmetically, but start === latest observation.
    expect(delta.improvement).toBe(0);
    expect(hasDatableMovement(delta)).toBe(false);
  });

  it("reports an empty series as not enough history", () => {
    const delta = rankDeltaForPeriod([], "YTD", NOW);
    expect(delta.startRank).toBeNull();
    expect(delta.latestRank).toBeNull();
    expect(hasDatableMovement(delta)).toBe(false);
  });

  it("computes an improvement (moved up) from two in-period points", () => {
    const delta = rankDeltaForPeriod(
      [point("2026-07-02", 8), point("2026-07-12", 3)],
      "MONTH",
      NOW,
    );
    expect(delta.improvement).toBe(5); // 8 -> 3, up five spots
    expect(delta.startObservedAt).toBe("2026-07-02");
    expect(delta.latestObservedAt).toBe("2026-07-12");
    expect(hasDatableMovement(delta)).toBe(true);
  });

  it("computes a decline (moved down) as a negative improvement", () => {
    const delta = rankDeltaForPeriod(
      [point("2026-07-02", 2), point("2026-07-12", 6)],
      "MONTH",
      NOW,
    );
    expect(delta.improvement).toBe(-4);
    expect(hasDatableMovement(delta)).toBe(true);
  });

  it("dates YTD from the earliest point WITHIN the year, not the calendar Jan 1", () => {
    // May + July data against a YTD window whose calendar start is Jan 1.
    const delta = rankDeltaForPeriod(
      [point("2026-05-01", 9), point("2026-07-10", 4)],
      "YTD",
      NOW,
    );
    // start is the earliest in-year point (May), never a fabricated Jan value.
    expect(delta.startObservedAt).toBe("2026-05-01");
    expect(delta.improvement).toBe(5);
    expect(hasDatableMovement(delta)).toBe(true);
  });

  it("refuses a movement when the current position is unknown (latest null)", () => {
    const delta = rankDeltaForPeriod(
      [point("2026-07-02", 4), point("2026-07-12", null)],
      "MONTH",
      NOW,
    );
    expect(delta.latestRank).toBeNull();
    expect(delta.improvement).toBeNull();
    expect(hasDatableMovement(delta)).toBe(false);
  });

  it("does NOT back-fill a period from out-of-period points: each period reflects its own window", () => {
    // Two May points only. In July, MONTH and QTR have no in-window data;
    // YTD does. The period selector must not render the same line for all three.
    const mayOnly = [point("2026-05-01", 9), point("2026-05-20", 4)];

    const month = rankDeltaForPeriod(mayOnly, "MONTH", NOW);
    expect(month.improvement).toBeNull();
    expect(hasDatableMovement(month)).toBe(false); // no July data → not enough

    const quarter = rankDeltaForPeriod(mayOnly, "QTR", NOW);
    expect(quarter.improvement).toBeNull(); // Q3 starts July; May is Q2
    expect(hasDatableMovement(quarter)).toBe(false);

    const ytd = rankDeltaForPeriod(mayOnly, "YTD", NOW);
    expect(ytd.improvement).toBe(5); // May is within the year
    expect(hasDatableMovement(ytd)).toBe(true);
  });
});

describe("hasEnoughRankingHistory — no permanently-dead toggle", () => {
  it("is false for an empty series", () => {
    expect(hasEnoughRankingHistory([])).toBe(false);
  });

  it("is false when every point lacks a known position (never ranked in top 20)", () => {
    expect(
      hasEnoughRankingHistory([
        point("2026-05-01", null),
        point("2026-06-01", null),
        point("2026-07-01", null),
      ]),
    ).toBe(false);
  });

  it("is false with only one datable point", () => {
    expect(
      hasEnoughRankingHistory([point("2026-06-01", 5), point("2026-07-01", null)]),
    ).toBe(false);
  });

  it("is true with two distinct datable points", () => {
    expect(
      hasEnoughRankingHistory([point("2026-06-01", 5), point("2026-07-01", 4)]),
    ).toBe(true);
  });
});
