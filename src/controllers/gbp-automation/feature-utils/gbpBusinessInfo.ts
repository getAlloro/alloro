import { GbpAutomationError } from "./GbpAutomationError";
import { GBP_INPUT_LIMITS, sanitizeGbpText, sanitizeGbpUrl } from "./GbpInputSanitizer";

/**
 * A6 — GBP write-back helpers (types, boundary validation, rollback-snapshot extraction).
 *
 * The writable Business Profile fields map 1:1 to the readMask in
 * getLocationProfileForRanking, so the same field names drive the write and the
 * capture-before-write snapshot. The updateMask is DERIVED from the validated patch
 * keys — there is no separate mask input to drift out of sync, which removes the
 * empty-mask / mask-mismatch failure class entirely.
 */

// storefrontAddress is intentionally NOT writable in slice 1: it is the field Google
// most often responds to with re-verification/suspension, and it is outside this
// slice's stated scope. Structured objects (categories/phoneNumbers/regularHours) are
// deep-merged over the captured snapshot at write time so a partial edit never clears
// sibling subfields (proto3 field-mask replace semantics) — see mergePatchOverSnapshot.
export const BUSINESS_INFO_FIELDS = [
  "title",
  "categories",
  "phoneNumbers",
  "websiteUri",
  "regularHours",
  "profile",
] as const;

export type BusinessInfoField = (typeof BUSINESS_INFO_FIELDS)[number];

// Google's Business Profile title limit is ~100 chars; stay at/under it.
const TITLE_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 750;

const FIELD_LABELS: Record<BusinessInfoField, string> = {
  title: "business name",
  categories: "categories",
  phoneNumbers: "phone number",
  websiteUri: "website",
  regularHours: "business hours",
  profile: "description",
};

export type BusinessInfoPatch = Partial<Record<BusinessInfoField, unknown>>;

/**
 * Marks a business_info draft that Alloro STAGED from a detected completeness gap
 * (the A2→A6 auto-fill), as opposed to a manual owner edit. Both draft kinds publish
 * through the same path, so this is how the publish trigger tells them apart: only an
 * auto-fill surfaces an owner-facing "Alloro filled in X" action — a manual edit must
 * never claim Alloro did the owner's own work (Value #6 honesty).
 */
export const BUSINESS_INFO_ORIGIN_COMPLETENESS_AUTOFILL = "completeness_autofill";

/** The full slot persisted on the work item (gbp_work_items.business_info_payload). */
export interface BusinessInfoPayload {
  patch: BusinessInfoPatch;
  updateMask: BusinessInfoField[];
  /** Captured live values for the masked fields, written just before the PATCH. */
  previousValues?: BusinessInfoPatch | null;
  /** Set only for A2→A6 completeness auto-fill drafts; drives the owner-surface action. */
  origin?: typeof BUSINESS_INFO_ORIGIN_COMPLETENESS_AUTOFILL;
}

/** Plain, owner-facing labels for a set of written fields (e.g. websiteUri → "website"). */
export function businessInfoFieldLabels(fields: BusinessInfoField[]): string[] {
  return fields.map((field) => FIELD_LABELS[field]);
}

export interface BusinessInfoDraftInput {
  patch: BusinessInfoPatch;
  updateMask: BusinessInfoField[];
  /** Plain-English summary of the change for draft_content (a NOT NULL column). */
  summary: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The Business Information API v1 addresses the location as `locations/{locationId}`.
 * Typed structurally so this stays a pure helper with no model dependency.
 */
export function businessInfoLocationName(property: { external_id: string | null }): string {
  if (!property.external_id) {
    throw new GbpAutomationError(
      "GBP_PROPERTY_MISSING",
      "GBP property is missing its Google location id."
    );
  }
  return `locations/${property.external_id}`;
}

/**
 * Validate + sanitize the owner's proposed field values at the boundary (§11.2).
 * Only the allowlisted fields present in the input are written; the updateMask is
 * the set of keys that survived validation. Throws if nothing valid remains.
 */
export function parseBusinessInfoDraftInput(body: unknown): BusinessInfoDraftInput {
  const fields = isPlainObject(body) ? body.fields : undefined;
  if (!isPlainObject(fields)) {
    throw new GbpAutomationError(
      "INVALID_BUSINESS_INFO_INPUT",
      "Provide the profile fields to update."
    );
  }

  const patch: BusinessInfoPatch = {};

  for (const field of BUSINESS_INFO_FIELDS) {
    if (!(field in fields)) continue;
    const raw = fields[field];

    if (field === "title") {
      const title = sanitizeGbpText(raw, TITLE_MAX_LENGTH);
      if (title) patch.title = title;
      continue;
    }
    if (field === "websiteUri") {
      const uri = sanitizeGbpUrl(raw);
      if (uri) patch.websiteUri = uri;
      continue;
    }
    if (field === "profile") {
      const description = isPlainObject(raw)
        ? sanitizeGbpText(raw.description, DESCRIPTION_MAX_LENGTH)
        : null;
      if (description) patch.profile = { description };
      continue;
    }
    // categories / phoneNumbers / regularHours / storefrontAddress are structured
    // Google objects supplied by the owner/operator; accept them as-is if well-formed.
    if (isPlainObject(raw)) patch[field] = raw;
  }

  const updateMask = Object.keys(patch) as BusinessInfoField[];
  if (updateMask.length === 0) {
    throw new GbpAutomationError(
      "INVALID_BUSINESS_INFO_INPUT",
      "None of the provided profile fields were valid to update."
    );
  }

  return { patch, updateMask, summary: businessInfoSummary(updateMask) };
}

/** Plain-English label for the fields being changed — used as draft_content. */
export function businessInfoSummary(updateMask: BusinessInfoField[]): string {
  const labels = updateMask.map((field) => FIELD_LABELS[field]);
  return `Update ${labels.join(", ")} on Google`;
}

/**
 * Read the current live values for exactly the masked fields from a fetched
 * Business Profile — the rollback snapshot captured before the write. Fields absent
 * on Google are recorded as null so a revert honestly restores "was not set."
 */
export function extractMaskedFields(
  profile: Record<string, unknown> | null | undefined,
  updateMask: BusinessInfoField[]
): BusinessInfoPatch {
  const snapshot: BusinessInfoPatch = {};
  for (const field of updateMask) {
    const current = profile ? profile[field] : undefined;
    snapshot[field] = current === undefined ? null : current;
  }
  return snapshot;
}

/** Deep-merge `override` onto `base` (override wins at every leaf; arrays/scalars replace). */
function deepMerge(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) return override;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = deepMerge(base[key], value);
  }
  return out;
}

/** Order-sensitive structural equality. Arrays compare element-wise; key order is ignored. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((entry, index) => deepEqual(entry, b[index]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => key in b && deepEqual(a[key], b[key]));
  }
  return false;
}

/**
 * Did a PATCH we are unsure about actually land on Google?
 *
 * Answers it by evidence rather than assumption: compare the live profile's masked
 * fields against the exact values the write would have sent. Equal means the desired
 * state IS live, which is the only thing the work item is asserting — so it can be
 * finalized without sending the write again.
 *
 * The comparison is deliberately STRICT, and the bias is load-bearing. A false
 * "did not land" costs one redundant PATCH of identical absolute values (harmless —
 * the value is derived from the persisted snapshot, so re-sending is idempotent). A
 * false "landed" would mark the item published while the customer's real profile was
 * never changed — a silent divergence, and the exact failure this reconcile exists to
 * prevent. When in doubt, re-send.
 */
export function liveMatchesDesired(
  liveProfile: Record<string, unknown> | null | undefined,
  desired: BusinessInfoPatch,
  updateMask: BusinessInfoField[]
): boolean {
  if (!liveProfile) return false;
  const live = extractMaskedFields(liveProfile, updateMask);
  return updateMask.every((field) => deepEqual(live[field], desired[field] ?? null));
}

/**
 * Build the value actually sent to Google: the owner's proposed change deep-merged
 * ONTO the captured live snapshot, per masked field. A top-level updateMask replaces
 * the whole message on Google's side, so without this a partial structured edit (e.g.
 * only `phoneNumbers.primaryPhone`) would silently clear its siblings (additionalPhones).
 * Merging over the snapshot preserves everything the owner did not explicitly change.
 */
export function mergePatchOverSnapshot(
  patch: BusinessInfoPatch,
  snapshot: BusinessInfoPatch | null | undefined,
  updateMask: BusinessInfoField[]
): BusinessInfoPatch {
  const merged: BusinessInfoPatch = {};
  for (const field of updateMask) {
    const proposed = patch[field];
    const current = snapshot ? snapshot[field] : undefined;
    merged[field] =
      isPlainObject(proposed) && isPlainObject(current)
        ? (deepMerge(current, proposed) as unknown)
        : proposed;
  }
  return merged;
}
