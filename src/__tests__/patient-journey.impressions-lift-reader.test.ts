/**
 * Unit tests — patient-journey `impressionsLiftReader`.
 *
 * Proves the two things a type-check cannot: (1) the before -> after delta math
 * is right over STORED GSC-organic rows, and (2) partial / absent coverage
 * returns the honest insufficient result (null delta + plain-words reason),
 * NEVER a delta summed over missing days dressed up as real.
 *
 * The real `sumOrganicImpressionsForDay` (the shared organic parse from
 * stageReaders) runs against mocked `gsc_data` rows — only the DB seams
 * (GscDataModel, ProjectModel) and the logger are mocked, so a break in the
 * shared parse or in the coverage guard fails here even though it compiles.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const findByProjectAndDateRange = vi.fn();
const findEarliestReportDate = vi.fn();
const findLatestReportDate = vi.fn();
const findByOrganizationId = vi.fn();
const loggerWarn = vi.fn();

vi.mock("../models/website-builder/GscDataModel", () => ({
  GscDataModel: {
    findByProjectAndDateRange: (...a: unknown[]) =>
      findByProjectAndDateRange(...a),
    findEarliestReportDate: (...a: unknown[]) => findEarliestReportDate(...a),
    findLatestReportDate: (...a: unknown[]) => findLatestReportDate(...a),
  },
}));
vi.mock("../models/website-builder/ProjectModel", () => ({
  ProjectModel: {
    findByOrganizationId: (...a: unknown[]) => findByOrganizationId(...a),
  },
}));
vi.mock("../lib/logger", () => ({
  default: {
    info: vi.fn(),
    warn: (...a: unknown[]) => loggerWarn(...a),
    error: vi.fn(),
  },
}));

import {
  readImpressionsLift,
  type DateWindow,
} from "../controllers/patient-journey/feature-services/impressionsLiftReader";

const ORG = 39;
const PROJECT = "proj-1";
const PRE: DateWindow = { start: "2026-06-01", end: "2026-06-03" }; // 3 days
const POST: DateWindow = { start: "2026-06-08", end: "2026-06-10" }; // 3 days

/** A stored legacy `{ rows }` gsc_data row for one day. */
const legacyDay = (date: string, impressions: number) => ({
  report_date: date,
  data: { rows: [{ clicks: 5, impressions, position: 4 }] },
});

/** A stored versioned `{ schemaVersion:2, summary:{ rows } }` gsc_data row. */
const versionedDay = (date: string, impressions: number) => ({
  report_date: date,
  data: {
    schemaVersion: 2,
    summary: { rows: [{ clicks: 3, impressions, position: 6 }] },
    queries: { rows: [{ keys: ["endodontist"], impressions, clicks: 3 }] },
  },
});

/** Route the two window queries to the right stored rows by their start date. */
function routeWindows(rowsByStart: Record<string, unknown[]>) {
  findByProjectAndDateRange.mockImplementation(
    (_projectId: string, start: string) => rowsByStart[start] ?? [],
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  findByOrganizationId.mockResolvedValue({ id: PROJECT });
  findByProjectAndDateRange.mockResolvedValue([]);
  findEarliestReportDate.mockResolvedValue("2026-05-01");
  findLatestReportDate.mockResolvedValue("2026-06-30");
});

describe("readImpressionsLift — honest delta when both windows are fully covered", () => {
  it("returns the real before -> after organic delta and pct change", async () => {
    routeWindows({
      [PRE.start]: [
        legacyDay("2026-06-01", 100),
        legacyDay("2026-06-02", 100),
        legacyDay("2026-06-03", 100),
      ],
      [POST.start]: [
        legacyDay("2026-06-08", 150),
        legacyDay("2026-06-09", 150),
        legacyDay("2026-06-10", 150),
      ],
    });

    const res = await readImpressionsLift(ORG, PRE, POST);

    expect(res.sufficient).toBe(true);
    expect(res.reason).toBeNull();
    expect(res.source).toBe("gsc_organic");
    expect(res.projectId).toBe(PROJECT);
    expect(res.pre?.storedImpressions).toBe(300);
    expect(res.post?.storedImpressions).toBe(450);
    expect(res.pre?.fullyCovered).toBe(true);
    expect(res.post?.fullyCovered).toBe(true);
    expect(res.delta).toBe(150); // 450 - 300
    expect(res.pctChange).toBeCloseTo(0.5, 10); // 150 / 300
    expect(res.history).toEqual({
      earliest: "2026-05-01",
      latest: "2026-06-30",
    });
  });

  it("parses versioned (schemaVersion 2) payloads with the same organic sum", async () => {
    routeWindows({
      [PRE.start]: [
        versionedDay("2026-06-01", 40),
        versionedDay("2026-06-02", 40),
        versionedDay("2026-06-03", 40),
      ],
      [POST.start]: [
        versionedDay("2026-06-08", 60),
        versionedDay("2026-06-09", 60),
        versionedDay("2026-06-10", 60),
      ],
    });

    const res = await readImpressionsLift(ORG, PRE, POST);

    expect(res.sufficient).toBe(true);
    expect(res.pre?.storedImpressions).toBe(120);
    expect(res.post?.storedImpressions).toBe(180);
    expect(res.delta).toBe(60);
  });

  it("reports exact coverage metadata for a fully covered window", async () => {
    routeWindows({
      [PRE.start]: [
        legacyDay("2026-06-01", 10),
        legacyDay("2026-06-02", 20),
        legacyDay("2026-06-03", 30),
      ],
      [POST.start]: [
        legacyDay("2026-06-08", 0),
        legacyDay("2026-06-09", 0),
        legacyDay("2026-06-10", 0),
      ],
    });

    const res = await readImpressionsLift(ORG, PRE, POST);

    expect(res.pre).toMatchObject({
      storedDays: 3,
      expectedDays: 3,
      earliestStored: "2026-06-01",
      latestStored: "2026-06-03",
      fullyCovered: true,
    });
  });

  it("counts a duplicated report_date once (dedupe, no double-count)", async () => {
    routeWindows({
      [PRE.start]: [
        legacyDay("2026-06-01", 100),
        legacyDay("2026-06-01", 100), // same day repeated — must not double
        legacyDay("2026-06-02", 100),
        legacyDay("2026-06-03", 100),
      ],
      [POST.start]: [
        legacyDay("2026-06-08", 100),
        legacyDay("2026-06-09", 100),
        legacyDay("2026-06-10", 100),
      ],
    });

    const res = await readImpressionsLift(ORG, PRE, POST);

    expect(res.pre?.storedDays).toBe(3);
    expect(res.pre?.storedImpressions).toBe(300); // not 400
    expect(res.sufficient).toBe(true);
  });

  it("gives a real delta but null pctChange when the pre window is a true zero", async () => {
    routeWindows({
      [PRE.start]: [
        legacyDay("2026-06-01", 0),
        legacyDay("2026-06-02", 0),
        legacyDay("2026-06-03", 0),
      ],
      [POST.start]: [
        legacyDay("2026-06-08", 40),
        legacyDay("2026-06-09", 30),
        legacyDay("2026-06-10", 30),
      ],
    });

    const res = await readImpressionsLift(ORG, PRE, POST);

    expect(res.sufficient).toBe(true);
    expect(res.pre?.storedImpressions).toBe(0);
    expect(res.delta).toBe(100);
    expect(res.pctChange).toBeNull(); // a rise from zero has no honest percentage
  });
});

describe("readImpressionsLift — partial/absent coverage returns the honest insufficient result", () => {
  it("null delta when the PRE window is only partially covered", async () => {
    routeWindows({
      // Only 2 of the 3 PRE days are stored.
      [PRE.start]: [legacyDay("2026-06-01", 100), legacyDay("2026-06-02", 100)],
      [POST.start]: [
        legacyDay("2026-06-08", 150),
        legacyDay("2026-06-09", 150),
        legacyDay("2026-06-10", 150),
      ],
    });

    const res = await readImpressionsLift(ORG, PRE, POST);

    expect(res.sufficient).toBe(false);
    expect(res.delta).toBeNull();
    expect(res.pctChange).toBeNull();
    // Coverage is still exposed honestly, not hidden.
    expect(res.pre?.storedDays).toBe(2);
    expect(res.pre?.expectedDays).toBe(3);
    expect(res.pre?.fullyCovered).toBe(false);
    expect(res.pre?.storedImpressions).toBe(200);
    expect(res.post?.fullyCovered).toBe(true);
    expect(res.reason).toMatch(/PRE window is only partially covered \(2 of 3/);
  });

  it("null delta with a no-history reason when the POST window is empty", async () => {
    routeWindows({
      [PRE.start]: [
        legacyDay("2026-06-01", 100),
        legacyDay("2026-06-02", 100),
        legacyDay("2026-06-03", 100),
      ],
      [POST.start]: [],
    });

    const res = await readImpressionsLift(ORG, PRE, POST);

    expect(res.sufficient).toBe(false);
    expect(res.delta).toBeNull();
    expect(res.post?.storedDays).toBe(0);
    expect(res.post?.fullyCovered).toBe(false);
    expect(res.reason).toMatch(/POST window has no stored GSC-organic history/);
  });

  it("names both windows when neither has any stored history", async () => {
    routeWindows({ [PRE.start]: [], [POST.start]: [] });

    const res = await readImpressionsLift(ORG, PRE, POST);

    expect(res.sufficient).toBe(false);
    expect(res.delta).toBeNull();
    expect(res.reason).toMatch(/PRE window has no stored GSC-organic history/);
    expect(res.reason).toMatch(/POST window has no stored GSC-organic history/);
  });

  it("is insufficient for a malformed (inverted) window rather than inventing a span", async () => {
    const inverted: DateWindow = { start: "2026-06-10", end: "2026-06-01" };
    routeWindows({
      // The inverted PRE query returns nothing; POST is fully covered.
      [inverted.start]: [],
      [POST.start]: [
        legacyDay("2026-06-08", 10),
        legacyDay("2026-06-09", 10),
        legacyDay("2026-06-10", 10),
      ],
    });

    const res = await readImpressionsLift(ORG, inverted, POST);

    expect(res.sufficient).toBe(false);
    expect(res.delta).toBeNull();
    expect(res.pre?.fullyCovered).toBe(false);
  });
});

describe("readImpressionsLift — degrades honestly, never throws", () => {
  it("returns insufficient with a reason when the org has no website project", async () => {
    findByOrganizationId.mockResolvedValue(undefined);

    const res = await readImpressionsLift(ORG, PRE, POST);

    expect(res.projectId).toBeNull();
    expect(res.sufficient).toBe(false);
    expect(res.delta).toBeNull();
    expect(res.reason).toMatch(/no website project/);
    // No project → no window reads attempted.
    expect(findByProjectAndDateRange).not.toHaveBeenCalled();
  });

  it("degrades to an insufficient read (and logs) when the DB throws", async () => {
    findByProjectAndDateRange.mockRejectedValue(new Error("db down"));

    const res = await readImpressionsLift(ORG, PRE, POST);

    expect(res.sufficient).toBe(false);
    expect(res.delta).toBeNull();
    expect(res.reason).toBe("impressions-lift read failed");
    expect(loggerWarn).toHaveBeenCalled();
  });
});
