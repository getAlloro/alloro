import { beforeEach, describe, expect, it, vi } from "vitest";

const buildBusinessContext = vi.fn();
const archiveApprovedKeywordsNotInSet = vi.fn();
const demoteApprovedGscKeywordsToCandidates = vi.fn();
const generateMarketKeywordsForLocation = vi.fn();
const listAll = vi.fn();
const transaction = vi.fn();
const upsertMany = vi.fn();

vi.mock("../controllers/market-intelligence/feature-services/BusinessContextBuilder", () => ({
  buildBusinessContext: (...args: unknown[]) => buildBusinessContext(...args),
}));

vi.mock("../controllers/market-intelligence/feature-services/MarketKeywordGenerationService", () => ({
  generateMarketKeywordsForLocation: (...args: unknown[]) => generateMarketKeywordsForLocation(...args),
}));

vi.mock("../models/MarketKeywordModel", () => ({
  MarketKeywordModel: {
    archiveApprovedKeywordsNotInSet: (...args: unknown[]) =>
      archiveApprovedKeywordsNotInSet(...args),
    demoteApprovedGscKeywordsToCandidates: (...args: unknown[]) =>
      demoteApprovedGscKeywordsToCandidates(...args),
    transaction: (...args: unknown[]) => transaction(...args),
    upsertMany: (...args: unknown[]) => upsertMany(...args),
  },
}));

vi.mock("../models/OrganizationModel", () => ({
  OrganizationModel: {
    listAll: (...args: unknown[]) => listAll(...args),
  },
}));

import { bootstrapMarketKeywordsForOrganization } from "../controllers/market-intelligence/feature-services/MarketKeywordBootstrapService";

const location = {
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
  existingMarketKeywords: [],
  missing: [],
};

describe("bootstrapMarketKeywordsForOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    demoteApprovedGscKeywordsToCandidates.mockResolvedValue(12);
    buildBusinessContext.mockResolvedValue({
      organizationId: 11,
      businessName: "Synthetic Dental",
      industry: "health",
      domain: "example.test",
      website: "example.test",
      projectId: "project-1",
      language: "en",
      recentGscQueries: [],
      missing: [],
      locations: [location],
    });
    generateMarketKeywordsForLocation.mockResolvedValue([
      {
        organizationId: 11,
        locationId: 101,
        keyword: "emergency dentist",
        normalizedKeyword: "emergency dentist",
        source: "market_intelligence_agent",
        status: "approved",
      },
    ]);
    transaction.mockImplementation((callback) => callback("trx"));
    archiveApprovedKeywordsNotInSet.mockResolvedValue(3);
    upsertMany.mockResolvedValue(undefined);
  });

  it("demotes old raw GSC approvals before rebuilding approved keywords", async () => {
    const result = await bootstrapMarketKeywordsForOrganization(11, {
      skipAgent: true,
    });

    expect(demoteApprovedGscKeywordsToCandidates).toHaveBeenCalledWith(11);
    expect(
      demoteApprovedGscKeywordsToCandidates.mock.invocationCallOrder[0],
    ).toBeLessThan(buildBusinessContext.mock.invocationCallOrder[0]);
    expect(archiveApprovedKeywordsNotInSet).toHaveBeenCalledWith(
      11,
      101,
      ["emergency dentist"],
      "trx",
    );
    expect(upsertMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          source: "market_intelligence_agent",
          status: "approved",
        }),
      ],
      "trx",
    );
    expect(result).toMatchObject({
      gscKeywordsDemoted: 12,
      keywordsUpserted: 1,
      errors: [],
    });
  });
});
