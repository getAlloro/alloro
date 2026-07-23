import { describe, expect, it } from "vitest";

import type { RankingHistoryPoint } from "../../../api/rankingHistory";
import {
  hasDatableMovement,
  periodStart,
  rankDeltaForPeriod,
} from "./rankingPeriod";

/**
 * rankingPeriod — honesty guards for the MONTH/QTR/YTD rank-over-time toggle.
 *
 * The toggle must never manufacture a movement. These pin the three ways it
 * could lie: a single snapshot read as "no change", a fabricated full-period
 * delta when data does not reach the calendar start, and a movement claimed
 * when the current position is unknown.
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

// A fixed "now" so period boundaries are deterministic: 2026-07-15 → YTD starts
// 2026-01-01, quarter starts 2026-07-01, month starts 2026-07-01.
const NOW = new Date("2026-07-15T12:00:00.000Z");

describe("periodStart", () => {
  it("anchors YTD to Jan 1, quarter to the quarter start, month to the 1st", () => {
    expect(periodStart("YTD", NOW).getFullYear()).toBe(2026);
    expect(periodStart("YTD", NOW).getMonth()).toBe(0);
    expect(periodStart("QTR", NOW).getMonth()).toBe(6); // Q3 starts July (idx 6)
    expect(periodStart("MONTH", NOW).getMonth()).toBe(6);
    expect(periodStart("MONTH", NOW).getDate()).toBe(1);
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

  it("dates YTD from the real earliest point, not the calendar Jan 1, when data does not reach back", () => {
    // Only May + July data against a YTD window whose calendar start is Jan 1.
    const delta = rankDeltaForPeriod(
      [point("2026-05-01", 9), point("2026-07-10", 4)],
      "YTD",
      NOW,
    );
    // start is the earliest AVAILABLE point (May), never a fabricated Jan value.
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
});
