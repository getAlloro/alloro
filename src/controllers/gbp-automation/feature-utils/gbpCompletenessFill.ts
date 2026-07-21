import type { GbpCompletenessField } from "../../../services/ai-seo-audit/gbpCompletenessScoring";
import { businessInfoSummary, BusinessInfoField, BusinessInfoPatch } from "./gbpBusinessInfo";
import { sanitizeGbpUrl } from "./GbpInputSanitizer";

/**
 * A2 → A6 bridge (pure): turn the completeness detector's MISSING-field set into a
 * businessInformation write-back patch — but ONLY for fields where Alloro genuinely
 * holds the correct value on its own. This is the "found it → staged the fix" seam.
 *
 * Honesty rule (Value #6, staked 2026-07-17): NEVER stage a fabricated or blank value.
 * A2 detects that a GBP field is EMPTY; it does NOT carry the value to fill it. So this
 * bridge can only fill a field when the value lives in an Alloro column that is
 * independent of Google. Today that is exactly one field:
 *
 *   website → websiteUri, sourced from LocationModel.domain (fallback OrganizationModel.domain)
 *
 * Every other missing field is classified as unfillable with a machine-readable reason,
 * so the gap is surfaced to the owner/operator rather than silently guessed:
 *
 *   category / phone / hours → "no-value-source"
 *       Alloro holds no value for these that is INDEPENDENT of Google. `business_data`
 *       is populated FROM the GBP read (see BusinessDataService.mapGBPToBusinessData),
 *       so using it to refill a GBP gap would be circular or stale — never a trustworthy
 *       source. OPEN DECISION for Corey: if a first-class, owner-entered source for any
 *       of these is added, wire it here.
 *   address / photos → "not-writable"
 *       storefrontAddress is intentionally excluded from the write-back slice (Google
 *       re-verifies/suspends on address edits), and photos are the media API, not
 *       businessInformation — neither can be staged through createDraft.
 *
 * Pure module: no DB, no IO. The bridge service reads the source values from the model
 * layer (§7.4) and passes them in.
 */

/**
 * Why a detected-missing field was NOT staged for auto-fill.
 *
 * `unhandled-field` is the safety-net reason: a detected field the bridge has no
 * explicit case for. It should be unreachable in normal use (the switch below is
 * compile-time exhaustive over GbpCompletenessField), but if a new field is ever
 * added or an untyped value slips through, the gap is surfaced here rather than
 * silently dropped from owner-visible reporting.
 */
export type CompletenessFillSkipReason =
  | "no-value-source"
  | "not-writable"
  | "unhandled-field";

/** The Alloro-held values this bridge can draw on. Grows as real sources are added. */
export interface CompletenessFillSources {
  /** The practice's own website — LocationModel.domain, or OrganizationModel.domain. */
  website?: string | null;
}

export interface CompletenessFillSkip {
  field: GbpCompletenessField;
  reason: CompletenessFillSkipReason;
}

export interface CompletenessFillResult {
  /** The businessInformation patch — only fields Alloro genuinely holds a value for. */
  patch: BusinessInfoPatch;
  /** Derived from the patch keys; empty when nothing was fillable. */
  updateMask: BusinessInfoField[];
  /** Plain-English draft_content summary for the staged work item. */
  summary: string;
  /** The businessInformation fields that got a real value. */
  filled: BusinessInfoField[];
  /** Detected-missing fields we did NOT stage, each with a reason (owner-visible). */
  unfillable: CompletenessFillSkip[];
}

/**
 * Normalize an Alloro `domain` value to a validated GBP websiteUri. Alloro stores the
 * domain as a bare host in most cases; Google's websiteUri needs a scheme. Prepend
 * https:// when no scheme is present, then run it through the shared URL sanitizer.
 * Returns null for anything that does not resolve to a valid http/https URL — so a
 * blank or malformed domain is skipped, never staged.
 */
function domainToWebsiteUri(domain: string | null | undefined): string | null {
  if (typeof domain !== "string") return null;
  const trimmed = domain.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return sanitizeGbpUrl(withScheme);
}

/**
 * Build the auto-fill patch from the detector's missing-field set and the values Alloro
 * holds. Only fields with a genuine, independent, valid value land in the patch; the
 * rest are returned in `unfillable` with a reason. Never emits a blank or guessed value.
 */
export function buildCompletenessFillPatch(
  missingFields: readonly GbpCompletenessField[],
  sources: CompletenessFillSources
): CompletenessFillResult {
  const patch: BusinessInfoPatch = {};
  const filled: BusinessInfoField[] = [];
  const unfillable: CompletenessFillSkip[] = [];

  for (const field of missingFields) {
    switch (field) {
      case "website": {
        const websiteUri = domainToWebsiteUri(sources.website);
        if (websiteUri) {
          patch.websiteUri = websiteUri;
          filled.push("websiteUri");
        } else {
          unfillable.push({ field, reason: "no-value-source" });
        }
        break;
      }
      // Alloro holds no value INDEPENDENT of Google for these (see module header).
      case "category":
      case "phone":
      case "hours":
        unfillable.push({ field, reason: "no-value-source" });
        break;
      // Outside the businessInformation write-back slice — cannot be staged at all.
      case "address":
      case "photos":
        unfillable.push({ field, reason: "not-writable" });
        break;
      default: {
        // Compile-time exhaustiveness guard: if a new GbpCompletenessField is added
        // to GBP_COMPLETENESS_FIELDS without a case above, this `never` assignment
        // fails `tsc`, forcing an explicit classification decision instead of a
        // silent drop. Runtime safety-net: an unhandled field (e.g. an untyped
        // value from upstream) is surfaced as unfillable so a detected gap can
        // NEVER vanish from owner-visible reporting (Value #6 honesty).
        const unhandled: never = field;
        unfillable.push({ field: unhandled, reason: "unhandled-field" });
        break;
      }
    }
  }

  const updateMask = Object.keys(patch) as BusinessInfoField[];
  return {
    patch,
    updateMask,
    summary: businessInfoSummary(updateMask),
    filled,
    unfillable,
  };
}
