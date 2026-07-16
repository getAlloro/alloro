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
 * rank/placement/visibility claim FAILS the recommendation and writes nothing. The
 * gate scans by DEFAULT and skips only narrowly structural values, so a key nobody
 * enumerated cannot smuggle claim text past it.
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
 * Schema.org keys whose values are STRUCTURAL — identifiers, machine references,
 * and contact endpoints that cannot carry an owner-facing claim. These are the
 * ONLY keys the honesty gate skips.
 *
 * This is deliberately a DENYLIST, not an allowlist. An allowlist of "descriptive"
 * keys silently passes every key nobody thought of (`serviceType`, `award`,
 * `makesOffer`, …), and schema.org has hundreds — any one of them can carry claim
 * text and would bypass the gate. Scanning by default fails CLOSED: an unknown key
 * is scanned, not trusted.
 */
const STRUCTURAL_SCHEMA_KEYS = new Set([
  "@context",
  "@id",
  "@type",
  "identifier",
  "url",
  "sameAs",
  "image",
  "logo",
  "telephone",
  "faxNumber",
  "email",
]);

/**
 * Identifier keys carrying a proper NAME. They are scanned (a name can still carry
 * a rank claim — "Rank #1 Dental Implants"), but a medical/outcome-only match does
 * not block them: a real practice named "Pain-Free Dental Studio" is stating its
 * name, not a claim Alloro is making. Every rank/placement/visibility/will-rank
 * family still blocks here.
 */
const IDENTITY_SCHEMA_KEYS = new Set(["name", "alternateName", "legalName"]);

/** Reason code from `validateGeneratedCopy` for the guarantee/cure/pain-free family. */
const MEDICAL_OUTCOME_REASON_CODE = "medical_or_outcome_claim";

/** A value that is ENTIRELY a URL/contact endpoint — structural regardless of key. */
const STRUCTURAL_VALUE = /^(?:https?:\/\/|mailto:|tel:)\S*$/i;

export interface SchemaCopyEntry {
  key: string;
  value: string;
}

/**
 * Recursively collect claim-bearing free-text values for the honesty gate: every
 * string EXCEPT those under a structural key or whose whole value is a URL.
 */
export function collectSchemaCopy(
  value: unknown,
  key: string | null = null,
  acc: SchemaCopyEntry[] = []
): SchemaCopyEntry[] {
  if (typeof value === "string") {
    const text = value.trim();
    if (key && text && !STRUCTURAL_SCHEMA_KEYS.has(key) && !STRUCTURAL_VALUE.test(text)) {
      acc.push({ key, value });
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
    const isIdentity = IDENTITY_SCHEMA_KEYS.has(entry.key);
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
