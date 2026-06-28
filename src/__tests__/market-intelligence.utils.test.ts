import { describe, expect, it } from "vitest";
import {
  canonicalizeKeyword,
  dedupeKeywords,
  inferIntent,
  normalizeKeyword,
} from "../controllers/market-intelligence/feature-utils/keywordNormalization";
import { extractGscQueries } from "../controllers/market-intelligence/feature-utils/gscQueryExtraction";
import { calculateKeywordCoverage } from "../controllers/market-intelligence/feature-utils/coverageMetrics";
import { resolveMarketGeo } from "../controllers/market-intelligence/feature-utils/locationSignals";

describe("market intelligence keyword utilities", () => {
  it("normalizes, canonicalizes, and dedupes keyword candidates", () => {
    const deduped = dedupeKeywords([
      { keyword: " Dentist Near Me ", source: "identifier_seed" },
      { keyword: "dentist near me", source: "gsc_query" },
      { keyword: "braces prices", source: "identifier_seed" },
    ]);

    expect(normalizeKeyword(" Dentist   Near Me ")).toBe("dentist near me");
    expect(canonicalizeKeyword("braces prices")).toBe("braces cost");
    expect(deduped).toHaveLength(2);
    expect(deduped[0]).toMatchObject({
      normalizedKeyword: "dentist near me",
      canonicalKeyword: "dentist near me",
    });
    expect(inferIntent("emergency dentist near me")).toBe("near_me");
  });

  it("extracts unique GSC queries from schema-versioned rows", () => {
    const queries = extractGscQueries([
      {
        report_date: "2026-06-01",
        data: {
          queries: {
            rows: [
              { keys: ["Emergency Dentist"], clicks: 2, impressions: 10 },
              { query: "emergency dentist", clicks: 1, impressions: 15 },
              { keys: ["website"], clicks: 1, impressions: 99 },
            ],
          },
        },
      },
    ]);

    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatchObject({
      query: "Emergency Dentist",
      normalizedQuery: "emergency dentist",
      clicks: 3,
      impressions: 25,
    });
    expect(queries[0].lastSeenAt.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("calculates tracked keyword coverage against real GSC queries", () => {
    const coverage = calculateKeywordCoverage(
      [
        { normalized_keyword: "emergency dentist" },
        { normalized_keyword: "root canal specialist" },
      ],
      [
        { normalizedQuery: "emergency dentist near me", impressions: 80 },
        { normalizedQuery: "tooth pain help", impressions: 20 },
      ],
    );

    expect(coverage).toMatchObject({
      trackedKeywords: 2,
      uniqueGscQueries: 2,
      matchedQueries: 1,
      unmatchedQueries: 1,
      matchedImpressions: 80,
      unmatchedImpressions: 20,
      queryCoveragePct: 50,
      impressionCoveragePct: 80,
    });
  });

  it("falls back to ranking market location when structured geo fields are missing", () => {
    expect(resolveMarketGeo(null, null, "West Orange, NJ")).toEqual({
      city: "West Orange",
      state: "NJ",
    });
    expect(resolveMarketGeo("Winter Garden", "FL", "Unknown, Unknown")).toEqual({
      city: "Winter Garden",
      state: "FL",
    });
  });
});
