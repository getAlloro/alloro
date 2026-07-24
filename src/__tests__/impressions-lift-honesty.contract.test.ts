/**
 * Adversarial honesty contract — `impressionsLiftReader.readImpressionsLift`.
 *
 * NEW cases the shipped reader suite does not already prove; the two sharp
 * angles it leaves open:
 *
 *  1. Provenance is FIXED, never derived from data: `source` is `"gsc_organic"`
 *     on a sufficient result AND on an insufficient one, so a Maps/GBP number can
 *     never fold into an "organic" delta. (The reader only ever consults the GSC
 *     model — there is no Maps read path to fold in.)
 *  2. A partial window's storedImpressions is EXPOSED but never subtracted into a
 *     fake total — even when the partial sum is large enough that a naive
 *     `post - pre` would look like a dramatic (wrong-signed) lift.
 *
 * Deliberately NOT duplicated (already proven in patient-journey.impressions-
 * lift-reader.test.ts): the happy delta math, versioned-payload parse, dedupe,
 * rise-from-zero null pctChange, empty/inverted windows, no-project, DB-throw.
 *
 * Only the DB seams (GscDataModel, ProjectModel) and the logger are mocked; the
 * real coverage guard and the real organic parse run.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const findByProjectAndDateRange = vi.fn();
const findEarliestReportDate = vi.fn();
const findLatestReportDate = vi.fn();
const findByOrganizationId = vi.fn();

vi.mock("../models/website-builder/GscDataModel", () => ({
  GscDataModel: {
    findByProjectAndDateRange: (...a: unknown[]) => findByProjectAndDateRange(...a),
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
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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

describe("readImpressionsLift — provenance is fixed GSC-organic, Maps never folds in", () => {
  it("keeps source 'gsc_organic' on a sufficient result and reads ONLY the GSC model", async () => {
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
    expect(res.source).toBe("gsc_organic");
    // The delta was formed purely from the GSC-organic model's rows: the reader
    // has no Maps/GBP read path, so no Maps impressions can leak into "organic".
    expect(findByProjectAndDateRange).toHaveBeenCalled();
    expect(res.delta).toBe(150);
  });

  it("keeps source 'gsc_organic' even on an insufficient (no organic history) result", async () => {
    // A Maps-era analog: the GSC-organic store is empty. The reader must not
    // borrow a number from anywhere else — it reports insufficient, and the
    // provenance stays fixed rather than flipping to a Maps source.
    routeWindows({ [PRE.start]: [], [POST.start]: [] });

    const res = await readImpressionsLift(ORG, PRE, POST);

    expect(res.sufficient).toBe(false);
    expect(res.source).toBe("gsc_organic");
    expect(res.delta).toBeNull();
    expect(res.reason).toMatch(/no stored GSC-organic history/);
  });

  it("carries the Maps exclusion on the result, on BOTH the sufficient and insufficient paths", async () => {
    // `AGENTS.md` defines Get Found as map + organic + AI answers; this reader
    // answers one of the three. The exclusion has to ride on the object, or a
    // downstream label quietly presents a partial measure as the whole gate —
    // "Search impressions: 27,151" with no caveat.
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
    const sufficient = await readImpressionsLift(ORG, PRE, POST);

    routeWindows({ [PRE.start]: [], [POST.start]: [] });
    const insufficient = await readImpressionsLift(ORG, PRE, POST);

    expect(sufficient.sufficient).toBe(true);
    expect(sufficient.excludes).toEqual(["gbp_maps"]);
    expect(insufficient.sufficient).toBe(false);
    expect(insufficient.excludes).toEqual(["gbp_maps"]);
  });
});

describe("readImpressionsLift — a partial window is never subtracted into a fake total", () => {
  it("refuses a delta when a LARGE partial pre-window would otherwise fake a dramatic swing", async () => {
    // PRE has only 2 of 3 days stored, but those two days carry a big number
    // (5000). A dishonest reader that subtracted the partial sum would report a
    // delta of 300 - 5000 = -4700 — a fabricated collapse over missing days.
    // The honest reader exposes the 5000 as coverage but produces NO delta.
    routeWindows({
      [PRE.start]: [
        legacyDay("2026-06-01", 2500),
        legacyDay("2026-06-02", 2500),
      ], // day 3 missing → partial
      [POST.start]: [
        legacyDay("2026-06-08", 100),
        legacyDay("2026-06-09", 100),
        legacyDay("2026-06-10", 100),
      ],
    });

    const res = await readImpressionsLift(ORG, PRE, POST);

    expect(res.sufficient).toBe(false);
    expect(res.delta).toBeNull();
    expect(res.pctChange).toBeNull();
    // The partial sum is exposed honestly as coverage, not hidden…
    expect(res.pre?.storedImpressions).toBe(5000);
    expect(res.pre?.storedDays).toBe(2);
    expect(res.pre?.expectedDays).toBe(3);
    expect(res.pre?.fullyCovered).toBe(false);
    // …and the fully-covered post is still exposed, but never combined into a delta.
    expect(res.post?.fullyCovered).toBe(true);
    expect(res.post?.storedImpressions).toBe(300);
    expect(res.reason).toMatch(/PRE window is only partially covered \(2 of 3/);
  });
});
