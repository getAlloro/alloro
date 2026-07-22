import { describe, it, expect } from "vitest";
import {
  findCtrOpportunities,
  expectedCtrForPosition,
} from "../controllers/admin-websites/feature-utils/ctrOpportunity";
import type { GscDimensionRow } from "../controllers/admin-websites/feature-services/service.gsc-performance";

const page = (over: Partial<GscDimensionRow>): GscDimensionRow => ({
  key: "/",
  clicks: 0,
  impressions: 0,
  ctr: 0,
  position: 1,
  ...over,
});

describe("expectedCtrForPosition", () => {
  it("returns the baseline for top positions and zero beyond page 2", () => {
    expect(expectedCtrForPosition(1)).toBeGreaterThan(0.2);
    expect(expectedCtrForPosition(3)).toBeCloseTo(0.11);
    expect(expectedCtrForPosition(15)).toBe(0.01);
    expect(expectedCtrForPosition(25)).toBe(0); // page 3+: ranking, not the title
    expect(expectedCtrForPosition(0)).toBe(0);
  });

  it("returns zero for negative positions", () => {
    expect(expectedCtrForPosition(-1)).toBe(0);
    expect(expectedCtrForPosition(-100)).toBe(0);
  });

  it("rounds fractional positions to the nearest integer", () => {
    // 3.4 rounds to 3 → 0.11
    expect(expectedCtrForPosition(3.4)).toBeCloseTo(0.11);
    // 3.6 rounds to 4 → 0.08
    expect(expectedCtrForPosition(3.6)).toBeCloseTo(0.08);
    // 0.5 rounds to 1 (clamped by Math.max(1, rounded)) → 0.28
    expect(expectedCtrForPosition(0.5)).toBeCloseTo(0.28);
  });

  it("handles the page 1 / page 2 boundary (position 10 vs 11)", () => {
    expect(expectedCtrForPosition(10)).toBe(0.025); // bottom of page 1
    expect(expectedCtrForPosition(11)).toBe(0.01);  // top of page 2
  });

  it("handles the page 2 / page 3 boundary (position 20 vs 21)", () => {
    expect(expectedCtrForPosition(20)).toBe(0.01); // bottom of page 2
    expect(expectedCtrForPosition(21)).toBe(0);    // page 3: no CTR opportunity
  });
});

describe("findCtrOpportunities", () => {
  it("flags a high-impression page under-clicked for where it ranks", () => {
    const opps = findCtrOpportunities([
      page({ key: "/braces", impressions: 1000, clicks: 20, ctr: 0.02, position: 3 }),
    ]);
    expect(opps).toHaveLength(1);
    expect(opps[0].page).toBe("/braces");
    // baseline ~0.11 at position 3, actual 0.02 → gap ~0.09 × 1000 ≈ 90 missed clicks
    expect(opps[0].missedClicks).toBeGreaterThan(80);
  });

  it("skips pages with too little demand to matter", () => {
    const opps = findCtrOpportunities([
      page({ key: "/x", impressions: 20, clicks: 0, ctr: 0, position: 3 }),
    ]);
    expect(opps).toHaveLength(0);
  });

  it("skips pages already at or above the baseline CTR (no manufactured opportunity)", () => {
    const opps = findCtrOpportunities([
      page({ key: "/good", impressions: 1000, clicks: 150, ctr: 0.15, position: 3 }),
    ]);
    expect(opps).toHaveLength(0);
  });

  it("skips pages beyond page 2 — a title can't win clicks there, ranking is the lever", () => {
    const opps = findCtrOpportunities([
      page({ key: "/deep", impressions: 5000, clicks: 0, ctr: 0, position: 30 }),
    ]);
    expect(opps).toHaveLength(0);
  });

  it("ranks by clicks left on the table — biggest opportunity first", () => {
    const opps = findCtrOpportunities([
      page({ key: "/small", impressions: 200, clicks: 2, ctr: 0.01, position: 5 }),
      page({ key: "/big", impressions: 4000, clicks: 40, ctr: 0.01, position: 5 }),
    ]);
    expect(opps[0].page).toBe("/big");
    expect(opps[0].missedClicks).toBeGreaterThan(opps[1].missedClicks);
  });

  it("returns an empty array for empty input", () => {
    expect(findCtrOpportunities([])).toEqual([]);
  });

  it("returns an empty array when all pages are above baseline", () => {
    const opps = findCtrOpportunities([
      page({ key: "/a", impressions: 500, clicks: 200, ctr: 0.40, position: 1 }),
      page({ key: "/b", impressions: 300, clicks: 60, ctr: 0.20, position: 2 }),
    ]);
    expect(opps).toEqual([]);
  });

  it("includes a page at exactly the minimum impressions threshold", () => {
    // impressions = 100 (the default minimum), position 1, ctr 0 → big gap
    const opps = findCtrOpportunities([
      page({ key: "/exact", impressions: 100, clicks: 0, ctr: 0, position: 1 }),
    ]);
    expect(opps).toHaveLength(1);
    expect(opps[0].page).toBe("/exact");
  });

  it("excludes a page one impression below the threshold", () => {
    const opps = findCtrOpportunities([
      page({ key: "/below", impressions: 99, clicks: 0, ctr: 0, position: 1 }),
    ]);
    expect(opps).toHaveLength(0);
  });

  it("excludes a page whose CTR gap is exactly at the minimum gap threshold", () => {
    // Position 5 baseline = 0.06. Actual ctr = 0.04 → gap = 0.02 (exactly the default minCtrGap).
    // The code uses `gap < minCtrGap`, so gap == minCtrGap should NOT be flagged.
    const opps = findCtrOpportunities([
      page({ key: "/edge", impressions: 500, clicks: 20, ctr: 0.04, position: 5 }),
    ]);
    expect(opps).toHaveLength(0);
  });

  it("includes a page whose CTR gap is just above the minimum gap threshold", () => {
    // Position 5 baseline = 0.06. Actual ctr = 0.039 → gap = 0.021 > 0.02.
    const opps = findCtrOpportunities([
      page({ key: "/just-above", impressions: 500, clicks: 19, ctr: 0.039, position: 5 }),
    ]);
    expect(opps).toHaveLength(1);
  });

  it("respects the limit option", () => {
    const pages = Array.from({ length: 10 }, (_, i) =>
      page({ key: `/p${i}`, impressions: 1000 - i * 10, clicks: 0, ctr: 0, position: 1 }),
    );
    const opps = findCtrOpportunities(pages, { limit: 3 });
    expect(opps).toHaveLength(3);
    // Verify they are the top 3 by missedClicks (highest impressions first since ctr=0)
    expect(opps[0].page).toBe("/p0");
    expect(opps[1].page).toBe("/p1");
    expect(opps[2].page).toBe("/p2");
  });

  it("respects custom minImpressions option", () => {
    const opps = findCtrOpportunities(
      [page({ key: "/low", impressions: 50, clicks: 0, ctr: 0, position: 1 })],
      { minImpressions: 30 },
    );
    expect(opps).toHaveLength(1);
  });

  it("respects custom minCtrGap option", () => {
    // Position 3 baseline = 0.11. ctr = 0.10 → gap = 0.01.
    // Default minCtrGap (0.02) would skip this, but custom 0.005 includes it.
    const opps = findCtrOpportunities(
      [page({ key: "/narrow", impressions: 500, clicks: 50, ctr: 0.10, position: 3 })],
      { minCtrGap: 0.005 },
    );
    expect(opps).toHaveLength(1);
  });

  it("correctly populates all fields of a CtrOpportunity", () => {
    const opps = findCtrOpportunities([
      page({ key: "/dental-implants", impressions: 2000, clicks: 20, ctr: 0.01, position: 2 }),
    ]);
    expect(opps).toHaveLength(1);
    const opp = opps[0];
    expect(opp.page).toBe("/dental-implants");
    expect(opp.impressions).toBe(2000);
    expect(opp.clicks).toBe(20);
    expect(opp.actualCtr).toBe(0.01);
    expect(opp.expectedCtr).toBe(0.15); // position 2 baseline
    expect(opp.position).toBe(2);
    // missedClicks = round(2000 * (0.15 - 0.01)) = round(280) = 280
    expect(opp.missedClicks).toBe(280);
  });
});
