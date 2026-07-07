/**
 * Patient-Journey engine — synthetic honesty fixtures.
 *
 * Purpose: give the harness (honesty-invariants.test.ts) a fixed set of the
 * real edge cases that bit Slice 1 three times — the "one null, several
 * meanings" class that tsc / compile-green can never catch. Each fixture pins
 * (1) the exact DB-row/summary shape a reader receives, (2) the honest reader
 * output that shape MUST produce, and (3) the honest customer-facing copy the
 * frontend then renders. All values are invented (§20.4) — no tenant data.
 *
 * GROUND-TRUTH CITATIONS (every state below is grounded in code, not guessed):
 *   • Rank status union .......... src/models/PracticeRankingModel.ts:5-9
 *   • readRank logic ............. src/controllers/patient-journey/feature-services/stageReaders.ts:390-425
 *   • readLeads logic ............ ...stageReaders.ts:311-347
 *   • readReviews logic .......... ...stageReaders.ts:436-454
 *   • leads not_connected (svc) .. ...PatientJourneyService.ts:148-152
 *   • getMonthlyStatsByProject ... src/models/website-builder/FormSubmissionModel.ts:376-410
 *   • getReviewSummaryForLocation  src/models/website-builder/ReviewModel.ts:420-460
 *   • rank/review card copy ...... frontend/src/components/dashboard/patient-journey/PatientJourneyContextCards.tsx:54-83
 *   • stage empty-state copy ..... frontend/src/components/dashboard/patient-journey/patientJourney.utils.ts:31-45
 *
 * How to extend: add a new object to the relevant array with its expected
 * reader output + expected copy. The harness iterates these arrays, so a new
 * fixture is automatically exercised by every invariant.
 */

import type {
  RankRead,
  ReviewsRead,
} from "../../controllers/patient-journey/feature-services/stageReaders";
import type { StageUnavailableReason } from "../../controllers/patient-journey/feature-utils/types";
import type { SearchPositionStatus } from "../../models/PracticeRankingModel";
import type { ReviewSummaryForLocation } from "../../models/website-builder/ReviewModel";

// ── RANK ──────────────────────────────────────────────────────────────────
//
// The raw row shape is exactly what PracticeRankingModel
// .findLatestCompletedRankingMetrics selects (stageReaders.ts:392):
//   rank_position, search_position, search_status, rank_score,
//   total_competitors, ranking_factors.
//
// The two fabrication traps are baked into EVERY row on purpose:
//   • rank_position: 1        → the Practice-Health default "#1" (a fake win
//                               when the practice isn't matched). readRank must
//                               NEVER surface this — it reads search_position.
//   • total_competitors: 5    → the CURATED competitor set. It must never pair
//                               with search_position to render "#N of 5".
export interface RankRow {
  rank_position: number | null;
  search_position: number | null;
  search_status: SearchPositionStatus | null;
  rank_score: number | null;
  total_competitors: number | null;
  ranking_factors: Record<string, unknown> | null;
}

export interface RankFixture {
  name: string;
  /** Plain-English description of the real-world situation. */
  description: string;
  /** Raw row from findLatestCompletedRankingMetrics, or null = never ran. */
  row: RankRow | null;
  /** The honest RankRead the reader MUST produce. */
  expectedRead: RankRead;
  /** The honest stat string the card MUST show (ContextCards.tsx:54-61). */
  expectedStat: string;
  /** The honest sub-line the card MUST show (ContextCards.tsx:81-83). */
  expectedLines: string[];
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

export const RANK_FIXTURES: RankFixture[] = [
  {
    name: "has-position",
    description:
      "SerpApi returned a real local Maps position (#3). Reader shows it, " +
      "ignores the fake rank_position:1 and the curated total_competitors:5.",
    row: rankRow({ search_position: 3, search_status: "ok" }),
    expectedRead: {
      position: 3,
      totalCompetitors: null, // never paired — no "of 5"
      available: true,
      notInTop20: false,
    },
    expectedStat: "#3 locally",
    expectedLines: ["Your local search standing"],
  },
  {
    name: "not_in_top_20",
    description:
      "SerpApi CONFIRMED the practice placed below the local Maps top-20 " +
      "(search_status=not_in_top_20, null position). This is the ONLY state " +
      'that may say "Not in the local top 20 yet".',
    row: rankRow({ search_position: null, search_status: "not_in_top_20" }),
    expectedRead: {
      position: null,
      totalCompetitors: null,
      available: false,
      notInTop20: true,
    },
    expectedStat: "Not in the local top 20 yet",
    expectedLines: ["Your local search standing"],
  },
  {
    name: "api_error",
    description:
      "The lookup FAILED (search_status=api_error, null position). Null here " +
      'means "couldn\'t measure" — NOT "outside top 20". Must degrade to ' +
      '"Rank not available yet", never a fabricated negative claim.',
    row: rankRow({ search_position: null, search_status: "api_error" }),
    expectedRead: {
      position: null,
      totalCompetitors: null,
      available: false,
      notInTop20: false,
    },
    expectedStat: "Rank not available yet",
    expectedLines: ["Run a ranking to see where you stand"],
  },
  {
    name: "bias_unavailable",
    description:
      "Geo-bias unavailable (search_status=bias_unavailable, null position). " +
      "Same class as api_error: unmeasured, not a negative. Must NOT read as " +
      '"not in top 20".',
    row: rankRow({ search_position: null, search_status: "bias_unavailable" }),
    expectedRead: {
      position: null,
      totalCompetitors: null,
      available: false,
      notInTop20: false,
    },
    expectedStat: "Rank not available yet",
    expectedLines: ["Run a ranking to see where you stand"],
  },
  {
    name: "ok-but-null-position",
    description:
      "Adversarial edge: status=ok but search_position is null (a broken/half " +
      "row). notInTop20 is gated on the status string ONLY, so this must still " +
      'degrade to "Rank not available yet" — never fabricate a placement.',
    row: rankRow({ search_position: null, search_status: "ok" }),
    expectedRead: {
      position: null,
      totalCompetitors: null,
      available: false,
      notInTop20: false,
    },
    expectedStat: "Rank not available yet",
    expectedLines: ["Run a ranking to see where you stand"],
  },
  {
    name: "never-ran",
    description:
      "No completed ranking row exists for this location. Reader returns the " +
      'unavailable read; card prompts "Run a ranking".',
    row: null,
    expectedRead: {
      position: null,
      totalCompetitors: null,
      available: false,
      notInTop20: false,
    },
    expectedStat: "Rank not available yet",
    expectedLines: ["Run a ranking to see where you stand"],
  },
];

// ── LEADS ─────────────────────────────────────────────────────────────────
//
// readLeads(projectId, monthStart, monthEnd) queries
// FormSubmissionModel.getMonthlyStatsByProject (stageReaders.ts:318) and keys
// the current month by `${UTC year}-${MM}` (stageReaders.ts:319). Fixtures fix
// the report month to June 2026 (monthKey "2026-06").
//
// The four honest outcomes (stageReaders.ts:321-342):
//   • no row + zero history       → no_data     (connected-but-empty)
//   • row for the month           → its verified count (real value / real zero)
//   • no row but history exists   → value 0, available true (real zero)
//   • NO PROJECT at all           → not_connected — set UPSTREAM in the service
//                                    (PatientJourneyService.ts:148-152), the
//                                    reader is never called.
export const LEADS_MONTH_KEY = "2026-06";
export const LEADS_MONTH_START = new Date(Date.UTC(2026, 5, 1)); // June 1 2026 UTC
export const LEADS_MONTH_END = new Date(Date.UTC(2026, 5, 30)); // June 30 2026 UTC

export type LeadsStatRow = {
  month: string;
  total: number | string;
  verified: number | string;
  unread: number | string;
  flagged: number | string;
  blocked: number | string;
};

/** The read the reader/service produces, minus asOf/metadata (not asserted). */
export interface LeadsExpectedRead {
  value: number | null;
  available: boolean;
  unavailableReason?: StageUnavailableReason;
}

export interface LeadsFixture {
  name: string;
  description: string;
  /**
   * getMonthlyStatsByProject return value, OR the sentinel "NO_PROJECT" for the
   * service-level not_connected path (reader is not invoked in that case).
   */
  stats: LeadsStatRow[] | "NO_PROJECT";
  expectedRead: LeadsExpectedRead;
  /**
   * The honest copy. For available reads this is the formatted count
   * (patientJourney.utils.ts formatStageValue). For unavailable reads it is the
   * empty-state copy (patientJourney.utils.ts:31-45).
   */
  expectedCopy: string;
}

const statRow = (month: string, verified: number, total = verified): LeadsStatRow => ({
  month,
  total,
  verified,
  unread: 0,
  flagged: 0,
  blocked: 0,
});

export const LEADS_FIXTURES: LeadsFixture[] = [
  {
    name: "not_connected",
    description:
      "No website project for the org. The service short-circuits to a " +
      "not_connected read BEFORE readLeads runs (PatientJourneyService.ts:" +
      '148-152). Card shows "Not connected yet", never a zero.',
    stats: "NO_PROJECT",
    expectedRead: {
      value: null,
      available: false,
      unavailableReason: "not_connected",
    },
    expectedCopy: "Not connected yet",
  },
  {
    name: "no_data",
    description:
      "Project exists but the form has NEVER received a submission (empty " +
      'stats). Connected-but-empty → no_data → "No leads yet this month" — ' +
      'NOT "not connected".',
    stats: [],
    expectedRead: { value: null, available: false, unavailableReason: "no_data" },
    expectedCopy: "No leads yet this month",
  },
  {
    name: "real-zero-this-month",
    description:
      "A month row exists but every submission was a Newsletter Signup, so " +
      "verified = 0. That's a REAL zero (available true), rendered as the " +
      'number "0" — not an empty state.',
    stats: [statRow(LEADS_MONTH_KEY, 0, 0)],
    expectedRead: { value: 0, available: true },
    expectedCopy: "0",
  },
  {
    name: "real-zero-history-elsewhere",
    description:
      "The form has history in prior months but no row for the report month. " +
      "stats.length > 0 → a real zero for June (available true), value 0.",
    stats: [statRow("2026-05", 6, 8)],
    expectedRead: { value: 0, available: true },
    expectedCopy: "0",
  },
  {
    name: "real-value",
    description:
      "12 verified (non-flagged, non-newsletter) submissions this month. Real " +
      "value, available true.",
    stats: [statRow(LEADS_MONTH_KEY, 12, 14)],
    expectedRead: { value: 12, available: true },
    expectedCopy: "12",
  },
];

// ── REVIEWS ───────────────────────────────────────────────────────────────
//
// readReviews(locationId, monthStart, monthEnd) returns
// ReviewModel.getReviewSummaryForLocation (stageReaders.ts:442) plus
// available = summary.count !== null (stageReaders.ts:448). The model returns
// nulls for rating/count when the location has no stored reviews
// (ReviewModel.ts:446-448); rating is the count-weighted AVG(stars) over all
// visible rows (ReviewModel.ts:437), so it is inherently weighted, never the
// naive mean of per-location ratings.
export interface ReviewsFixture {
  name: string;
  description: string;
  /** What getReviewSummaryForLocation returns. */
  summary: ReviewSummaryForLocation;
  expectedRead: ReviewsRead;
  /** Honest stat string (ContextCards.tsx:63-66). */
  expectedStat: string;
  /** Honest sub-lines (ContextCards.tsx:68-79). */
  expectedLines: string[];
}

export const REVIEWS_FIXTURES: ReviewsFixture[] = [
  {
    name: "none",
    description:
      "Location has no stored reviews. Model returns null rating/count " +
      '(newThisMonth still 0). available false → "Reviews not connected yet".',
    summary: { rating: null, count: null, newThisMonth: 0, replyRatePct: null },
    expectedRead: {
      rating: null,
      count: null,
      newThisMonth: 0,
      replyRatePct: null,
      available: false,
    },
    expectedStat: "Reviews not connected yet",
    expectedLines: ["Connect your Google Business Profile to track reviews"],
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
    expectedStat: "4.8★ · 210 reviews",
    expectedLines: ["5 new reviews this month", "Replied to 92%"],
  },
  {
    name: "weighted-multi-location",
    description:
      "Blended across two locations: 200 reviews @ 5.0 + 10 @ 3.0. The honest " +
      "rating is the COUNT-WEIGHTED mean 4.9 (AVG over all 210 rows), never " +
      "the naive per-location average 4.0. Guards against a fabricated simple " +
      "mean.",
    summary: { rating: 4.9, count: 210, newThisMonth: 3, replyRatePct: 64 },
    expectedRead: {
      rating: 4.9,
      count: 210,
      newThisMonth: 3,
      replyRatePct: 64,
      available: true,
    },
    expectedStat: "4.9★ · 210 reviews",
    expectedLines: ["3 new reviews this month", "Replied to 64%"],
    // The trap this fixture guards: a naive simple mean of {5.0, 3.0} = 4.0.
  },
];

/** The dishonest string the weighted-multi-location fixture must NEVER render. */
export const REVIEWS_NAIVE_MEAN_TRAP = "4.0★ · 210 reviews";
