/**
 * Owner-receipt metric builders — turn a raw read into an honesty-labelled gate
 * number (§6.3, domain-local helpers).
 *
 * The rule this file exists to enforce: **a note must say why a value is
 * absent, and it must be TRUE.** Before this, three different absences —
 * "the source isn't connected", "the org has no website", and "the read
 * threw" — all collapsed to one `null` and were reported to the practice as
 * "your website visits source is not connected". A Rybbit outage was rendered
 * as a statement about the practice's setup, and a database error was rendered
 * as "you have never had a lead."
 *
 * So availability travels as a `MetricAvailability` kind, decided where the
 * read happens, and the note is chosen from it here. A failed read says it
 * failed.
 */

import type { ImpressionsLiftResult } from "../../patient-journey/feature-services/impressionsLiftReader";
import type { StageRead } from "../../patient-journey/feature-services/stageReaders";
import type { OwnerReceiptMetric } from "../OwnerReceiptTypes";

/** Why a gate number is present or absent. Decided at the read, not guessed. */
export type MetricAvailability =
  /** A real, measured number (including a genuine measured zero). */
  | "measured"
  /** The org has no website project, so this gate has no source at all. */
  | "no_project"
  /** The source exists but is not connected for this practice. */
  | "not_connected"
  /** Connected, but nothing has ever been recorded — the source isn't established. */
  | "no_data_yet"
  /** Connected, but the window is not fully covered, so no total is honest. */
  | "partial_coverage"
  /** The requested windows cannot be compared (unequal length, overlap, …). */
  | "window_not_comparable"
  /** We tried and the read failed. A statement about US, never about them. */
  | "read_failed";

/**
 * The impressions number is Google Search ORGANIC ONLY.
 *
 * `AGENTS.md` defines Get Found as map + organic + AI answers. This reader
 * answers one of the three (Maps impressions are trust-clamped and too short a
 * history for a multi-week before/after). The caveat is therefore PERMANENT,
 * not a fallback: without it the owner reads a partial measure labelled as the
 * whole gate.
 */
const IMPRESSIONS_PROVENANCE_NOTE =
  "Google Search organic only — Google Maps impressions are not included.";

/**
 * What we say when a read failed.
 *
 * It must not be mistakable for a fact about the practice. "Not measured"
 * alone reads as "you have none"; this says the failure is ours.
 */
function readFailedNote(what: string): string {
  return `not measured: we could not read your ${what} just now — that is a problem on our side, not a reading of your practice`;
}

/** Post-window organic impressions, honesty-labelled. */
export function impressionsMetric(trend: ImpressionsLiftResult): OwnerReceiptMetric {
  const post = trend.post;
  const base = { gate: "impressions" as const, source: "gsc_organic" };

  if (trend.failureKind === "read_failed") {
    return { ...base, value: null, asOf: null, note: readFailedNote("search history") };
  }
  if (trend.failureKind === "no_project") {
    return {
      ...base,
      value: null,
      asOf: null,
      note: "not measured: no website is connected to this practice yet",
    };
  }
  if (
    trend.failureKind === "invalid_window" ||
    trend.failureKind === "window_too_long" ||
    trend.failureKind === "unequal_length" ||
    trend.failureKind === "overlapping"
  ) {
    return {
      ...base,
      value: null,
      asOf: null,
      note: `not measured: ${trend.reason ?? "the requested windows cannot be compared"}`,
    };
  }
  if (!post || post.storedDays === 0) {
    return {
      ...base,
      value: null,
      asOf: null,
      note: "not measured: no stored Google Search history in the post window",
    };
  }
  if (!post.fullyCovered) {
    return {
      ...base,
      value: null,
      asOf: post.latestStored,
      note: `not measured: the post window is only partially covered (${post.storedDays} of ${post.expectedDays} days stored)`,
    };
  }
  return {
    ...base,
    value: post.storedImpressions,
    asOf: post.latestStored,
    // Never null: a partial gate must not be labelled as the whole gate.
    note: IMPRESSIONS_PROVENANCE_NOTE,
  };
}

/** Map a visits read to an honesty-labelled metric, using its availability kind. */
export function visitsMetric(
  read: StageRead | null,
  kind: MetricAvailability
): OwnerReceiptMetric {
  const base = { gate: "visits" as const, source: "rybbit" };

  if (kind === "read_failed") {
    return { ...base, value: null, asOf: null, note: readFailedNote("website visits") };
  }
  if (kind === "no_project") {
    return {
      ...base,
      value: null,
      asOf: null,
      note: "not measured: no website is connected to this practice yet",
    };
  }
  if (!read || !read.available) {
    return {
      ...base,
      value: null,
      asOf: null,
      note: "not measured: your website visits source is not connected",
    };
  }
  return { ...base, value: read.value, asOf: read.asOf, note: read.note ?? null };
}

/**
 * Leads metric for the post window. A project with no verified submissions ever
 * is "not measured" (the lead source isn't established) — `null`, never 0. A
 * connected project with a genuine 0 in the window keeps the real 0.
 */
export function leadsMetric(
  windowCount: number | null,
  hasEverHadLead: boolean,
  asOf: string,
  kind: MetricAvailability
): OwnerReceiptMetric {
  const base = { gate: "leads" as const, source: "form_submissions" };

  if (kind === "read_failed") {
    return { ...base, value: null, asOf: null, note: readFailedNote("form submissions") };
  }
  if (kind === "no_project") {
    return {
      ...base,
      value: null,
      asOf: null,
      note: "not measured: no website is connected to this practice yet",
    };
  }
  if (windowCount === null || !hasEverHadLead) {
    return {
      ...base,
      value: null,
      asOf: null,
      note: "not measured: no verified form submissions recorded yet",
    };
  }
  return { ...base, value: windowCount, asOf, note: null };
}
