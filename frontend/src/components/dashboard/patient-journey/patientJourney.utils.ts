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
  PatientJourney,
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
  return stage.shared && isMultiLocation;
}

/** Tooltip body for a stage — its source note, falling back to its source. */
export function stageTooltip(stage: PatientJourneyStage): string {
  return stage.note?.trim() || stage.source || "";
}

/**
 * Compute the screen subline ("N searches in → M booked. Only X% reach
 * revenue.") from the first and last stages, when both numbers are available.
 * Returns null when either end is missing so the caller can hide the line
 * rather than print a misleading zero.
 */
export function buildPipelineSubline(
  journey: PatientJourney,
): { entry: number; exit: number; throughputPct: number } | null {
  const stages = journey.stages;
  if (stages.length < 2) return null;
  const first = stages[0];
  const last = stages[stages.length - 1];
  if (
    first.value === null ||
    last.value === null ||
    first.value <= 0 ||
    last.value < 0
  ) {
    return null;
  }
  return {
    entry: first.value,
    exit: last.value,
    throughputPct: (last.value / first.value) * 100,
  };
}
