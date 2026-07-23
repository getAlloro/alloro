import { describe, it, expect } from "vitest";

import { buildClientGbpDisplayFields } from "../controllers/practice-ranking/feature-utils/util.client-gbp-display";

/**
 * The backend half of gauge-accuracy defects #9 and #1's "you" side.
 *
 * The dashboard's frontend null-checks were structurally dead: the scoring stage
 * persisted absent review data as `|| 0`, so `raw_data.client_gbp` always carried
 * a number and the frontend could never tell "no data" from "measured 0". These
 * pin that the persisted DISPLAY fields keep null for absent data, so the
 * frontend can honestly render "—".
 */
describe("buildClientGbpDisplayFields — absent review data persists as null, not 0", () => {
  it("FALSIFIER: an unscraped GBP yields null, never a fabricated 0", () => {
    // The state behind "0 reviews last 30 days" and "0.0 stars" on the dashboard.
    expect(buildClientGbpDisplayFields(null)).toEqual({
      averageRating: null,
      totalReviewCount: null,
      reviewsLast30d: null,
    });
    expect(buildClientGbpDisplayFields({})).toEqual({
      averageRating: null,
      totalReviewCount: null,
      reviewsLast30d: null,
    });
    expect(buildClientGbpDisplayFields({ reviews: { allTime: {}, window: {} } })).toEqual({
      averageRating: null,
      totalReviewCount: null,
      reviewsLast30d: null,
    });
  });

  it("keeps a REAL measured zero (a scraped 0 is not the same as no scrape)", () => {
    const fields = buildClientGbpDisplayFields({
      reviews: {
        allTime: { averageRating: 0, totalReviewCount: 0 },
        window: { newReviews: 0 },
      },
    });
    expect(fields).toEqual({
      averageRating: 0,
      totalReviewCount: 0,
      reviewsLast30d: 0,
    });
  });

  it("passes real measured values through unchanged", () => {
    const fields = buildClientGbpDisplayFields({
      reviews: {
        allTime: { averageRating: 4.8, totalReviewCount: 152 },
        window: { newReviews: 3 },
      },
    });
    expect(fields).toEqual({
      averageRating: 4.8,
      totalReviewCount: 152,
      reviewsLast30d: 3,
    });
  });

  it("treats a non-finite value as absent, not as data", () => {
    const fields = buildClientGbpDisplayFields({
      reviews: {
        allTime: { averageRating: Number.NaN, totalReviewCount: 10 },
        window: { newReviews: 2 },
      },
    });
    expect(fields.averageRating).toBeNull();
    expect(fields.totalReviewCount).toBe(10);
  });
});
