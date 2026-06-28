import { describe, expect, it } from "vitest";
import type { BusinessContext } from "../controllers/market-intelligence/feature-services/BusinessContextBuilder";
import { generateMarketKeywordsForLocation } from "../controllers/market-intelligence/feature-services/MarketKeywordGenerationService";

const context: BusinessContext = {
  organizationId: 11,
  businessName: "Synthetic Dental",
  industry: "health",
  domain: "example.test",
  website: "example.test",
  projectId: "project-1",
  language: "en",
  recentGscQueries: [],
  missing: [],
  locations: [
    {
      locationId: 101,
      locationName: "Downtown",
      domain: null,
      isPrimary: true,
      specialty: "Dentist",
      marketLocation: "Austin, TX",
      rankKeywords: ["dentist near me", "emergency dentist", "dentist near me"],
      city: "Austin",
      state: "TX",
      county: null,
      postalCode: null,
      dataForSeoLocationName: "Austin,Texas,United States",
      gbpAccountId: null,
      gbpLocationId: null,
      gbpLocationName: null,
      gbpProfile: null,
      existingMarketKeywords: [],
      missing: [],
    },
  ],
};

describe("generateMarketKeywordsForLocation", () => {
  it("creates approved normalized rows from ranking seeds without calling the agent", async () => {
    const rows = await generateMarketKeywordsForLocation(
      context,
      context.locations[0],
      { skipAgent: true },
    );

    expect(rows.map((row) => row.normalizedKeyword)).toEqual([
      "dentist near me",
      "emergency dentist",
      "dentist",
    ]);
    expect(rows[0]).toMatchObject({
      organizationId: 11,
      locationId: 101,
      source: "identifier_seed",
      status: "approved",
      languageCode: "en",
      locationName: "Austin,Texas,United States",
    });
    expect(rows.find((row) => row.source === "service_taxonomy")).toBeTruthy();
  });
});
