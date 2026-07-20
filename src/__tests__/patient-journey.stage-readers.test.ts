/**
 * Unit tests — patient-journey `stageReaders` per-stage readers.
 *
 * The service test mocks the readers wholesale, so the reader decision logic is
 * proven here against the real readers with mocked models (§20.1 mirrors the
 * unit, §20.4 synthetic data).
 *
 * `readImpressions` empty-window reasons
 * (plans/07022026-patient-journey-month-nav-gsc-pending, T1): the GSC rows drive
 * availability; the `website_integrations` row drives `not_connected` vs
 * `pending`/`no_data`; a failed lookup degrades to the reason-less legacy empty
 * read.
 *
 * `readRank` / `readLeads` / `readReviews` honesty states
 * (plans/07202026-pr-merge-remediation, T2): the "one null, several meanings"
 * class that a passing type-check cannot catch. Each fixture pins the exact
 * DB-row/summary shape a reader receives and the honest read that shape MUST
 * produce — a change that re-introduces a fabricated number, or collapses a
 * "couldn't measure" null into a definite negative claim, fails here even
 * though it compiles.
 *
 * Customer-facing copy is deliberately NOT asserted here (§4.3): it is pinned in
 * the frontend beside the component that renders it, in
 * `frontend/src/components/dashboard/patient-journey/PatientJourneyContextCards.test.tsx`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import type {
  RankRead,
  ReviewsRead,
} from "../controllers/patient-journey/feature-services/stageReaders";
import type { StageUnavailableReason } from "../controllers/patient-journey/feature-utils/types";
import type { SearchPositionStatus } from "../models/PracticeRankingModel";
import type { ReviewSummaryForLocation } from "../models/website-builder/ReviewModel";

// ── Model / dependency seams (keep stageReaders off the real DB + network) ──
const findByProjectAndDateRange = vi.fn();
const findByProjectAndPlatform = vi.fn();
const findDailyByOrgAndDateRange = vi.fn();
const findSelectedGbpForSync = vi.fn();
const findLatestCompletedRankingMetrics = vi.fn();
const getMonthlyStatsByProject = vi.fn();
const getReviewSummaryForLocation = vi.fn();
const loggerWarn = vi.fn();

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
vi.mock("../models/GooglePropertyModel", () => ({
  GooglePropertyModel: {
    findSelectedGbpForSync: (...a: unknown[]) => findSelectedGbpForSync(...a),
  },
}));
vi.mock("../models/website-builder/WebsiteIntegrationModel", () => ({
  WebsiteIntegrationModel: {
    findByProjectAndPlatform: (...a: unknown[]) =>
      findByProjectAndPlatform(...a),
  },
}));
vi.mock("../models/website-builder/FormSubmissionModel", () => ({
  FormSubmissionModel: {
    getMonthlyStatsByProject: (...a: unknown[]) => getMonthlyStatsByProject(...a),
  },
}));
vi.mock("../models/website-builder/ProjectModel", () => ({
  ProjectModel: {},
}));
vi.mock("../models/website-builder/ReviewModel", () => ({
  ReviewModel: {
    getReviewSummaryForLocation: (...a: unknown[]) =>
      getReviewSummaryForLocation(...a),
  },
}));
vi.mock("../models/PracticeRankingModel", () => ({
  PracticeRankingModel: {
    findLatestCompletedRankingMetrics: (...a: unknown[]) =>
      findLatestCompletedRankingMetrics(...a),
  },
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
  default: {
    info: vi.fn(),
    warn: (...a: unknown[]) => loggerWarn(...a),
    error: vi.fn(),
  },
}));
// Pin the Maps trust window. The real constant tracks a deploy date and will be
// bumped; these tests assert the CLAMPING BEHAVIOUR, so they must not break the
// day someone changes that date.
vi.mock("../config/patientJourney", () => ({
  MAPS_IMPRESSIONS_TRUSTED_FROM: "2026-01-01",
}));

import {
  readImpressions,
  readRank,
  readLeads,
  readReviews,
} from "../controllers/patient-journey/feature-services/stageReaders";

const PROJECT = "proj-1";
const START = "2026-06-01";
const END = "2026-06-30";
const ORG = 7;
const LOCATION = 42;


// Build a daily google_data_store row as the MODEL now returns it: date_start =
// dayBefore, date_end = the later day, and the two `visibility` objects
// projected out of gbp_data by the query (`#> '{yesterday,visibility}'`) rather
// than the whole blob. The impressions gate is WHOLE-PRACTICE, so a row carries
// its own location_id (and an id, used only to prove deterministic ordering) —
// both default to a single location for the simple cases.
function visibility(maps: [number, number]) {
  return {
    impressions_maps_desktop: maps[0],
    impressions_maps_mobile: maps[1],
  };
}

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
    date_start: dateStart,
    date_end: dateEnd,
    day_before_visibility: visibility(dayBeforeMaps),
    yesterday_visibility: visibility(yesterdayMaps),
  };
}

// A row where one or both sides carried NO stored visibility payload. The
// projection returns SQL NULL for those, which is what "missing" looks like to
// the reader — as opposed to a present object full of zeros.
function partialRow(
  dateStart: string,
  dateEnd: string,
  sides: {
    dayBefore?: [number, number];
    yesterday?: [number, number];
  },
  locationId: number = LOCATION,
  id: number = 1,
) {
  return {
    id,
    organization_id: ORG,
    location_id: locationId,
    date_start: dateStart,
    date_end: dateEnd,
    day_before_visibility: sides.dayBefore ? visibility(sides.dayBefore) : null,
    yesterday_visibility: sides.yesterday ? visibility(sides.yesterday) : null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findByProjectAndDateRange.mockResolvedValue([]);
  findDailyByOrgAndDateRange.mockResolvedValue([]);
  // Default: the single test location is a mapped GBP listing.
  findSelectedGbpForSync.mockResolvedValue([{ location_id: LOCATION }]);
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

  it("counts Maps once per mapped location — unmapped siblings never inflate (C1)", async () => {
    findByProjectAndDateRange.mockResolvedValue([gscDay(100)]);
    // Three locations, same day. Location 42 is mapped (50 Maps). 43 and 44 are
    // UNMAPPED and carry the fabricated account-blob copy of 42's Maps data.
    findDailyByOrgAndDateRange.mockResolvedValue([
      dailyRow(START, END, [0, 0], [30, 20], 42, 1),
      dailyRow(START, END, [0, 0], [30, 20], 43, 2),
      dailyRow(START, END, [0, 0], [30, 20], 44, 3),
    ]);
    // Only location 42 has a mapped GBP listing.
    findSelectedGbpForSync.mockResolvedValue([{ location_id: 42 }]);

    const read = await readImpressions(PROJECT, START, END, true, ORG);

    // 100 organic + 50 Maps (location 42 only) = 150, NOT 100 + 150 (3x).
    expect(read.value).toBe(150);
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
    findSelectedGbpForSync.mockResolvedValue([
      { location_id: 42 },
      { location_id: 43 },
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
    findSelectedGbpForSync.mockResolvedValue([
      { location_id: 42 },
      { location_id: 43 },
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
      // dayBefore (06-09) has NO stored visibility → not a measured day.
      // yesterday (06-10) is a real measured value.
      partialRow("2026-06-09", "2026-06-10", { yesterday: [30, 20] }, LOCATION, 1),
      // A wholly empty payload contributes nothing at all.
      partialRow("2026-06-11", "2026-06-12", {}, LOCATION, 2),
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
      dailyRow(
        "2026-06-29 00:00:00",
        "2026-06-30 00:00:00",
        [10, 0],
        [30, 20],
      ),
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
      partialRow("2026-06-09", "2026-06-10", { yesterday: [5, 0] }, 43, 2),
    ]);
    findSelectedGbpForSync.mockResolvedValue([
      { location_id: 42 },
      { location_id: 43 },
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

  // ── Trust window ────────────────────────────────────────────────────────────
  // Rows written before the unmapped-location fix can be fabricated copies of a
  // sibling's listing, and the mapped-location gate judges PAST rows by PRESENT
  // mapping — so it decays the moment an unmapped location gets mapped. The
  // window is clamped instead. (A window entirely AFTER the trust date is the
  // default for every test above: START is passed through unclamped, asserted by
  // the "org-scoped" test's toHaveBeenCalledWith(ORG, START, END).)

  it("drops the Maps term for a window entirely before the trust date, without querying", async () => {
    findByProjectAndDateRange.mockResolvedValue([gscDay(100)]);

    const read = await readImpressions(
      PROJECT,
      "2025-11-01",
      "2025-11-30",
      false,
      ORG,
    );

    expect(read.value).toBe(100); // organic only
    expect(read.metadata?.maps).toBeUndefined();
    // The clamp short-circuits before the DB is touched — old months cost zero.
    expect(findDailyByOrgAndDateRange).not.toHaveBeenCalled();
  });

  it("clamps a straddling window to the trust date and drops the pre-trust days", async () => {
    findByProjectAndDateRange.mockResolvedValue([gscDay(100)]);
    findDailyByOrgAndDateRange.mockResolvedValue([
      // This row spans the boundary: dayBefore (12-31) is pre-trust, yesterday
      // (01-01) is not. Only the trusted side may count.
      dailyRow("2025-12-31", "2026-01-01", [40, 10], [30, 20]),
    ]);

    const read = await readImpressions(
      PROJECT,
      "2025-12-15",
      "2026-01-15",
      false,
      ORG,
    );

    // Queried from the trust date, not from the caller's startDate.
    expect(findDailyByOrgAndDateRange).toHaveBeenCalledWith(
      ORG,
      "2026-01-01",
      "2026-01-15",
    );
    // Only 01-01 (50) counts; the pre-trust 12-31 side (50) is dropped.
    expect(read.value).toBe(150);
    expect(read.metadata?.maps).toEqual({ impressions: 50, days: 1 });
  });
});
// ── RANK ────────────────────────────────────────────────────────────────────
//
// The raw row shape is exactly what PracticeRankingModel
// .findLatestCompletedRankingMetrics selects:
//   rank_position, search_position, search_status, rank_score,
//   total_competitors, ranking_factors.
//
// Two fabrication traps are baked into EVERY row on purpose:
//   • rank_position: 1        → the Practice-Health default "#1" (a fake win
//                               when the practice isn't matched). readRank must
//                               NEVER surface this — it reads search_position.
//   • total_competitors: 5    → the CURATED competitor set. It must never reach
//                               the read at all: pairing it with a SerpApi Maps
//                               search_position rendered the incoherent
//                               "#15 of 5 locally". `RankRead` no longer carries
//                               a denominator field, so the pairing is now
//                               unrepresentable rather than merely unreached.
interface RankRow {
  rank_position: number | null;
  search_position: number | null;
  search_status: SearchPositionStatus | null;
  rank_score: number | null;
  total_competitors: number | null;
  ranking_factors: Record<string, unknown> | null;
}

interface RankFixture {
  name: string;
  /** Plain-English description of the real-world situation. */
  description: string;
  /** Raw row from findLatestCompletedRankingMetrics, or null = never ran. */
  row: RankRow | null;
  /** The honest RankRead the reader MUST produce. */
  expectedRead: RankRead;
}

const rankRow = (partial: Partial<RankRow>): RankRow => ({
  rank_position: 1, // fabrication trap — the fake "#1" default
  search_position: null,
  search_status: null,
  rank_score: 62,
  total_competitors: 5, // fabrication trap — curated-set denominator
  ranking_factors: {},
  ...partial,
});

const RANK_FIXTURES: RankFixture[] = [
  {
    name: "has-position",
    description:
      "SerpApi returned a real local Maps position (#3). Reader shows it, " +
      "ignores the fake rank_position:1 and the curated total_competitors:5.",
    row: rankRow({ search_position: 3, search_status: "ok" }),
    expectedRead: { position: 3, available: true, notInTop20: false },
  },
  {
    name: "not_in_top_20",
    description:
      "SerpApi CONFIRMED the practice placed below the local Maps top-20 " +
      "(search_status=not_in_top_20, null position). This is the ONLY state " +
      'that may say "Not in the local top 20 yet".',
    row: rankRow({ search_position: null, search_status: "not_in_top_20" }),
    expectedRead: { position: null, available: false, notInTop20: true },
  },
  {
    name: "api_error",
    description:
      "The lookup FAILED (search_status=api_error, null position). Null here " +
      'means "couldn\'t measure" — NOT "outside top 20". Must degrade to an ' +
      "unavailable read, never a fabricated negative claim.",
    row: rankRow({ search_position: null, search_status: "api_error" }),
    expectedRead: { position: null, available: false, notInTop20: false },
  },
  {
    name: "bias_unavailable",
    description:
      "Geo-bias unavailable (search_status=bias_unavailable, null position). " +
      "Same class as api_error: unmeasured, not a negative. Must NOT read as " +
      '"not in top 20".',
    row: rankRow({ search_position: null, search_status: "bias_unavailable" }),
    expectedRead: { position: null, available: false, notInTop20: false },
  },
  {
    name: "ok-but-null-position",
    description:
      "Adversarial edge: status=ok but search_position is null (a broken/half " +
      "row). notInTop20 is gated on the status string ONLY, so this must still " +
      "degrade to an unavailable read — never fabricate a placement.",
    row: rankRow({ search_position: null, search_status: "ok" }),
    expectedRead: { position: null, available: false, notInTop20: false },
  },
  {
    name: "never-ran",
    description:
      "No completed ranking row exists for this location. Reader returns the " +
      "unavailable read with notInTop20 false, so the card prompts a run.",
    row: null,
    expectedRead: { position: null, available: false, notInTop20: false },
  },
];

describe("readRank — honest read for every rank state", () => {
  for (const fx of RANK_FIXTURES) {
    it(`${fx.name}: ${fx.description}`, async () => {
      findLatestCompletedRankingMetrics.mockResolvedValue(fx.row);

      const read = await readRank(ORG, LOCATION);

      expect(read).toEqual(fx.expectedRead);
    });
  }

  it("degrades to an unavailable read when the ranking lookup throws", async () => {
    findLatestCompletedRankingMetrics.mockRejectedValue(new Error("db down"));

    const read = await readRank(ORG, LOCATION);

    expect(read).toEqual({
      position: null,
      available: false,
      notInTop20: false,
    });
    expect(loggerWarn).toHaveBeenCalled();
  });
});

describe("readRank — a null is never a definite negative claim", () => {
  const UNMEASURED = [
    "api_error",
    "bias_unavailable",
    "ok-but-null-position",
    "never-ran",
  ];

  it("'couldn't measure' states leave notInTop20 false", async () => {
    for (const fx of RANK_FIXTURES.filter((f) => UNMEASURED.includes(f.name))) {
      findLatestCompletedRankingMetrics.mockResolvedValue(fx.row);

      const read = await readRank(ORG, LOCATION);

      expect(read.notInTop20).toBe(false);
      expect(read.available).toBe(false);
    }
  });

  it("ONLY a confirmed not_in_top_20 status sets notInTop20", async () => {
    const confirmed = RANK_FIXTURES.find((f) => f.name === "not_in_top_20")!;
    findLatestCompletedRankingMetrics.mockResolvedValue(confirmed.row);

    const read = await readRank(ORG, LOCATION);

    expect(read.notInTop20).toBe(true);
  });
});

// ── LEADS ───────────────────────────────────────────────────────────────────
//
// readLeads(projectId, monthStart, monthEnd) queries
// FormSubmissionModel.getMonthlyStatsByProject and keys the current month by
// `${UTC year}-${MM}`. Fixtures fix the report month to June 2026.
//
// The honest reader outcomes:
//   • no row + zero history       → no_data (connected-but-empty)
//   • row for the month           → its verified count (real value / real zero)
//   • no row but history exists   → value 0, available true (a real zero)
//
// The fourth outcome, `not_connected` (no website project at all), is set
// UPSTREAM in PatientJourneyService and the reader is never invoked, so it is
// not representable here and is covered by the service test.
const LEADS_MONTH_KEY = "2026-06";
const LEADS_MONTH_START = new Date(Date.UTC(2026, 5, 1)); // June 1 2026 UTC
const LEADS_MONTH_END = new Date(Date.UTC(2026, 5, 30)); // June 30 2026 UTC

interface LeadsStatRow {
  month: string;
  total: number | string;
  verified: number | string;
  unread: number | string;
  flagged: number | string;
  blocked: number | string;
}

interface LeadsFixture {
  name: string;
  description: string;
  stats: LeadsStatRow[];
  expectedRead: {
    value: number | null;
    available: boolean;
    unavailableReason?: StageUnavailableReason;
  };
}

const statRow = (
  month: string,
  verified: number,
  total = verified,
): LeadsStatRow => ({
  month,
  total,
  verified,
  unread: 0,
  flagged: 0,
  blocked: 0,
});

const LEADS_FIXTURES: LeadsFixture[] = [
  {
    name: "no_data",
    description:
      "Project exists but the form has NEVER received a submission (empty " +
      "stats). Connected-but-empty reads as no_data — NOT not_connected, and " +
      "NOT a definite zero.",
    stats: [],
    expectedRead: {
      value: null,
      available: false,
      unavailableReason: "no_data",
    },
  },
  {
    name: "real-zero-this-month",
    description:
      "A month row exists but every submission was a Newsletter Signup, so " +
      "verified = 0. That's a REAL zero (available true), not an empty state.",
    stats: [statRow(LEADS_MONTH_KEY, 0, 0)],
    expectedRead: { value: 0, available: true },
  },
  {
    name: "real-zero-history-elsewhere",
    description:
      "The form has history in prior months but no row for the report month. " +
      "stats.length > 0 → a real zero for June (available true), value 0.",
    stats: [statRow("2026-05", 6, 8)],
    expectedRead: { value: 0, available: true },
  },
  {
    name: "real-value",
    description:
      "12 verified (non-flagged, non-newsletter) submissions this month. Real " +
      "value, available true.",
    stats: [statRow(LEADS_MONTH_KEY, 12, 14)],
    expectedRead: { value: 12, available: true },
  },
];

describe("readLeads — honest read for every leads state", () => {
  for (const fx of LEADS_FIXTURES) {
    it(`${fx.name}: ${fx.description}`, async () => {
      getMonthlyStatsByProject.mockResolvedValue(fx.stats);

      const read = await readLeads(PROJECT, LEADS_MONTH_START, LEADS_MONTH_END);

      expect(read.value).toBe(fx.expectedRead.value);
      expect(read.available).toBe(fx.expectedRead.available);
      expect(read.unavailableReason).toBe(fx.expectedRead.unavailableReason);
    });
  }

  it("an empty month never reads as a definite zero", async () => {
    const noData = LEADS_FIXTURES.find((f) => f.name === "no_data")!;
    getMonthlyStatsByProject.mockResolvedValue(noData.stats);

    const read = await readLeads(PROJECT, LEADS_MONTH_START, LEADS_MONTH_END);

    expect(read.value).toBeNull();
    expect(read.available).toBe(false);
  });
});

// ── REVIEWS ─────────────────────────────────────────────────────────────────
//
// readReviews(locationId, monthStart, monthEnd) returns
// ReviewModel.getReviewSummaryForLocation plus available = summary.count !==
// null. The model returns nulls for rating/count when the location has no
// stored reviews. The reader is a pass-through, so these cases pin the
// pass-through and the availability gate — the count-weighting itself lives in
// the model's SQL and is not exercised here.
interface ReviewsFixture {
  name: string;
  description: string;
  summary: ReviewSummaryForLocation;
  expectedRead: ReviewsRead;
}

const REVIEWS_FIXTURES: ReviewsFixture[] = [
  {
    name: "none",
    description:
      "Location has no stored reviews. Model returns null rating/count " +
      "(newThisMonth still 0), so the read is unavailable.",
    summary: { rating: null, count: null, newThisMonth: 0, replyRatePct: null },
    expectedRead: {
      rating: null,
      count: null,
      newThisMonth: 0,
      replyRatePct: null,
      available: false,
    },
  },
  {
    name: "some",
    description:
      "Single-location practice with 210 stored reviews at 4.8★, 5 new this " +
      "month, 92% replied.",
    summary: { rating: 4.8, count: 210, newThisMonth: 5, replyRatePct: 92 },
    expectedRead: {
      rating: 4.8,
      count: 210,
      newThisMonth: 5,
      replyRatePct: 92,
      available: true,
    },
  },
  {
    name: "weighted-multi-location",
    description:
      "Blended across two locations: 200 reviews @ 5.0 + 10 @ 3.0. The model " +
      "returns the count-weighted mean 4.9 (AVG over all 210 rows), never the " +
      "naive per-location average 4.0. The reader must pass 4.9 through " +
      "unchanged rather than re-deriving anything.",
    summary: { rating: 4.9, count: 210, newThisMonth: 3, replyRatePct: 64 },
    expectedRead: {
      rating: 4.9,
      count: 210,
      newThisMonth: 3,
      replyRatePct: 64,
      available: true,
    },
  },
];

describe("readReviews — honest read for every reviews state", () => {
  for (const fx of REVIEWS_FIXTURES) {
    it(`${fx.name}: ${fx.description}`, async () => {
      getReviewSummaryForLocation.mockResolvedValue(fx.summary);

      const read = await readReviews(
        LOCATION,
        LEADS_MONTH_START,
        LEADS_MONTH_END,
      );

      expect(read).toEqual(fx.expectedRead);
    });
  }
});
