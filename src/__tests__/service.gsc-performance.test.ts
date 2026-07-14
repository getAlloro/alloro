import { beforeEach, describe, expect, it, vi } from "vitest";

const findLatestReportDate = vi.fn<
  (projectId: string) => Promise<string | null>
>();
const findByProjectAndDateRange = vi.fn<
  (
    projectId: string,
    fromDate: string,
    toDate: string,
  ) => Promise<Array<{ data: Record<string, unknown> }>>
>();
const warnMock = vi.fn();

vi.mock("../models/website-builder/GscDataModel", () => ({
  GscDataModel: {
    findLatestReportDate,
    findByProjectAndDateRange,
  },
}));

vi.mock("../lib/logger", () => ({
  default: { warn: warnMock },
}));

describe("getTopQueriesByProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty list without querying a range when no report exists", async () => {
    findLatestReportDate.mockResolvedValue(null);

    const { getTopQueriesByProject } = await import(
      "../controllers/admin-websites/feature-services/service.gsc-performance"
    );

    await expect(getTopQueriesByProject("project-no-gsc")).resolves.toEqual([]);
    expect(findByProjectAndDateRange).not.toHaveBeenCalled();
  });

  it("aggregates the latest 90-day query window and honors the result limit", async () => {
    findLatestReportDate.mockResolvedValue("2026-07-10");
    findByProjectAndDateRange.mockResolvedValue([
      {
        data: {
          schemaVersion: 2,
          queries: {
            rows: [
              { keys: ["alpha"], clicks: 3, impressions: 30, position: 2 },
              { keys: ["beta"], clicks: 1, impressions: 100, position: 5 },
            ],
          },
        },
      },
      {
        data: {
          schemaVersion: 2,
          queries: {
            rows: [
              { keys: ["alpha"], clicks: 2, impressions: 20, position: 4 },
              { keys: ["gamma"], clicks: 0, impressions: 200, position: 10 },
            ],
          },
        },
      },
    ]);

    const { getTopQueriesByProject } = await import(
      "../controllers/admin-websites/feature-services/service.gsc-performance"
    );
    const result = await getTopQueriesByProject("project-with-gsc", 2);

    expect(findByProjectAndDateRange).toHaveBeenCalledWith(
      "project-with-gsc",
      "2026-04-12",
      "2026-07-10",
    );
    expect(result).toEqual([
      {
        key: "alpha",
        clicks: 5,
        impressions: 50,
        ctr: 0.1,
        position: 2.8,
      },
      {
        key: "beta",
        clicks: 1,
        impressions: 100,
        ctr: 0.01,
        position: 5,
      },
    ]);
  });

  it("logs project context and degrades to no demand when the optional lookup fails", async () => {
    const lookupError = new Error("database unavailable");
    findLatestReportDate.mockRejectedValue(lookupError);

    const { getTopQueriesByProject } = await import(
      "../controllers/admin-websites/feature-services/service.gsc-performance"
    );

    await expect(getTopQueriesByProject("project-failed-gsc")).resolves.toEqual(
      [],
    );
    expect(warnMock).toHaveBeenCalledWith(
      { err: lookupError, projectId: "project-failed-gsc" },
      "[GSC Performance] Optional SEO demand lookup failed",
    );
  });
});
