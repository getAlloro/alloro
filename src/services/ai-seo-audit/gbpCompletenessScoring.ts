/**
 * GBP own-completeness grading — Alloro Funnel Engine A2 (get-found).
 *
 * The client-side sibling of util.competitor-profile-strength.ts: that module
 * scores COMPETITORS' Google profiles; this one scores the practice's OWN
 * Google Business Profile for completeness and returns the MISSING-field set.
 * It mirrors schemaCompletenessScoring.ts (Slice 1a): a pure grader, no DB / no
 * IO, whose "incomplete" signal GATES NOTHING and is never owner-facing.
 *
 * Input contract: the condensed `client_gbp` record Alloro already builds in the
 * audit pipeline (src/workers/processors/auditLeadgen.processor.ts, verified
 * fields: categoryName, categories, address, phone, website, hasWebsite,
 * hasPhone, hasHours, openingHoursSummary, imagesCount). This module reads those
 * real fields only — it never invents a field, and it tolerates a key being
 * absent (treated as "not provided" = missing, no crash). No net-new fetch.
 *
 * Honesty rule (spec Constraint, Value #6): a complete profile improves
 * eligibility/trust, NOT ranking. Callers must never present this score, or the
 * missing-field set, as a ranking outcome.
 *
 * Evidence tier: DIRECTIONAL.
 */

/**
 * Permissive shape of the practice's own condensed GBP record. Every field is
 * optional: a field absent from the record grades as "missing", not an error.
 * Field names match the verified condensed record; both the explicit boolean
 * flags (hasWebsite/hasPhone/hasHours) and the raw values are accepted.
 */
export interface GbpCompletenessInput {
  categoryName?: string | null;
  primaryCategory?: string | null;
  categories?: string[] | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  hasWebsite?: boolean | null;
  hasPhone?: boolean | null;
  hasHours?: boolean | null;
  openingHoursSummary?: string | null;
  imagesCount?: number | null;
}

/** The real, owner-fillable GBP fields graded for completeness (stable keys). */
export const GBP_COMPLETENESS_FIELDS = [
  "category",
  "website",
  "phone",
  "hours",
  "address",
  "photos",
] as const;

export type GbpCompletenessField = (typeof GBP_COMPLETENESS_FIELDS)[number];

export interface GbpCompletenessResult {
  /** True only when a real GBP record with at least one known signal was given. */
  hasData: boolean;
  presentFields: GbpCompletenessField[];
  missingFields: GbpCompletenessField[];
  /** present / total graded fields, 0..1. */
  completeness: number;
  /**
   * Internal-only signal, never owner-facing. True when hasData and one or more
   * fields are missing. Gates NOTHING (spec Constraint).
   */
  gbpIncomplete: boolean;
}

function nonEmptyStr(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function fieldPresent(input: GbpCompletenessInput, field: GbpCompletenessField): boolean {
  switch (field) {
    case "category":
      return (
        nonEmptyStr(input.categoryName) ||
        nonEmptyStr(input.primaryCategory) ||
        (Array.isArray(input.categories) && input.categories.some(nonEmptyStr))
      );
    case "website":
      return input.hasWebsite === true || nonEmptyStr(input.website);
    case "phone":
      return input.hasPhone === true || nonEmptyStr(input.phone);
    case "hours":
      return input.hasHours === true || nonEmptyStr(input.openingHoursSummary);
    case "address":
      return nonEmptyStr(input.address);
    case "photos":
      return typeof input.imagesCount === "number" && input.imagesCount > 0;
  }
}

/**
 * Grade the practice's own condensed GBP record for completeness. Returns the
 * present/missing field sets. Pass the condensed `client_gbp` record; when there
 * is no real GBP content — null/undefined, an empty object, or a
 * `condenseGbp(null)` record whose fields are all empty/false — the result
 * reports hasData:false and recommends nothing (never a false "complete your
 * profile" to a practice with no listing).
 */
export function scoreGbpCompleteness(
  input: GbpCompletenessInput | null | undefined,
): GbpCompletenessResult {
  const empty: GbpCompletenessResult = {
    hasData: false,
    presentFields: [],
    missingFields: [],
    completeness: 0,
    gbpIncomplete: false,
  };
  if (!input || typeof input !== "object") return empty;

  const presentFields: GbpCompletenessField[] = [];
  const missingFields: GbpCompletenessField[] = [];
  for (const field of GBP_COMPLETENESS_FIELDS) {
    if (fieldPresent(input, field)) presentFields.push(field);
    else missingFields.push(field);
  }

  // No present field ⇒ no gradable GBP content, so skip (hasData:false). The
  // condensed record ALWAYS carries the derived booleans hasWebsite/hasPhone/
  // hasHours — even for a practice with NO listing (condenseGbp(null) ⇒ all
  // false) — so "a key is defined" is NOT a safe signal. Gating on
  // presentFields guarantees we never tell a no-GBP / blank-GBP practice to
  // "complete your profile".
  if (presentFields.length === 0) return empty;

  return {
    hasData: true,
    presentFields,
    missingFields,
    completeness: presentFields.length / GBP_COMPLETENESS_FIELDS.length,
    gbpIncomplete: missingFields.length > 0,
  };
}

/** Owner-facing labels for the graded fields (eligibility/trust framing, no rank
 * language). Used to render the advisory recommendation. */
export function gbpFieldLabel(field: GbpCompletenessField): string {
  switch (field) {
    case "category":
      return "business category";
    case "website":
      return "website";
    case "phone":
      return "phone number";
    case "hours":
      return "opening hours";
    case "address":
      return "business address";
    case "photos":
      return "at least one photo";
  }
}
