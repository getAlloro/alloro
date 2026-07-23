import { describe, expect, it } from "vitest";

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
