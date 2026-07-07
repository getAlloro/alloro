/**
 * Patient-Journey engine — HONESTY INVARIANTS harness.
 *
 * WHAT THIS IS
 *   The semantic net tsc/compile-green can't cast. It runs the REAL per-stage
 *   readers (readRank / readLeads / readReviews) against the synthetic fixtures
 *   in ./fixtures.ts — the exact "one null, several meanings" edge cases that
 *   bit Slice 1 three times — and asserts the honesty invariants the fixes
 *   established. A reader change that re-introduces a fabricated number, or
 *   collapses a "couldn't measure" null into a definite negative claim, fails
 *   here even though it type-checks.
 *
 * HOW IT RUNS (Option B — mock the data layer, matching the repo convention in
 * src/__tests__/patient-journey.service.test.ts): the three models the readers
 * touch are mocked, so the readers run with NO live Postgres and NO network.
 * We drive real reader logic; only the DB boundary is stubbed.
 *
 * THE INVARIANTS GUARDED (see each describe block):
 *   (a) no fabricated number ever surfaces — no fake "#1", no "N of M" pairing
 *       two ranking universes, no naive simple-mean rating.
 *   (b) every empty state renders the correct HONEST copy.
 *   (c) a null never becomes a definite negative claim ("couldn't measure" is
 *       not "you're not in the top 20").
 *   (d) notInTop20 is true ONLY for search_status === "not_in_top_20".
 *
 * Synthetic only (§20.4): all ids/rows/summaries are invented in ./fixtures.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── DB-boundary seams (the only things stubbed) ─────────────────────────────
const findLatestCompletedRankingMetrics = vi.fn();
const getMonthlyStatsByProject = vi.fn();
const getReviewSummaryForLocation = vi.fn();

vi.mock("../../models/PracticeRankingModel", () => ({
  PracticeRankingModel: {
    findLatestCompletedRankingMetrics: (...a: unknown[]) =>
      findLatestCompletedRankingMetrics(...a),
  },
}));
vi.mock("../../models/website-builder/FormSubmissionModel", () => ({
  FormSubmissionModel: {
    getMonthlyStatsByProject: (...a: unknown[]) => getMonthlyStatsByProject(...a),
  },
}));
vi.mock("../../models/website-builder/ReviewModel", () => ({
  ReviewModel: {
    getReviewSummaryForLocation: (...a: unknown[]) =>
      getReviewSummaryForLocation(...a),
  },
}));

// Keep the Pino logger inert (no transport noise on the reader warn paths).
vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  readRank,
  readLeads,
  readReviews,
} from "../../controllers/patient-journey/feature-services/stageReaders";
import {
  renderRankStat,
  renderRankLines,
  renderReviewStat,
  renderReviewLines,
  renderStageEmptyState,
  renderStageValue,
} from "./contextCopy";
import {
  RANK_FIXTURES,
  LEADS_FIXTURES,
  REVIEWS_FIXTURES,
  REVIEWS_NAIVE_MEAN_TRAP,
  LEADS_MONTH_START,
  LEADS_MONTH_END,
} from "./fixtures";

const ORG = 7;
const LOCATION = 42;
const PROJECT = "proj-1";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Reader-truth layer: real readers → honest reads ─────────────────────────

describe("readRank — honest read for every rank state", () => {
  for (const fx of RANK_FIXTURES) {
    it(`${fx.name}: ${fx.description}`, async () => {
      findLatestCompletedRankingMetrics.mockResolvedValue(fx.row);
      const read = await readRank(ORG, LOCATION);
      expect(read).toEqual(fx.expectedRead);
    });
  }
});

describe("readLeads — honest read for every leads state", () => {
  for (const fx of LEADS_FIXTURES) {
    if (fx.stats === "NO_PROJECT") continue; // service-level, asserted below
    it(`${fx.name}: ${fx.description}`, async () => {
      getMonthlyStatsByProject.mockResolvedValue(fx.stats);
      const read = await readLeads(PROJECT, LEADS_MONTH_START, LEADS_MONTH_END);
      expect(read.value).toBe(fx.expectedRead.value);
      expect(read.available).toBe(fx.expectedRead.available);
      expect(read.unavailableReason).toBe(fx.expectedRead.unavailableReason);
    });
  }
});

describe("readReviews — honest read for every reviews state", () => {
  for (const fx of REVIEWS_FIXTURES) {
    it(`${fx.name}: ${fx.description}`, async () => {
      getReviewSummaryForLocation.mockResolvedValue(fx.summary);
      const read = await readReviews(LOCATION, LEADS_MONTH_START, LEADS_MONTH_END);
      expect(read).toEqual(fx.expectedRead);
    });
  }
});

// ── (a) No fabricated number ever surfaces ──────────────────────────────────

describe("invariant (a): no fabricated number surfaces", () => {
  it("rank never pairs a Maps position with the curated competitor set (no '#N of M')", async () => {
    for (const fx of RANK_FIXTURES) {
      findLatestCompletedRankingMetrics.mockResolvedValue(fx.row);
      const read = await readRank(ORG, LOCATION);
      // totalCompetitors is deliberately dropped — the two universes never pair.
      expect(read.totalCompetitors).toBeNull();
      expect(renderRankStat(read)).not.toMatch(/ of \d+ /);
    }
  });

  it("rank never surfaces the fake Practice-Health '#1' default", async () => {
    for (const fx of RANK_FIXTURES) {
      // every fixture row carries the rank_position:1 trap
      findLatestCompletedRankingMetrics.mockResolvedValue(fx.row);
      const read = await readRank(ORG, LOCATION);
      const stat = renderRankStat(read);
      // The only way "#1" may appear is a genuine search_position === 1.
      if (fx.row?.search_position !== 1) {
        expect(stat).not.toBe("#1 locally");
        expect(stat).not.toMatch(/^#1\b/);
      }
    }
  });

  it("a null position never renders as any '#N' number", async () => {
    for (const fx of RANK_FIXTURES.filter((f) => f.expectedRead.position === null)) {
      findLatestCompletedRankingMetrics.mockResolvedValue(fx.row);
      const read = await readRank(ORG, LOCATION);
      expect(renderRankStat(read)).not.toMatch(/#\d/);
    }
  });

  it("reviews rating is the count-weighted mean, never the naive simple average", async () => {
    const weighted = REVIEWS_FIXTURES.find((f) => f.name === "weighted-multi-location")!;
    getReviewSummaryForLocation.mockResolvedValue(weighted.summary);
    const read = await readReviews(LOCATION, LEADS_MONTH_START, LEADS_MONTH_END);
    expect(renderReviewStat(read)).not.toBe(REVIEWS_NAIVE_MEAN_TRAP);
    expect(renderReviewStat(read)).toBe(weighted.expectedStat);
  });
});

// ── (b) Every empty state renders the correct honest copy ───────────────────

describe("invariant (b): honest empty-state copy", () => {
  it("rank card copy matches the honest expected string for every state", async () => {
    for (const fx of RANK_FIXTURES) {
      findLatestCompletedRankingMetrics.mockResolvedValue(fx.row);
      const read = await readRank(ORG, LOCATION);
      expect(renderRankStat(read)).toBe(fx.expectedStat);
      expect(renderRankLines(read)).toEqual(fx.expectedLines);
    }
  });

  it("leads copy matches the honest expected string for every state", async () => {
    for (const fx of LEADS_FIXTURES) {
      if (fx.stats === "NO_PROJECT") {
        // Service-level not_connected read (PatientJourneyService.ts:148-152):
        // the reader is bypassed; the empty-state copy is driven by the reason.
        expect(renderStageEmptyState("leads", fx.expectedRead.unavailableReason)).toBe(
          fx.expectedCopy,
        );
        continue;
      }
      getMonthlyStatsByProject.mockResolvedValue(fx.stats);
      const read = await readLeads(PROJECT, LEADS_MONTH_START, LEADS_MONTH_END);
      const copy = read.available
        ? renderStageValue(read.value)
        : renderStageEmptyState("leads", read.unavailableReason);
      expect(copy).toBe(fx.expectedCopy);
    }
  });

  it("reviews card copy matches the honest expected string for every state", async () => {
    for (const fx of REVIEWS_FIXTURES) {
      getReviewSummaryForLocation.mockResolvedValue(fx.summary);
      const read = await readReviews(LOCATION, LEADS_MONTH_START, LEADS_MONTH_END);
      expect(renderReviewStat(read)).toBe(fx.expectedStat);
      expect(renderReviewLines(read)).toEqual(fx.expectedLines);
    }
  });
});

// ── (c) A null never becomes a definite negative claim ──────────────────────

describe("invariant (c): a null is never a definite negative claim", () => {
  const UNMEASURED = ["api_error", "bias_unavailable", "ok-but-null-position", "never-ran"];

  it("'couldn't measure' states degrade to 'Rank not available yet', not 'top 20'", async () => {
    for (const fx of RANK_FIXTURES.filter((f) => UNMEASURED.includes(f.name))) {
      findLatestCompletedRankingMetrics.mockResolvedValue(fx.row);
      const read = await readRank(ORG, LOCATION);
      expect(read.notInTop20).toBe(false);
      expect(renderRankStat(read)).toBe("Rank not available yet");
      expect(renderRankStat(read)).not.toBe("Not in the local top 20 yet");
    }
  });

  it("ONLY a confirmed not_in_top_20 status may make the negative 'top 20' claim", async () => {
    const confirmed = RANK_FIXTURES.find((f) => f.name === "not_in_top_20")!;
    findLatestCompletedRankingMetrics.mockResolvedValue(confirmed.row);
    const read = await readRank(ORG, LOCATION);
    expect(read.notInTop20).toBe(true);
    expect(renderRankStat(read)).toBe("Not in the local top 20 yet");
  });

  it("an empty leads read never renders a fabricated zero-as-negative", async () => {
    // no_data must read as "No leads yet this month", not a definite "0 leads".
    const noData = LEADS_FIXTURES.find((f) => f.name === "no_data")!;
    getMonthlyStatsByProject.mockResolvedValue(noData.stats);
    const read = await readLeads(PROJECT, LEADS_MONTH_START, LEADS_MONTH_END);
    expect(read.value).toBeNull();
    expect(read.available).toBe(false);
    expect(renderStageEmptyState("leads", read.unavailableReason)).toBe(
      "No leads yet this month",
    );
  });
});

// ── (d) notInTop20 is true ONLY for search_status === "not_in_top_20" ───────

describe("invariant (d): notInTop20 gated strictly on the status string", () => {
  it("reader notInTop20 === (search_status === 'not_in_top_20') for every fixture", async () => {
    for (const fx of RANK_FIXTURES) {
      findLatestCompletedRankingMetrics.mockResolvedValue(fx.row);
      const read = await readRank(ORG, LOCATION);
      expect(read.notInTop20).toBe(fx.row?.search_status === "not_in_top_20");
    }
  });
});
