/**
 * Unit tests — patient-journey `stageReaders.readImpressions` empty-window
 * reasons (plans/07022026-patient-journey-month-nav-gsc-pending, T1).
 *
 * The service test mocks the readers wholesale, so the reason-decision logic
 * is proven here against the real reader with mocked models (§20.1 mirrors
 * the unit, §20.4 synthetic data): the GSC rows drive availability; the
 * `website_integrations` row drives `not_connected` vs `pending`/`no_data`;
 * a failed lookup degrades to the reason-less legacy empty read.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Model / dependency seams (keep stageReaders off the real DB + network) ──
const findByProjectAndDateRange = vi.fn();
const findByProjectAndPlatform = vi.fn();
const findDailyByOrgAndDateRange = vi.fn();

vi.mock("../models/website-builder/GscDataModel", () => ({
  GscDataModel: {
    findByProjectAndDateRange: (...a: unknown[]) =>
      findByProjectAndDateRange(...a),
  },
}));
vi.mock("../models/GoogleDataStoreModel", () => ({
  GoogleDataStoreModel: {
    findDailyByOrgAndDateRange: (...a: unknown[]) =>
      findDailyByOrgAndDateRange(...a),
  },
}));
vi.mock("../models/website-builder/WebsiteIntegrationModel", () => ({
  WebsiteIntegrationModel: {
    findByProjectAndPlatform: (...a: unknown[]) =>
      findByProjectAndPlatform(...a),
  },
}));
vi.mock("../models/website-builder/FormSubmissionModel", () => ({
  FormSubmissionModel: {},
}));
vi.mock("../models/website-builder/ProjectModel", () => ({
  ProjectModel: {},
}));
vi.mock("../models/website-builder/ReviewModel", () => ({
  ReviewModel: {},
}));
vi.mock("../models/PracticeRankingModel", () => ({
  PracticeRankingModel: {},
}));
vi.mock("../utils/pms/pmsAggregator", () => ({
  aggregatePmsData: vi.fn(),
}));
vi.mock(
  "../controllers/admin-websites/feature-services/service.rybbit-performance",
  () => ({ fetchRybbitOverview: vi.fn() }),
);
vi.mock("../utils/rybbit/rybbit-time-zone", () => ({
  resolveRybbitTimeZone: vi.fn(),
}));
vi.mock("../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { readImpressions } from "../controllers/patient-journey/feature-services/stageReaders";

const PROJECT = "proj-1";
const START = "2026-06-01";
const END = "2026-06-30";

const ORG = 7;
const LOCATION = 42;

// Build a daily google_data_store row: date_start = dayBefore, date_end = the
// later day; maps impressions live under gbp_data.{yesterday,dayBefore}. The
// impressions gate is WHOLE-PRACTICE, so a row carries its own location_id (and
// an id, used only to prove deterministic ordering) — both default to a single
// location for the simple cases.
function dailyRow(
  dateStart: string,
  dateEnd: string,
  dayBeforeMaps: [number, number],
  yesterdayMaps: [number, number],
  locationId: number = LOCATION,
  id: number = 1,
) {
  return {
    id,
    organization_id: ORG,
    location_id: locationId,
    domain: "example.com",
    run_type: "daily",
    date_start: dateStart,
    date_end: dateEnd,
    gbp_data: {
      dayBefore: {
        visibility: {
          impressions_maps_desktop: dayBeforeMaps[0],
          impressions_maps_mobile: dayBeforeMaps[1],
        },
      },
      yesterday: {
        visibility: {
          impressions_maps_desktop: yesterdayMaps[0],
          impressions_maps_mobile: yesterdayMaps[1],
        },
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findByProjectAndDateRange.mockResolvedValue([]);
  findDailyByOrgAndDateRange.mockResolvedValue([]);
});

describe("readImpressions — empty-window reasons", () => {
  it("reports not_connected when no GSC integration exists", async () => {
    findByProjectAndPlatform.mockResolvedValue(undefined);

    const read = await readImpressions(PROJECT, START, END, true);

    expect(read).toMatchObject({
      value: null,
      available: false,
      unavailableReason: "not_connected",
    });
    expect(findByProjectAndPlatform).toHaveBeenCalledWith(PROJECT, "gsc");
  });

  it("reports not_connected when the integration is not active", async () => {
    findByProjectAndPlatform.mockResolvedValue({ status: "revoked" });

    const read = await readImpressions(PROJECT, START, END, true);

    expect(read.available).toBe(false);
    expect(read.unavailableReason).toBe("not_connected");
  });

  it("reports pending for a connected, empty current month", async () => {
    findByProjectAndPlatform.mockResolvedValue({ status: "active" });

    const read = await readImpressions(PROJECT, START, END, true);

    expect(read.available).toBe(false);
    expect(read.unavailableReason).toBe("pending");
  });

  it("reports no_data for a connected, empty past month", async () => {
    findByProjectAndPlatform.mockResolvedValue({ status: "active" });

    const read = await readImpressions(PROJECT, START, END, false);

    expect(read.available).toBe(false);
    expect(read.unavailableReason).toBe("no_data");
  });

  it("degrades to the reason-less legacy empty read when the connection check fails", async () => {
    findByProjectAndPlatform.mockRejectedValue(new Error("lookup failed"));

    const read = await readImpressions(PROJECT, START, END, true);

    expect(read).toEqual({ value: null, available: false, asOf: null });
  });

  it("does not consult the integration when the window has data", async () => {
    findByProjectAndDateRange.mockResolvedValue([
      {
        report_date: "2026-06-10",
        data: { rows: [{ clicks: 5, impressions: 100, position: 4 }] },
      },
    ]);

    const read = await readImpressions(PROJECT, START, END, true);

    expect(read.available).toBe(true);
    expect(read.value).toBe(100);
    expect(read.unavailableReason).toBeUndefined();
    expect(findByProjectAndPlatform).not.toHaveBeenCalled();
  });
});

describe("readImpressions — Get Found = organic + whole-practice Maps", () => {
  const gscDay = (impressions: number) => ({
    report_date: "2026-06-10",
    data: { rows: [{ clicks: 5, impressions, position: 4 }] },
  });

  it("adds Maps impressions to GSC organic for the same window (org-scoped)", async () => {
    findByProjectAndDateRange.mockResolvedValue([gscDay(100)]);
    // One day of Maps: 30 desktop + 20 mobile = 50.
    findDailyByOrgAndDateRange.mockResolvedValue([
      dailyRow("2026-06-09", "2026-06-10", [0, 0], [30, 20]),
    ]);

    const read = await readImpressions(PROJECT, START, END, true, ORG);

    expect(read.available).toBe(true);
    expect(read.value).toBe(150); // 100 organic + 50 maps
    expect(read.metadata?.gsc?.clicks).toBe(5);
    expect(read.metadata?.maps).toEqual({ impressions: 50, days: 2 });
    // Whole-practice: the model is queried by ORG only, never a single location.
    expect(findDailyByOrgAndDateRange).toHaveBeenCalledWith(ORG, START, END);
  });

  it("sums Maps across ALL of the org's locations (whole-practice)", async () => {
    findByProjectAndDateRange.mockResolvedValue([gscDay(100)]);
    findDailyByOrgAndDateRange.mockResolvedValue([
      // Location 42: 06-09 = 0, 06-10 = 50.
      dailyRow("2026-06-09", "2026-06-10", [0, 0], [30, 20], 42, 1),
      // Location 43: 06-09 = 15, 06-10 = 25.
      dailyRow("2026-06-09", "2026-06-10", [10, 5], [20, 5], 43, 2),
    ]);

    const read = await readImpressions(PROJECT, START, END, true, ORG);

    // Maps = 0 + 50 + 15 + 25 = 90 across 4 (location, day) data points.
    expect(read.value).toBe(190); // 100 organic + 90 whole-practice maps
    expect(read.metadata?.maps).toEqual({ impressions: 90, days: 4 });
  });

  it("counts the same calendar day at two locations separately (dedup is per location)", async () => {
    findByProjectAndDateRange.mockResolvedValue([gscDay(0)]);
    findDailyByOrgAndDateRange.mockResolvedValue([
      // Both locations report 2026-06-10 — they must BOTH count, not collapse.
      dailyRow("2026-06-09", "2026-06-10", [0, 0], [10, 0], 42, 1),
      dailyRow("2026-06-09", "2026-06-10", [0, 0], [7, 0], 43, 2),
    ]);

    const read = await readImpressions(PROJECT, START, END, true, ORG);

    // (42,06-09)=0 (42,06-10)=10 (43,06-09)=0 (43,06-10)=7 → 4 points, 17 total.
    expect(read.value).toBe(17);
    expect(read.metadata?.maps).toEqual({ impressions: 17, days: 4 });
  });

  it("de-duplicates the overlapping day within one location's consecutive rows", async () => {
    findByProjectAndDateRange.mockResolvedValue([gscDay(0)]);
    // 2026-06-10 appears in both rows (as date_end of the first, date_start of
    // the second) for the SAME location — must be counted once.
    findDailyByOrgAndDateRange.mockResolvedValue([
      dailyRow("2026-06-09", "2026-06-10", [5, 5], [10, 10], LOCATION, 1),
      dailyRow("2026-06-10", "2026-06-11", [10, 10], [7, 8], LOCATION, 2),
    ]);

    const read = await readImpressions(PROJECT, START, END, true, ORG);

    // Days: 06-09 = 10, 06-10 = 20 (once), 06-11 = 15 → 45. Not 65.
    expect(read.value).toBe(45);
    expect(read.metadata?.maps).toEqual({ impressions: 45, days: 3 });
  });

  it("does NOT count a day whose stored payload has no visibility (missing ≠ measured zero)", async () => {
    findByProjectAndDateRange.mockResolvedValue([gscDay(0)]);
    findDailyByOrgAndDateRange.mockResolvedValue([
      {
        id: 1,
        organization_id: ORG,
        location_id: LOCATION,
        domain: "example.com",
        run_type: "daily",
        date_start: "2026-06-09",
        date_end: "2026-06-10",
        gbp_data: {
          // dayBefore (06-09) has NO visibility payload → not a measured day.
          dayBefore: {},
          // yesterday (06-10) is a real measured value.
          yesterday: {
            visibility: {
              impressions_maps_desktop: 30,
              impressions_maps_mobile: 20,
            },
          },
        },
      },
      {
        // A wholly empty payload contributes nothing at all.
        id: 2,
        organization_id: ORG,
        location_id: LOCATION,
        domain: "example.com",
        run_type: "daily",
        date_start: "2026-06-11",
        date_end: "2026-06-12",
        gbp_data: {},
      },
    ]);

    const read = await readImpressions(PROJECT, START, END, true, ORG);

    // Only 06-10 is measured. days must be 1, not 2/3 — coverage is honest.
    expect(read.value).toBe(50);
    expect(read.metadata?.maps).toEqual({ impressions: 50, days: 1 });
  });

  it("handles Postgres timestamp-format date columns without dropping the boundary day", async () => {
    findByProjectAndDateRange.mockResolvedValue([]);
    findDailyByOrgAndDateRange.mockResolvedValue([
      // Dates rendered as `timestamp::text` → "YYYY-MM-DD 00:00:00" (space).
      // date_end sits on the window's last day (END) — the old "T"-only split
      // would leave " 00:00:00" attached and drop it.
      {
        id: 1,
        organization_id: ORG,
        location_id: LOCATION,
        domain: "example.com",
        run_type: "daily",
        date_start: "2026-06-29 00:00:00",
        date_end: "2026-06-30 00:00:00",
        gbp_data: {
          dayBefore: {
            visibility: {
              impressions_maps_desktop: 10,
              impressions_maps_mobile: 0,
            },
          },
          yesterday: {
            visibility: {
              impressions_maps_desktop: 30,
              impressions_maps_mobile: 20,
            },
          },
        },
      },
    ]);

    const read = await readImpressions(PROJECT, START, END, true, ORG);

    // Both 06-29 (10) and the boundary day 06-30 (50) count → 60 over 2 days.
    expect(read.value).toBe(60);
    expect(read.metadata?.maps).toEqual({ impressions: 60, days: 2 });
    // asOf must be a clean date, never leaking a time component.
    expect(read.asOf).toBe("2026-06-30");
  });

  it("reflects real partial coverage across a multi-location org", async () => {
    findByProjectAndDateRange.mockResolvedValue([gscDay(0)]);
    findDailyByOrgAndDateRange.mockResolvedValue([
      // Location 42 has both days measured (06-09 = 10, 06-10 = 20).
      dailyRow("2026-06-09", "2026-06-10", [10, 0], [20, 0], 42, 1),
      // Location 43 only has 06-10 measured (06-09 side has no visibility).
      {
        id: 2,
        organization_id: ORG,
        location_id: 43,
        domain: "example.com",
        run_type: "daily",
        date_start: "2026-06-09",
        date_end: "2026-06-10",
        gbp_data: {
          dayBefore: {},
          yesterday: {
            visibility: {
              impressions_maps_desktop: 5,
              impressions_maps_mobile: 0,
            },
          },
        },
      },
    ]);

    const read = await readImpressions(PROJECT, START, END, true, ORG);

    // (42,06-09)=10 (42,06-10)=20 (43,06-10)=5 → 3 measured points, 35 total.
    expect(read.value).toBe(35);
    expect(read.metadata?.maps).toEqual({ impressions: 35, days: 3 });
  });

  it("becomes available on Maps alone when GSC has no rows", async () => {
    findByProjectAndDateRange.mockResolvedValue([]);
    findDailyByOrgAndDateRange.mockResolvedValue([
      dailyRow("2026-06-09", "2026-06-10", [0, 0], [40, 10]),
    ]);

    const read = await readImpressions(PROJECT, START, END, true, ORG);

    expect(read.available).toBe(true);
    expect(read.value).toBe(50);
    expect(read.unavailableReason).toBeUndefined();
    expect(read.metadata?.gsc).toBeUndefined();
    expect(read.metadata?.maps).toEqual({ impressions: 50, days: 2 });
    // No positive-signal shortcut needed the integration check.
    expect(findByProjectAndPlatform).not.toHaveBeenCalled();
  });

  it("keeps the honest empty reason when GSC is empty and Maps is a measured zero", async () => {
    findByProjectAndPlatform.mockResolvedValue({ status: "active" });
    findByProjectAndDateRange.mockResolvedValue([]);
    findDailyByOrgAndDateRange.mockResolvedValue([
      dailyRow("2026-06-09", "2026-06-10", [0, 0], [0, 0]),
    ]);

    const read = await readImpressions(PROJECT, START, END, true, ORG);

    expect(read.available).toBe(false);
    expect(read.unavailableReason).toBe("pending");
    expect(read.value).toBeNull();
  });

  it("falls back to organic-only when no org is supplied", async () => {
    findByProjectAndDateRange.mockResolvedValue([gscDay(100)]);

    const read = await readImpressions(PROJECT, START, END, true);

    expect(read.value).toBe(100);
    expect(read.metadata?.maps).toBeUndefined();
    expect(findDailyByOrgAndDateRange).not.toHaveBeenCalled();
  });

  it("degrades to organic-only when the Maps read throws", async () => {
    findByProjectAndDateRange.mockResolvedValue([gscDay(100)]);
    findDailyByOrgAndDateRange.mockRejectedValue(new Error("db down"));

    const read = await readImpressions(PROJECT, START, END, true, ORG);

    expect(read.available).toBe(true);
    expect(read.value).toBe(100);
    expect(read.metadata?.maps).toBeUndefined();
  });
});
