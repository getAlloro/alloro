/**
 * Patient Journey Insights — pure presentational helpers for the funnel surface.
 *
 * Port of the data-shaping logic from the validated mock
 * (~/Desktop/alloro-owner-dashboard/funnel-pipeline.html). No React, no DOM,
 * no data-fetching — formatting + small derivations only, kept here so the
 * component files stay under the §13.1 size tier.
 *
 * Spec: plans/06242026-patient-journey-insights/spec.html (T7)
 */

import type {
  PatientJourneyConversion,
  PatientJourneyStage,
  PatientJourneyStageKey,
} from "../../../types/patientJourney";

/** Visual role of a stage card within the pipeline. */
export type StageKind = "flow" | "leak" | "goal";

/**
 * Format a stage count for display. `null` (unavailable) renders as an em-dash
 * placeholder; the card's empty state carries the "not connected yet" copy.
 */
export function formatStageValue(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString();
}

/** Format optional revenue as compact currency (e.g. $184k, $2.1M). */
export function formatRevenue(value: number | null): string | null {
  if (value === null) return null;
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (value >= 1_000) {
    return `$${Math.round(value / 1_000)}k`;
  }
  return `$${value.toLocaleString()}`;
}

/** Format a conversion percentage (0–100). `null` => "—". */
export function formatPct(pct: number | null): string {
  if (pct === null) return "—";
  return `${Math.round(pct)}%`;
}

/** Format a percentage with one decimal only when it matters. */
export function formatPrecisePct(pct: number | null): string {
  if (pct === null) return "—";
  const rounded = Math.round(pct * 10) / 10;
  return `${rounded.toFixed(Number.isInteger(rounded) ? 0 : 1)}%`;
}

/** Format an ISO-ish "as of" date into a short, human "as of" caption. */
export function formatAsOf(asOf: string | null): string | null {
  if (!asOf) return null;
  const ts = new Date(asOf).getTime();
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Decide a stage's visual role. The last stage in funnel order is the goal
 * (dark card); the leak stage is emphasised amber; everything else is flow.
 */
export function resolveStageKind(
  index: number,
  total: number,
  isLeak: boolean,
): StageKind {
  if (index === total - 1) return "goal";
  if (isLeak) return "leak";
  return "flow";
}

const GATE_LABELS: Partial<Record<PatientJourneyStageKey, string>> = {
  market_demand: "Search Opportunity",
  impressions: "Google Visibility",
  visits: "Website Visitors",
  leads: "Website Leads",
  patients: "New Patients",
};

export function stageGateLabel(stage: PatientJourneyStage): string {
  return GATE_LABELS[stage.key] ?? stage.label;
}

export function stageGateSubtext(stage: PatientJourneyStage): string {
  switch (stage.key) {
    case "market_demand":
      return "Estimated monthly searches";
    case "impressions":
      return "Google search impressions";
    case "visits":
      return stage.metadata?.rybbit
        ? "Rybbit website visitors"
        : "Website visitors";
    case "leads":
      return "Verified submissions";
    case "patients":
      return "Booked patients";
    default:
      return stage.metaLabel;
  }
}

/**
 * Friendly arrow caption for a conversion, keyed by the stage it flows INTO.
 * The first connector asks the visibility question instead of showing a huge
 * opportunity-to-impression percentage.
 */
const STEP_CAPTIONS: Record<string, string> = {
  impressions: "How visible are you?",
  visits: "Clicked through",
  leads: "Converted",
  patients: "Became patients",
};
export function conversionCaption(toKey: string): string {
  return STEP_CAPTIONS[toKey] ?? "";
}

const STEP_HELP_TEXT: Record<string, string> = {
  impressions:
    "Estimate vs. impressions. One search can show you more than once.",
};
export function conversionHelpText(toKey: string): string | null {
  return STEP_HELP_TEXT[toKey] ?? null;
}

export function shouldShowConversionPct(toKey: string): boolean {
  return toKey !== "impressions";
}

/** Find the conversion that feeds INTO a stage key (its inbound step). */
export function conversionInto(
  conversions: PatientJourneyConversion[],
  toKey: PatientJourneyStageKey,
): PatientJourneyConversion | null {
  return conversions.find((c) => c.toKey === toKey) ?? null;
}

/**
 * Whether a shared website-traffic stage should be labelled "whole-practice".
 * Only true when the org is multi-location AND the stage is shared — for a
 * single-location practice the shared stages are exact.
 */
export function isWholePracticeStage(
  stage: PatientJourneyStage,
  isMultiLocation: boolean,
): boolean {
  return stage.shared && isMultiLocation && stage.metadata?.scope !== "organization";
}

/** Tooltip body for a stage — its source note, falling back to its source. */
export function stageTooltip(stage: PatientJourneyStage): string {
  return stage.note?.trim() || stage.source || "";
}
