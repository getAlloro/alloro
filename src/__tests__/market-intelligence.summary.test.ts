import { describe, expect, it } from "vitest";
import { summarizeOpportunityRows } from "../models/MarketKeywordSearchVolumeModel";
import { scoreMarketOpportunityConfidence } from "../controllers/market-intelligence/feature-utils/confidence";

describe("market opportunity aggregation", () => {
  it("sums DataForSEO volume by unique keyword, source, and cluster", () => {
    const summary = summarizeOpportunityRows(
      [
        {
          market_keyword_id: "kw-1",
          keyword: "root canal specialist",
          normalized_keyword: "root canal specialist",
          location_id: 101,
          search_volume: 100,
          keyword_source: "identifier_seed",
          cluster: "Root Canal",
          updated_at: "2026-06-02T00:00:00.000Z",
        },
        {
          market_keyword_id: "kw-2",
          keyword: "emergency endodontist",
          normalized_keyword: "emergency endodontist",
          location_id: 101,
          search_volume: null,
          keyword_source: "gsc_query",
          cluster: "Emergency",
          updated_at: "2026-06-03T00:00:00.000Z",
        },
        {
          market_keyword_id: "kw-3",
          keyword: "root canal specialist",
          normalized_keyword: "root canal specialist",
          location_id: 102,
          search_volume: 30,
          keyword_source: "identifier_seed",
          cluster: "Root Canal",
          updated_at: "2026-06-04T00:00:00.000Z",
        },
      ],
      "2026-06-01",
    );

    expect(summary).toMatchObject({
      estimatedSearchOpportunity: 130,
      keywordCount: 3,
      clusterCount: 2,
      nullVolumeCount: 1,
      latestUpdatedAt: "2026-06-04T00:00:00.000Z",
    });
    expect(summary.sourceBreakdown).toEqual([
      {
        source: "identifier_seed",
        keywordCount: 2,
        volume: 130,
        nullVolumeCount: 0,
      },
      {
        source: "gsc_query",
        keywordCount: 1,
        volume: 0,
        nullVolumeCount: 1,
      },
    ]);
    expect(summary.topKeywords).toEqual([
      {
        keyword: "root canal specialist",
        normalizedKeyword: "root canal specialist",
        volume: 130,
        nullVolumeCount: 0,
        locationCount: 2,
      },
      {
        keyword: "emergency endodontist",
        normalizedKeyword: "emergency endodontist",
        volume: 0,
        nullVolumeCount: 1,
        locationCount: 1,
      },
    ]);
  });

  it("scores confidence from keyword count, coverage, and null volume", () => {
    expect(scoreMarketOpportunityConfidence({
      keywordCount: 180,
      nullVolumeCount: 0,
      coverage: {
        trackedKeywords: 180,
        uniqueGscQueries: 500,
        matchedQueries: 220,
        unmatchedQueries: 280,
        matchedImpressions: 9000,
        unmatchedImpressions: 1000,
        queryCoveragePct: 44,
        impressionCoveragePct: 90,
      },
    })).toBe("high");

    expect(scoreMarketOpportunityConfidence({
      keywordCount: 12,
      nullVolumeCount: 9,
      coverage: null,
    })).toBe("low");
  });
});
