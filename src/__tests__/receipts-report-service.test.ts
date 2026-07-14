import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  findOrganizationById: vi.fn(),
  listLocations: vi.fn(),
  countLeads: vi.fn(),
  countPublishedWork: vi.fn(),
  listRankings: vi.fn(),
  fetchPeriodUsers: vi.fn(),
}));

vi.mock("../models/OrganizationModel", () => ({
  OrganizationModel: { findById: mocks.findOrganizationById },
}));

vi.mock("../models/ReceiptsReportModel", () => ({
  ReceiptsReportModel: {
    listLocationsByOrganization: mocks.listLocations,
    countFormSubmissionsForPeriod: mocks.countLeads,
    countPublishedGbpWorkItemsByLocation: mocks.countPublishedWork,
    listCompletedSearchPositionObservations: mocks.listRankings,
  },
}));

vi.mock("../utils/rybbit/service.rybbit-data", () => ({
  fetchRybbitPeriodUsers: mocks.fetchPeriodUsers,
}));

import { ReceiptsReportService } from "../controllers/receipts-report/feature-services/ReceiptsReportService";
import type { ReceiptsReportRankingObservationRow } from "../models/ReceiptsReportModel";

const INPUT = {
  organizationId: 39,
  startDate: "2026-04-01",
  endDate: "2026-06-30",
};

function rankingRow(
  overrides: Partial<ReceiptsReportRankingObservationRow> = {}
): ReceiptsReportRankingObservationRow {
  return {
    id: overrides.id ?? 1,
    location_id: overrides.location_id ?? 10,
    search_position: overrides.search_position ?? 7,
    search_query: overrides.search_query ?? "endodontist near me",
    search_results: overrides.search_results ?? [],
    search_checked_at:
      overrides.search_checked_at ?? new Date("2026-04-01T12:00:00.000Z"),
    search_position_source:
      overrides.search_position_source ?? "serpapi_maps",
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-14T10:00:00.000Z"));
  vi.clearAllMocks();
  mocks.findOrganizationById.mockResolvedValue({ id: INPUT.organizationId });
  mocks.listLocations.mockResolvedValue([
    { id: 10, name: "Main" },
    { id: 20, name: null },
  ]);
  mocks.countLeads.mockResolvedValue(4);
  mocks.countPublishedWork.mockResolvedValue([]);
  mocks.listRankings.mockResolvedValue([]);
  mocks.fetchPeriodUsers.mockResolvedValue({ status: "ok", users: 17 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ReceiptsReportService.getReport", () => {
  it("builds attributable totals and explicit location ranking evidence", async () => {
    mocks.countPublishedWork.mockResolvedValue([
      { location_id: 10, content_type: "local_post", count: 2 },
      { location_id: 10, content_type: "review_reply", count: 5 },
      { location_id: 20, content_type: "review_reply", count: 1 },
    ]);
    mocks.listRankings.mockResolvedValue([
      rankingRow({ id: 1, search_position: 7 }),
      rankingRow({
        id: 2,
        search_position: 3,
        search_checked_at: new Date("2026-05-01T12:00:00.000Z"),
      }),
      rankingRow({
        id: 3,
        search_position: 5,
        search_checked_at: new Date("2026-06-01T12:00:00.000Z"),
        search_results: [
          {
            name: "Client Practice",
            position: 5,
            reviewCount: 120,
            isClient: true,
          },
          {
            name: "Second Competitor",
            position: 2,
            reviewCount: 88,
            isClient: false,
          },
          {
            name: "Top Competitor",
            position: 1,
            reviewCount: 140,
            isClient: false,
          },
        ],
      }),
    ]);

    const report = await ReceiptsReportService.getReport(INPUT);

    expect(report.generatedAt).toBe("2026-07-14T10:00:00.000Z");
    expect(report.orgLevel).toEqual({
      websiteVisitors: { value: 17, flag: "ok" },
      leadsCaptured: { value: 4, flag: "ok" },
    });
    expect(report.total).toEqual({
      gbpPostsPublished: { value: 2, flag: "ok" },
      gbpReviewRepliesPublished: { value: 6, flag: "ok" },
    });
    expect(report.locations[1].locationName).toBe("Location 20");
    expect(report.locations[0].gbpReviewRepliesPublished.value).toBe(5);
    expect(report.locations[0].rankingMovement).toEqual({
      flag: "ok",
      movements: [
        {
          query: "endodontist near me",
          source: "serpapi_maps",
          first: { position: 7, observedAt: "2026-04-01T12:00:00.000Z" },
          last: { position: 5, observedAt: "2026-06-01T12:00:00.000Z" },
          best: { position: 3, observedAt: "2026-05-01T12:00:00.000Z" },
          worst: { position: 7, observedAt: "2026-04-01T12:00:00.000Z" },
        },
      ],
    });
    expect(report.locations[0].reviewsVsTopCompetitor).toEqual({
      flag: "ok",
      value: {
        observedAt: "2026-06-01T12:00:00.000Z",
        query: "endodontist near me",
        source: "serpapi_maps",
        clientReviewCount: 120,
        competitorName: "Top Competitor",
        competitorReviewCount: 140,
        competitorPosition: 1,
      },
    });
    expect(report.replacementCostContext).toMatchObject({
      total: null,
      ratesStaked: false,
    });
  });

  it("passes tenant and half-open period bounds to every database source", async () => {
    await ReceiptsReportService.getReport(INPUT);

    const startAt = new Date("2026-04-01T00:00:00.000Z");
    const endExclusiveAt = new Date("2026-07-01T00:00:00.000Z");
    expect(mocks.listLocations).toHaveBeenCalledWith(INPUT.organizationId);
    expect(mocks.countLeads).toHaveBeenCalledWith(
      INPUT.organizationId,
      startAt,
      endExclusiveAt
    );
    expect(mocks.countPublishedWork).toHaveBeenCalledWith(
      INPUT.organizationId,
      startAt,
      endExclusiveAt
    );
    expect(mocks.listRankings).toHaveBeenCalledWith(
      INPUT.organizationId,
      startAt,
      endExclusiveAt
    );
    expect(mocks.fetchPeriodUsers).toHaveBeenCalledWith(
      INPUT.organizationId,
      INPUT.startDate,
      INPUT.endDate
    );
  });

  it.each(["not_connected", "source_unavailable"] as const)(
    "keeps Rybbit %s distinct from a real zero",
    async (status) => {
      mocks.fetchPeriodUsers.mockResolvedValue({ status });

      const report = await ReceiptsReportService.getReport(INPUT);

      expect(report.orgLevel.websiteVisitors).toEqual({
        value: null,
        flag: status,
      });
    }
  );

  it("does not reuse stale competitor data when the latest observation lacks it", async () => {
    mocks.listRankings.mockResolvedValue([
      rankingRow({
        id: 1,
        search_results: [
          {
            name: "Old Competitor",
            position: 1,
            reviewCount: 99,
            isClient: false,
          },
        ],
      }),
      rankingRow({
        id: 2,
        search_position: 4,
        search_checked_at: new Date("2026-06-01T12:00:00.000Z"),
        search_results: null,
      }),
    ]);

    const report = await ReceiptsReportService.getReport(INPUT);

    expect(report.locations[0].reviewsVsTopCompetitor).toEqual({
      value: null,
      flag: "no_competitor_data",
    });
  });

  it("returns explicit empty ranking states without fabricating positions", async () => {
    const report = await ReceiptsReportService.getReport(INPUT);

    expect(report.locations[0].rankingMovement).toEqual({
      movements: [],
      flag: "no_observations",
    });
    expect(report.locations[0].reviewsVsTopCompetitor).toEqual({
      value: null,
      flag: "no_observations",
    });
  });

  it("rejects a missing organization before reading report sources", async () => {
    mocks.findOrganizationById.mockResolvedValue(undefined);

    await expect(ReceiptsReportService.getReport(INPUT)).rejects.toMatchObject({
      code: "RECEIPTS_REPORT_ORGANIZATION_NOT_FOUND",
    });
    expect(mocks.listLocations).not.toHaveBeenCalled();
    expect(mocks.fetchPeriodUsers).not.toHaveBeenCalled();
  });

  it("propagates a model failure instead of converting it to zero", async () => {
    mocks.countPublishedWork.mockRejectedValue(
      new Error("synthetic published-work failure")
    );

    await expect(ReceiptsReportService.getReport(INPUT)).rejects.toThrow(
      "synthetic published-work failure"
    );
  });
});
