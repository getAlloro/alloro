/**
 * Copy mirror — a faithful, node-runnable transcription of the customer-facing
 * strings the Patient-Journey frontend renders. The harness runs in the backend
 * vitest env (node, no jsdom, no React), so it cannot import the .tsx component
 * directly. These functions reproduce the render logic verbatim so the harness
 * can assert the EXACT honest string a customer sees.
 *
 * ⚠️ MAINTENANCE COUPLING (flagged): this file DUPLICATES render logic that
 * lives in the frontend. If either source below changes, update this mirror in
 * the SAME commit. The fixtures' expected-string literals are the independent
 * ground truth, so a drift here is caught as a fixture mismatch, not a silent
 * pass. Mirrored sources:
 *   • rank/review card copy → frontend/src/components/dashboard/patient-journey/PatientJourneyContextCards.tsx:54-83
 *   • stage empty-state copy → frontend/src/components/dashboard/patient-journey/patientJourney.utils.ts:31-45
 *   • stage value format     → ...patientJourney.utils.ts:65-68 (formatStageValue)
 *
 * The input types are imported from the backend contract (feature-utils/types)
 * so this mirror stays in lockstep with the response shape.
 */

import type {
  PatientJourneyRankContext,
  PatientJourneyReviewsContext,
  StageUnavailableReason,
} from "../../controllers/patient-journey/feature-utils/types";

/** Mirror of ContextCards.tsx:54-61 — the rank card's headline stat. */
export function renderRankStat(rank: PatientJourneyRankContext): string {
  return rank.available && rank.position !== null
    ? rank.totalCompetitors !== null
      ? `#${rank.position} of ${rank.totalCompetitors} locally`
      : `#${rank.position} locally`
    : rank.notInTop20
      ? "Not in the local top 20 yet"
      : "Rank not available yet";
}

/** Mirror of ContextCards.tsx:81-83 — the rank card's sub-line(s). */
export function renderRankLines(rank: PatientJourneyRankContext): string[] {
  return rank.available || rank.notInTop20
    ? ["Your local search standing"]
    : ["Run a ranking to see where you stand"];
}

/** Mirror of ContextCards.tsx:63-66 — the reviews card's headline stat. */
export function renderReviewStat(reviews: PatientJourneyReviewsContext): string {
  return reviews.available && reviews.rating !== null
    ? `${reviews.rating.toFixed(1)}★${
        reviews.count !== null ? ` · ${reviews.count} reviews` : ""
      }`
    : "Reviews not connected yet";
}

/** Mirror of ContextCards.tsx:68-79 — the reviews card's sub-line(s). */
export function renderReviewLines(
  reviews: PatientJourneyReviewsContext,
): string[] {
  const lines: string[] = [];
  if (reviews.available) {
    if (reviews.newThisMonth !== null) {
      lines.push(`${reviews.newThisMonth} new reviews this month`);
    }
    if (reviews.replyRatePct !== null) {
      lines.push(`Replied to ${Math.round(reviews.replyRatePct)}%`);
    }
  }
  if (lines.length === 0) {
    lines.push("Connect your Google Business Profile to track reviews");
  }
  return lines;
}

/**
 * Mirror of patientJourney.utils.ts:31-45 — the stage-card empty-state copy,
 * driven by the backend's unavailableReason. `stageKey` matters only for the
 * no_data branch (leads gets its own wording).
 */
export function renderStageEmptyState(
  stageKey: string,
  unavailableReason: StageUnavailableReason | undefined,
): string {
  switch (unavailableReason) {
    case "pending":
      return "Google data is still pending";
    case "no_data":
      return stageKey === "leads"
        ? "No leads yet this month"
        : "No Google data for this month";
    case "not_connected":
      return "Not connected yet";
    default:
      return "Not connected yet";
  }
}

/** Mirror of patientJourney.utils.ts:65-68 — a present stage value's display. */
export function renderStageValue(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString();
}
