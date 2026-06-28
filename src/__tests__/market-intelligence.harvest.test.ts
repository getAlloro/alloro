import { beforeEach, describe, expect, it, vi } from "vitest";

const isDataForSeoConfigured = vi.fn();
const findApprovedForHarvest = vi.fn();
const upsertMany = vi.fn();
const fetchSearchVolume = vi.fn();

vi.mock("../config/dataforseo", () => ({
  isDataForSeoConfigured: () => isDataForSeoConfigured(),
}));

vi.mock("../models/MarketKeywordModel", () => ({
  MarketKeywordModel: {
    findApprovedForHarvest: (...args: unknown[]) => findApprovedForHarvest(...args),
  },
}));

vi.mock("../models/MarketKeywordSearchVolumeModel", () => ({
  MarketKeywordSearchVolumeModel: {
    upsertMany: (...args: unknown[]) => upsertMany(...args),
  },
}));

vi.mock("../services/integrations/search-volume/dataForSeoClient", () => ({
  fetchSearchVolume: (...args: unknown[]) => fetchSearchVolume(...args),
}));

import { harvestMarketSearchVolumeForOrganization } from "../controllers/market-intelligence/feature-services/MarketSearchVolumeHarvestService";

describe("harvestMarketSearchVolumeForOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isDataForSeoConfigured.mockReturnValue(true);
    findApprovedForHarvest.mockResolvedValue([
      {
        id: "kw-1",
        organization_id: 7,
        location_id: 42,
        keyword: "dentist near me",
        normalized_keyword: "dentist near me",
        cluster: "Dentist",
        source: "identifier_seed",
        location_name: "Austin,Texas,United States",
      },
      {
        id: "kw-2",
        organization_id: 7,
        location_id: 42,
        keyword: "emergency dentist",
        normalized_keyword: "emergency dentist",
        cluster: "Emergency",
        source: "gsc_query",
        location_name: "Austin,Texas,United States",
      },
    ]);
    fetchSearchVolume.mockResolvedValue({
      ok: true,
      results: [
        { keyword: "dentist near me", searchVolume: 90 },
        { keyword: "emergency dentist", searchVolume: 40 },
      ],
    });
    upsertMany.mockResolvedValue(undefined);
  });

  it("fetches DataForSEO volumes and upserts them against market keyword ids", async () => {
    const result = await harvestMarketSearchVolumeForOrganization(7, {
      reportMonth: "2026-06-01",
    });

    expect(fetchSearchVolume).toHaveBeenCalledWith(
      ["dentist near me", "emergency dentist"],
      "Austin,Texas,United States",
    );
    expect(upsertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        marketKeywordId: "kw-1",
        searchVolume: 90,
        reportMonth: "2026-06-01",
      }),
      expect.objectContaining({
        marketKeywordId: "kw-2",
        searchVolume: 40,
        reportMonth: "2026-06-01",
      }),
    ]);
    expect(result).toMatchObject({
      organizationId: 7,
      keywordsRequested: 2,
      rowsUpserted: 2,
      failedBatches: 0,
      skipped: false,
      error: null,
    });
  });

  it("skips cleanly when DataForSEO is not configured", async () => {
    isDataForSeoConfigured.mockReturnValue(false);

    const result = await harvestMarketSearchVolumeForOrganization(7, {
      reportMonth: "2026-06-01",
    });

    expect(findApprovedForHarvest).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      skipped: true,
      rowsUpserted: 0,
      error: "DataForSEO is not configured",
    });
  });
});
