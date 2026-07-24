import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatRatingVsMarket,
  resolveMarketRating,
  resolveRankDisplay,
  resolveReviewsLast30d,
} from "./rankingsHubDerivation";

/**
 * Gauge-accuracy hardening — Local Rankings hero + vitals.
 *
 * Two live owner-facing fabrications, killed here and pinned:
 *   #1  "Rating vs Market" rendered a hardcoded 4.5 as a measured market rating.
 *   #2  "#N of M nearby" paired a SerpApi position with the curated competitor
 *       count — two different universes (confirmed against the primary:
 *       util.ranking-formatter buildSelectedCompetitorSearchResults reads the
 *       curated competitorSnapshot; stageReaders.readRank forbids the pairing).
 *   #9  "0 reviews last 30 days" rendered on absent scrape data.
 */

const okResult = (over: Partial<Parameters<typeof resolveRankDisplay>[0]> = {}) => ({
  searchStatus: "ok" as const,
  searchPosition: 4,
  // A SerpApi Maps set of 12 businesses, client included.
  searchResults: Array.from({ length: 12 }, (_, i) => ({ isClient: i === 3 })),
  // Checked this month by default so the existing (freshness-agnostic) cases
  // stay fresh — the stale-reach suite below overrides this with an old date.
  searchCheckedAt: new Date().toISOString().slice(0, 10),
  ...over,
});

describe("#2 resolveRankDisplay — position and denominator share a universe", () => {
  it("FALSIFIER: never pairs a rank with a count from a different universe", () => {
    // The bug: searchResults (SerpApi, 12) present, but the old code used the
    // CURATED competitor count (5) for the denominator → "#4 of 6". The honest
    // denominator is the SerpApi set the position was measured in.
    const d = resolveRankDisplay(okResult());
    expect(d.show).toBe(true);
    expect(d.position).toBe(4);
    expect(d.outOf).toBe(12); // the SerpApi universe, NOT a curated 5/6
  });

  it("shows the rank alone (no 'of M') when the SerpApi set is absent", () => {
    const d = resolveRankDisplay(okResult({ searchResults: null }));
    expect(d.show).toBe(true);
    expect(d.position).toBe(4);
    expect(d.outOf).toBeNull();
  });

  it("refuses a denominator smaller than the rank — corrupt, not a universe", () => {
    const d = resolveRankDisplay(
      okResult({ searchPosition: 9, searchResults: [{ isClient: true }, {}] }),
    );
    expect(d.outOf).toBeNull();
  });

  it("shows the rank alone for a one-business universe — no absurd '#1 of 1'", () => {
    const d = resolveRankDisplay(
      okResult({ searchPosition: 1, searchResults: [{ isClient: true }] }),
    );
    expect(d.show).toBe(true);
    expect(d.position).toBe(1);
    expect(d.outOf).toBeNull();
  });

  it("FALSIFIER: a null status prints no rank — never defaults to 'ok'", () => {
    // The old `searchStatus ?? "ok"` printed a confident rank on unconfirmed data.
    expect(resolveRankDisplay(okResult({ searchStatus: null })).show).toBe(false);
  });

  it("shows no rank on any non-ok status", () => {
    for (const s of ["not_in_top_20", "bias_unavailable", "api_error"] as const) {
      expect(resolveRankDisplay(okResult({ searchStatus: s })).show).toBe(false);
    }
  });

  it("shows no rank when status is ok but the position is null", () => {
    expect(resolveRankDisplay(okResult({ searchPosition: null })).show).toBe(false);
  });
});

describe("I2 resolveRankDisplay — freshness reaches the rank hero", () => {
  it("a rank checked this month is fresh — the guard does not over-fire", () => {
    const d = resolveRankDisplay(okResult());
    expect(d.show).toBe(true);
    expect(d.stale).toBe(false);
  });

  it("FALSIFIER: a rank last checked months ago is stale, not silently current", () => {
    // The bug this closes: a scheduled ranking run that stopped leaves "#4"
    // reading as today's rank. The SAME isMonthStale the focus surface uses
    // now flags it — the position still shows, but the surface strips its
    // confident color and dates it.
    const d = resolveRankDisplay(okResult({ searchCheckedAt: "2020-01-15" }));
    expect(d.show).toBe(true);
    expect(d.position).toBe(4);
    expect(d.stale).toBe(true);
    expect(d.checkedAt).toBe("2020-01-15");
  });

  it("a missing check date is unknown age, never invented as stale", () => {
    // Mirrors useStageTones' `latestMonth != null && isMonthStale`: a null date
    // must not hide a fresh rank behind a missing timestamp.
    const d = resolveRankDisplay(okResult({ searchCheckedAt: null }));
    expect(d.show).toBe(true);
    expect(d.stale).toBe(false);
    expect(d.checkedAt).toBeNull();
  });

  it("an empty check date is unknown age too — no silent mute without a caption", () => {
    // "" is falsy: isMonthStale("") would say stale, but the hero caption only
    // renders on a truthy date, so a bare `!== null` guard would mute the rank
    // with no explanation. Treat empty as unknown age, like null.
    const d = resolveRankDisplay(okResult({ searchCheckedAt: "" }));
    expect(d.stale).toBe(false);
  });

  it("handles the PRODUCTION full-ISO datetime format, not just date-only", () => {
    // res.json serializes searchCheckedAt as a full ISO datetime with Z
    // (e.g. "2020-01-15T08:30:00.000Z"); parseYM's unanchored regex reads the
    // month off the prefix. Pin the real contract, not only the date-only form.
    const staleIso = resolveRankDisplay(
      okResult({ searchCheckedAt: "2020-01-15T08:30:00.000Z" }),
    );
    expect(staleIso.stale).toBe(true);
    expect(staleIso.checkedAt).toBe("2020-01-15T08:30:00.000Z");

    const freshIso = resolveRankDisplay(
      okResult({ searchCheckedAt: new Date().toISOString() }),
    );
    expect(freshIso.stale).toBe(false);
  });

  it("carries stale=false when no rank is shown at all", () => {
    const d = resolveRankDisplay(
      okResult({ searchStatus: null, searchCheckedAt: "2020-01-15" }),
    );
    expect(d.show).toBe(false);
    expect(d.stale).toBe(false);
    expect(d.showCheckedDate).toBe(false);
  });
});

/**
 * The tone rule and the caption rule are NOT the same rule.
 *
 * isMonthStale carries a grace window (STALE_GRACE_DAYS = 10) because monthly
 * PMS files land late — "last month's file may not be in yet". A
 * `search_checked_at` is not a file that lands; it is the timestamp of a check
 * that either ran or did not, so that grace buys nothing here and costs a long
 * silent window: a rank measured May 1 is still 2 months behind on July 8, and
 * the grace rule calls it fresh.
 *
 * I2 forbids inventing a SECOND staleness policy, so the tone stays on
 * isMonthStale. The caption does not: a date is a fact, not a policy, and
 * showCheckedDate names it whenever the rank is 2+ whole months behind.
 */
describe("I2 resolveRankDisplay — the caption rule outlives the grace window", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const freezeAt = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  };

  it("FALSIFIER: a rank two months behind is dated even inside the grace window", () => {
    // May 1 measured, read on July 8: monthsBehind = 2 and getUTCDate() = 8,
    // which is inside STALE_GRACE_DAYS — so isMonthStale says fresh. Before
    // this flag existed, a ~10-week-old rank rendered confident AND uncaptioned.
    freezeAt("2026-07-08T12:00:00.000Z");
    const d = resolveRankDisplay(okResult({ searchCheckedAt: "2026-05-01" }));

    expect(d.show).toBe(true);
    expect(d.position).toBe(4);
    // The tone rule is deliberately unchanged — one staleness policy, not two.
    expect(d.stale).toBe(false);
    // The caption rule fires anyway.
    expect(d.showCheckedDate).toBe(true);
    expect(d.checkedAt).toBe("2026-05-01");
  });

  it("past the grace window the same rank is both dated and stale", () => {
    freezeAt("2026-07-18T12:00:00.000Z");
    const d = resolveRankDisplay(okResult({ searchCheckedAt: "2026-05-01" }));
    expect(d.stale).toBe(true);
    expect(d.showCheckedDate).toBe(true);
  });

  it("a rank one month behind is neither dated nor stale — the caption does not over-fire", () => {
    freezeAt("2026-07-08T12:00:00.000Z");
    const d = resolveRankDisplay(okResult({ searchCheckedAt: "2026-06-20" }));
    expect(d.stale).toBe(false);
    expect(d.showCheckedDate).toBe(false);
  });

  it("an unreadable but present date is stale AND dated — never muted without a caption", () => {
    // isMonthStale treats an unreadable month as stale (abstain over guess), so
    // the color mutes. The caption must follow, or the owner sees a greyed rank
    // with no explanation of why.
    freezeAt("2026-07-08T12:00:00.000Z");
    const d = resolveRankDisplay(okResult({ searchCheckedAt: "zzzz" }));
    expect(d.stale).toBe(true);
    expect(d.showCheckedDate).toBe(true);
  });

  it("unknown age (null / empty) is neither stale nor dated", () => {
    freezeAt("2026-07-08T12:00:00.000Z");
    expect(resolveRankDisplay(okResult({ searchCheckedAt: null })).showCheckedDate).toBe(false);
    expect(resolveRankDisplay(okResult({ searchCheckedAt: "" })).showCheckedDate).toBe(false);
  });
});

describe("#1 resolveMarketRating — no invented market average", () => {
  it("FALSIFIER: an empty competitor set yields null, never 4.5", () => {
    expect(resolveMarketRating([])).toBeNull();
  });

  it("averages only the competitors that actually have a rating", () => {
    // The old `|| 0` folded the unrated one in as 0, dragging the average down.
    const avg = resolveMarketRating([
      { averageRating: 4.6 },
      { averageRating: 4.8 },
      { averageRating: null },
      { averageRating: 0 },
      {},
    ]);
    expect(avg).toBeCloseTo(4.7, 5);
  });

  it("returns null when every competitor is unrated", () => {
    expect(resolveMarketRating([{ averageRating: null }, {}])).toBeNull();
  });
});

describe("#1 formatRatingVsMarket — honest on both sides", () => {
  it("FALSIFIER: renders '—' for the market side when there is no market average", () => {
    expect(formatRatingVsMarket(4.9, null)).toBe("4.9 / —");
    expect(formatRatingVsMarket(4.9, null)).not.toContain("4.5");
  });

  it("renders both figures when both exist", () => {
    expect(formatRatingVsMarket(4.9, 4.6)).toBe("4.9 / 4.6");
  });

  it("renders '—' when the practice itself has no rating", () => {
    expect(formatRatingVsMarket(null, 4.6)).toBe("—");
  });
});

describe("#9 resolveReviewsLast30d — absent is not zero", () => {
  it("FALSIFIER: null scrape data yields null, never a measured 0", () => {
    expect(resolveReviewsLast30d(null)).toBeNull();
    expect(resolveReviewsLast30d({})).toBeNull();
    expect(resolveReviewsLast30d({ reviewsLast30d: null })).toBeNull();
  });

  it("keeps a real measured zero", () => {
    expect(resolveReviewsLast30d({ reviewsLast30d: 0 })).toBe(0);
  });

  it("keeps a real positive count", () => {
    expect(resolveReviewsLast30d({ reviewsLast30d: 3 })).toBe(3);
  });
});
