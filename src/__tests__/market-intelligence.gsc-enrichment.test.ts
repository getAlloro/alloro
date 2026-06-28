import { beforeEach, describe, expect, it, vi } from "vitest";

const buildBusinessContext = vi.fn();
const markLastSeen = vi.fn();
const upsert = vi.fn();

vi.mock("../controllers/market-intelligence/feature-services/BusinessContextBuilder", () => ({
  buildBusinessContext: (...args: unknown[]) => buildBusinessContext(...args),
}));

vi.mock("../models/MarketKeywordModel", () => ({
  MarketKeywordModel: {
    markLastSeen: (...args: unknown[]) => markLastSeen(...args),
    upsert: (...args: unknown[]) => upsert(...args),
  },
}));

import { enrichMarketKeywordsFromGsc } from "../controllers/market-intelligence/feature-services/GscMarketKeywordEnrichmentService";

function contextWithExisting(existingKeywords: string[] = []) {
  return {
    organizationId: 11,
    businessName: "Synthetic Dental",
    industry: "health",
    domain: "example.test",
    website: "example.test",
    projectId: "project-1",
    language: "en",
    recentGscQueries: [
      {
        query: "Emergency Dentist",
        normalizedQuery: "emergency dentist",
        impressions: 15,
        clicks: 2,
        lastSeenAt: new Date("2026-06-20T00:00:00.000Z"),
      },
    ],
    missing: [],
    locations: [
      {
        locationId: 101,
        locationName: "Downtown",
        domain: null,
        isPrimary: true,
        specialty: "Dentist",
        marketLocation: "Austin, TX",
        rankKeywords: [],
        city: "Austin",
        state: "TX",
        county: null,
        postalCode: null,
        dataForSeoLocationName: "Austin,Texas,United States",
        gbpAccountId: null,
        gbpLocationId: null,
        gbpLocationName: null,
        gbpProfile: null,
        existingMarketKeywords: existingKeywords.map((normalized_keyword) => ({
          normalized_keyword,
        })),
        missing: [],
      },
    ],
  };
}

describe("enrichMarketKeywordsFromGsc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markLastSeen.mockResolvedValue(1);
    upsert.mockResolvedValue(undefined);
  });

  it("stores new GSC queries as candidates, not approved harvest keywords", async () => {
    buildBusinessContext.mockResolvedValue(contextWithExisting());

    const result = await enrichMarketKeywordsFromGsc(11);

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      keyword: "Emergency Dentist",
      normalizedKeyword: "emergency dentist",
      source: "gsc_query",
      status: "candidate",
      lastSeenAt: new Date("2026-06-20T00:00:00.000Z"),
    }));
    expect(result).toMatchObject({
      keywordsCreated: 1,
      keywordsRefreshed: 0,
    });
  });

  it("refreshes existing normalized GSC matches instead of inserting duplicates", async () => {
    buildBusinessContext.mockResolvedValue(contextWithExisting(["emergency dentist"]));

    const result = await enrichMarketKeywordsFromGsc(11);

    expect(upsert).not.toHaveBeenCalled();
    expect(markLastSeen).toHaveBeenCalledWith(
      11,
      101,
      "emergency dentist",
      expect.any(Date),
    );
    expect(result).toMatchObject({
      keywordsCreated: 0,
      keywordsRefreshed: 1,
    });
  });
});
