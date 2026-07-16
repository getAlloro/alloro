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

export const BUSINESS_INFO_FIELDS = [
  "title",
  "categories",
  "phoneNumbers",
  "websiteUri",
  "regularHours",
  "profile",
  "storefrontAddress",
] as const;

export type BusinessInfoField = (typeof BUSINESS_INFO_FIELDS)[number];

const TITLE_MAX_LENGTH = 300;
const DESCRIPTION_MAX_LENGTH = 750;

const FIELD_LABELS: Record<BusinessInfoField, string> = {
  title: "business name",
  categories: "categories",
  phoneNumbers: "phone number",
  websiteUri: "website",
  regularHours: "business hours",
  profile: "description",
  storefrontAddress: "address",
};

export type BusinessInfoPatch = Partial<Record<BusinessInfoField, unknown>>;

/** The full slot persisted on the work item (gbp_work_items.business_info_payload). */
export interface BusinessInfoPayload {
  patch: BusinessInfoPatch;
  updateMask: BusinessInfoField[];
  /** Captured live values for the masked fields, written just before the PATCH. */
  previousValues?: BusinessInfoPatch | null;
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
