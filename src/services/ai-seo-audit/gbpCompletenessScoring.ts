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
 * leadgen audit, or the existing AI-ready GBP profile used by the SEO audit.
 * `mapAiReadyGbpToCompletenessInput` converts the latter without a new provider
 * request. It marks only fields that source actually returned as gradable, so a
 * provider omission (currently photo count) is not misreported as owner missing.
 *
 * Honesty rule (spec Constraint, Value #6): a complete profile improves
 * eligibility/trust, NOT ranking. Callers must never present this score, or the
 * missing-field set, as a ranking outcome.
 *
 * Evidence tier: DIRECTIONAL.
 */

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

/**
 * Permissive shape of the practice's own condensed GBP record. Every field is
 * optional: a field absent from the standard condensed record grades as
 * "missing", not an error. An adapter for a narrower source may set
 * `gradableFields` so fields the source never returned are skipped rather than
 * falsely reported as missing.
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
  gradableFields?: readonly GbpCompletenessField[];
}

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

function nonEmptyStr(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return nonEmptyStr(value) ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => nonEmptyStr(entry)).map((entry) => entry.trim())
    : [];
}

function formatStorefrontAddress(value: unknown): string | null {
  const address = objectValue(value);
  if (!address) return null;
  const lines = stringArray(address.addressLines);
  const parts = [
    ...lines,
    stringValue(address.locality),
    stringValue(address.administrativeArea),
    stringValue(address.postalCode),
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * Adapt the already-fetched `getGBPAIReadyData()` result used by organization
 * audits to the flat completeness contract. The current source returns profile
 * identity/hours but no photo count; photos therefore remain ungraded unless a
 * numeric count is present in a future response.
 */
export function mapAiReadyGbpToCompletenessInput(
  gbpData: Record<string, unknown> | null | undefined,
): GbpCompletenessInput | null {
  const profile = objectValue(gbpData?.profile);
  if (!profile) return null;

  const primaryCategory = stringValue(profile.primaryCategory);
  const categories = [
    ...(primaryCategory ? [primaryCategory] : []),
    ...stringArray(profile.additionalCategories),
  ];
  const imagesCountValue = gbpData?.imagesCount ?? profile.imagesCount;
  const imagesCount = typeof imagesCountValue === "number" ? imagesCountValue : null;
  const gradableFields = imagesCount === null
    ? GBP_COMPLETENESS_FIELDS.filter((field) => field !== "photos")
    : GBP_COMPLETENESS_FIELDS;
  const regularHourPeriods = objectValue(profile.regularHours)?.periods;

  return {
    primaryCategory,
    categories,
    address: formatStorefrontAddress(profile.storefrontAddress),
    phone: stringValue(profile.phoneNumber),
    website: stringValue(profile.websiteUri),
    hasHours:
      profile.hasHours === true ||
      (Array.isArray(regularHourPeriods) && regularHourPeriods.length > 0),
    imagesCount,
    gradableFields,
  };
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

  const fields = GBP_COMPLETENESS_FIELDS.filter(
    (field) => !input.gradableFields || input.gradableFields.includes(field),
  );
  const presentFields: GbpCompletenessField[] = [];
  const missingFields: GbpCompletenessField[] = [];
  for (const field of fields) {
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
    completeness: presentFields.length / fields.length,
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
