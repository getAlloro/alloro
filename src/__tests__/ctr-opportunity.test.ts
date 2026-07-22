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
});
