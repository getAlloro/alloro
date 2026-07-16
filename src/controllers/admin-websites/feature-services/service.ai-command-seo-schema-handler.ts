/**
 * AI Command — SEO schema-write handler (Alloro Funnel Engine Slice 1b).
 *
 * The get-found WRITE path: writes a page's `seo_data.schema_json` from an
 * APPROVED recommendation of the new `page_seo_schema` target_type. This is the
 * first (and only) handler that touches `seo_data`; every other ai-command
 * handler edits HTML or structure. Kept in its own file so the structural
 * handlers module stays under the §2.4 size ceiling.
 *
 * Version-reversibility rides the SAME rail the `page_section` handler uses: the
 * write lands on the batch's pinned DRAFT (`resolvePageDraftId`), and the batch
 * auto-publishes that draft at the end (`service.ai-command-execute`) — retiring
 * the prior published row (with its prior `seo_data`) as an inactive history
 * version. Page-restore carries `seo_data` back (`publishPageVersionQuery`
 * retains the old row; `restoreVersionQuery` re-inserts a version's `seo_data`
 * via `carriedFields`), so the change is reversible without any new rollback code.
 *
 * Honesty gate (spec Constraint / Value #6): every claim-bearing free-text value in
 * the proposed schema is run through `GeneratedCopySafetyService` before the write; a
 * rank/placement/visibility claim FAILS the recommendation and writes nothing.
 *
 * The gate scans by DEFAULT and excludes on the VALUE, never on the key: a value is
 * skipped only when it is actually structural — URL-shaped, phone-shaped, an
 * `@id`/`@type` token — for the key it sits under. A key name is caller-supplied
 * input (§5.2), so trusting one would let `{"url": "<claim sentence>"}` ride past a
 * gate that never looked at the value. Unknown key ⇒ scanned; known key with a
 * non-structural value ⇒ scanned. Both directions fail CLOSED.
 * No new autonomy — the row executes only because a human already approved it.
 */

import { AiCommandRecommendationModel } from "../../../models/website-builder/AiCommandRecommendationModel";
import { PageModel } from "../../../models/website-builder/PageModel";
// The neutral shared gate (§7.1): this admin-websites service must not reach into the
// gbp-automation domain. #158 extracted the generic logic here for exactly this reason.
import { GeneratedCopySafetyService } from "../../../services/content-safety/GeneratedCopySafetyService";
import logger from "../../../lib/logger";
import {
  type ExecutionContext,
  resolvePageDraftId,
} from "../feature-utils/util.ai-command-shared";

/**
 * The exclusion axis is the VALUE, never the key.
 *
 * A key name is a claim from the caller, not a fact: `{"url": "We guarantee first
 * page placement on Google"}` is claim text sitting under a structural key, and a
 * key-name denylist waves it straight through. So a value is skipped only when it
 * is ACTUALLY structural — the shape its key REQUIRES. A claim sentence in a `url`
 * field is not a URL, so it is scanned like any other prose.
 *
 * A whole-value URL / mailto: / tel: / urn: is structural under ANY key (a real
 * page URL such as `https://example.com/we-guarantee-x` is machine data, not a
 * promise, and scanning it would false-positive on the practice's own links).
 */
const URL_VALUE = /^(?:https?:\/\/|mailto:|tel:|urn:)\S*$/i;

/** A bare schema.org type token — "Dentist", "LocalBusiness". Never a sentence. */
const TYPE_TOKEN = /^[A-Za-z][A-Za-z0-9]*$/;
/** A fragment or blank-node reference — "#business", "_:b0". */
const NODE_REF = /^(?:#|_:)[A-Za-z0-9._~%!$&'()*+,;=:@/?-]*$/;
/** Digits and phone punctuation only, optional extension. Never prose. */
const PHONE_VALUE = /^[+(]?\d[\d\s().+-]*(?:(?:ext|x|extension)\.?\s*\d+)?$/i;
/** A single addr-spec — no whitespace either side of the @. */
const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const isUrlValue = (text: string): boolean => URL_VALUE.test(text);

/**
 * The audit table: every key the gate may skip, and the shape its value must
 * ACTUALLY have to earn that skip. A key absent from this table is always
 * scanned, and a key present here is scanned whenever its value fails the shape —
 * both directions fail CLOSED.
 *
 * `identifier` is deliberately NOT here: a real identifier ("NPI-1234567890") trips
 * no claim pattern, so scanning it is free, while a URL identifier is already
 * covered by the whole-value URL rule. It needs no key-level trust.
 */
const STRUCTURAL_VALUE_SHAPE: Record<string, (text: string) => boolean> = {
  "@context": (text) => isUrlValue(text) || TYPE_TOKEN.test(text),
  "@id": (text) => isUrlValue(text) || NODE_REF.test(text),
  "@type": (text) => TYPE_TOKEN.test(text) || isUrlValue(text),
  url: isUrlValue,
  sameAs: isUrlValue,
  image: isUrlValue,
  logo: isUrlValue,
  telephone: (text) => PHONE_VALUE.test(text),
  faxNumber: (text) => PHONE_VALUE.test(text),
  email: (text) => EMAIL_VALUE.test(text),
};

/**
 * True only when `text` is genuinely structural. A missing key means nothing is
 * known about the value, so it is scanned — never trusted.
 */
export function isStructuralValue(key: string | null, text: string): boolean {
  if (isUrlValue(text)) return true;
  if (!key) return false;
  const shape = STRUCTURAL_VALUE_SHAPE[key];
  return shape ? shape(text) : false;
}

/**
 * Identifier keys carrying a proper NAME. They are scanned (a name can still carry
 * a rank claim — "Rank #1 Dental Implants"), but a medical/outcome-only match does
 * not block a value that is genuinely NAME-SHAPED: a real practice named
 * "Pain-Free Dental Studio" is stating its name, not a claim Alloro is making.
 * Every rank/placement/visibility/will-rank family still blocks here.
 */
const IDENTITY_SCHEMA_KEYS = new Set(["name", "alternateName", "legalName"]);

/**
 * The identity carve-out is value-shaped too — same axis as the structural skip,
 * for the same reason. Softening on the key alone lets a sentence ride inside
 * `name` ("We cure gum disease permanently") straight past the gate.
 *
 * A proper name is a short noun phrase: it does not address the reader or speak
 * as the practice, and it does not run on. A value that does either is prose
 * wearing a name's key, and is judged as prose.
 */
const NAME_MAX_WORDS = 6;
const NAME_DISQUALIFYING_PRONOUN = /\b(?:we|our|ours|us|you|your|yours|i|my|mine|they|their)\b/i;

/**
 * A PROMISE is never softened, wherever it sits.
 *
 * The outcome family mixes two different things: DESCRIPTORS a practice may
 * genuinely be named for ("Pain-Free Dental Studio"), and a GUARANTEE, which is
 * a commitment Alloro cannot back (Value #6). A business cannot name its way
 * into a guarantee, so the carve-out never covers one.
 *
 * This also stops the carve-out becoming the weakest link. Softening is applied
 * per reason code, so whenever a value reaches the gate with the outcome code as
 * the ONLY surviving reason, softening it publishes that value outright — no
 * matter which family the claim really came from. The carve-out must never be
 * the last thing standing between a promise and a live page. Fixtures live in
 * `src/__tests__/get-found-write.test.ts`.
 */
const PROMISE_NEVER_SOFTENED = /\bguarantee(?:s|d|ing)?\b/i;

export function isProperNameShaped(text: string): boolean {
  if (NAME_DISQUALIFYING_PRONOUN.test(text)) return false;
  if (PROMISE_NEVER_SOFTENED.test(text)) return false;
  return text.trim().split(/\s+/).filter(Boolean).length <= NAME_MAX_WORDS;
}

/** Reason code from `validateGeneratedCopy` for the guarantee/cure/pain-free family. */
const MEDICAL_OUTCOME_REASON_CODE = "medical_or_outcome_claim";

export interface SchemaCopyEntry {
  key: string;
  value: string;
}

/**
 * Recursively collect claim-bearing free-text values for the honesty gate: every
 * string EXCEPT those whose VALUE is actually structural for its key.
 */
export function collectSchemaCopy(
  value: unknown,
  key: string | null = null,
  acc: SchemaCopyEntry[] = []
): SchemaCopyEntry[] {
  if (typeof value === "string") {
    const text = value.trim();
    if (text && !isStructuralValue(key, text)) {
      acc.push({ key: key ?? "", value });
    }
  } else if (Array.isArray(value)) {
    for (const item of value) collectSchemaCopy(item, key, acc);
  } else if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      collectSchemaCopy(childValue, childKey, acc);
    }
  }
  return acc;
}

/**
 * A JSON-LD entry must be a real JSON object. `[null]`, `["text"]`, `[1]` and
 * nested arrays are not: every consumer dereferences entries as objects, so a
 * scalar or null member crashes the reader downstream. Validated here, before any
 * write — client input is never trusted (§5.2).
 */
function isJsonLdEntry(entry: unknown): entry is Record<string, unknown> {
  return typeof entry === "object" && entry !== null && !Array.isArray(entry);
}

/** Honesty-gate reasons for every claim-bearing string in the proposed schema. */
export function findSchemaCopyViolations(schemaJson: unknown): string[] {
  const reasons: string[] = [];
  for (const entry of collectSchemaCopy(schemaJson)) {
    const result = GeneratedCopySafetyService.validateGeneratedCopy(entry.value);
    if (result.isSafe) continue;
    // Value-shaped, not key-shaped: an identity key only softens a value that is
    // genuinely a proper name. A sentence under `name` is judged as prose.
    const isIdentity =
      IDENTITY_SCHEMA_KEYS.has(entry.key) && isProperNameShaped(entry.value);
    // reasonCodes/reasons are pushed in lockstep by validateGeneratedCopy.
    result.reasonCodes.forEach((code, index) => {
      if (isIdentity && code === MEDICAL_OUTCOME_REASON_CODE) return;
      reasons.push(`${entry.key}: ${result.reasons[index]}`);
    });
  }
  return reasons;
}

/** Fail the recommendation with a typed result and write nothing (§3.2). */
async function failRecommendation(recId: string, error: string): Promise<void> {
  await AiCommandRecommendationModel.updateById(recId, {
    status: "failed",
    execution_result: JSON.stringify({ success: false, error }),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeUpdatePageSeoSchema(
  rec: any,
  ctx: ExecutionContext
): Promise<void> {
  const meta = typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;

  const origPage = await PageModel.findRawById(rec.target_id);
  if (!origPage) {
    await failRecommendation(rec.id, `Page ${rec.target_id} not found`);
    return;
  }

  const schemaJson = meta?.schema_json;
  // The whole codebase reads `seo_data.schema_json` as an ARRAY of JSON-LD
  // OBJECTS (consumers call `.some(...)`, guard with `Array.isArray`, and then
  // dereference each entry's properties). Require a non-empty array in which
  // EVERY member is a non-null, non-array object: a bare object, an empty array,
  // or a member that is null/scalar/nested-array fails the recommendation and
  // writes nothing. Anything looser crashes the panel scorer on dereference and
  // silently disables the enrichment reader (§5.2 — never trust client input).
  const schemaIsValidArray =
    Array.isArray(schemaJson) && schemaJson.length > 0 && schemaJson.every(isJsonLdEntry);
  if (!schemaIsValidArray) {
    await failRecommendation(
      rec.id,
      "A non-empty schema_json array is required in target_meta, and every entry must be a JSON-LD object.",
    );
    return;
  }

  // Honesty gate — no rank/placement/visibility claim may enter the schema.
  const blocked = findSchemaCopyViolations(schemaJson);
  if (blocked.length > 0) {
    await failRecommendation(rec.id, `Honesty gate blocked schema copy: ${blocked.join("; ")}`);
    return;
  }

  // Write to the batch's pinned draft so the change publishes as one reversible
  // page version — identical mechanics to the page_section handler.
  const draftId = await resolvePageDraftId(origPage, ctx);
  const draft = await PageModel.findRawById(draftId);
  if (!draft) throw new Error(`Draft ${draftId} disappeared for path ${origPage.path}`);

  const existingSeo =
    draft.seo_data == null
      ? {}
      : typeof draft.seo_data === "string"
        ? JSON.parse(draft.seo_data)
        : draft.seo_data;
  const nextSeo = { ...existingSeo, schema_json: schemaJson };

  await PageModel.updateSeoDataById(draftId, JSON.stringify(nextSeo));

  await AiCommandRecommendationModel.updateById(rec.id, {
    status: "executed",
    execution_result: JSON.stringify({ success: true, page_id: draftId, schema_written: true }),
  });

  logger.info(`[AiCommand] ✓ Wrote seo_data.schema_json for ${origPage.path} (draft ${draftId})`);
}
