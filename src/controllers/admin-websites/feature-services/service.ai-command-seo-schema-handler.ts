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
 * Honesty gate (spec Constraint / Value #6): every owner-facing free-text field in
 * the proposed schema is run through `GbpContentSafetyService` before the write; a
 * rank/placement/visibility claim FAILS the recommendation and writes nothing.
 * No new autonomy — the row executes only because a human already approved it.
 */

import { AiCommandRecommendationModel } from "../../../models/website-builder/AiCommandRecommendationModel";
import { PageModel } from "../../../models/website-builder/PageModel";
import { GbpContentSafetyService } from "../../gbp-automation/feature-services/GbpContentSafetyService";
import logger from "../../../lib/logger";
import {
  type ExecutionContext,
  resolvePageDraftId,
} from "../feature-utils/util.ai-command-shared";

/**
 * Descriptive schema.org keys whose values are owner-facing CLAIM text. Only these
 * are scanned by the honesty gate; structural/identifier keys (@type, url,
 * telephone, serviceType, …) can't carry a rank claim and would false-positive
 * the GBP reply validator's medical/outcome heuristics.
 *
 * `name`/`alternateName` are deliberately EXCLUDED: they are pure identifiers, not
 * claims Alloro is making. A real practice named "Pain-Free Dental Studio" would
 * otherwise trip the GBP safety heuristics and block an owner-approved write.
 */
const SCHEMA_DESCRIPTIVE_KEYS = new Set([
  "description",
  "slogan",
  "disambiguatingDescription",
  "keywords",
  "headline",
  "text",
]);

/** Recursively collect free-text values under descriptive keys for the honesty gate. */
export function collectSchemaCopy(
  value: unknown,
  key: string | null = null,
  acc: string[] = []
): string[] {
  if (typeof value === "string") {
    if (key && SCHEMA_DESCRIPTIVE_KEYS.has(key) && value.trim()) acc.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectSchemaCopy(item, key, acc);
  } else if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      collectSchemaCopy(childValue, childKey, acc);
    }
  }
  return acc;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeUpdatePageSeoSchema(
  rec: any,
  ctx: ExecutionContext
): Promise<void> {
  const meta = typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;

  const origPage = await PageModel.findRawById(rec.target_id);
  if (!origPage) {
    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: `Page ${rec.target_id} not found` }),
    });
    return;
  }

  const schemaJson = meta?.schema_json;
  // The whole codebase reads `seo_data.schema_json` as an ARRAY of JSON-LD
  // objects (consumers call `.some(...)` / guard with `Array.isArray`). Require
  // a non-empty array; a bare object (or empty) fails the recommendation and
  // writes nothing — writing a single object would crash the panel scorer and
  // silently disable the enrichment reader.
  const schemaIsValidArray = Array.isArray(schemaJson) && schemaJson.length > 0;
  if (!schemaIsValidArray) {
    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({
        success: false,
        error: "A non-empty schema_json array (of JSON-LD objects) is required in target_meta.",
      }),
    });
    return;
  }

  // Honesty gate — no rank/placement/visibility claim may enter the schema.
  const blocked = collectSchemaCopy(schemaJson)
    .map((text) => GbpContentSafetyService.validateGeneratedCopy(text))
    .filter((result) => !result.isSafe);
  if (blocked.length > 0) {
    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({
        success: false,
        error: `Honesty gate blocked schema copy: ${blocked.flatMap((b) => b.reasons).join("; ")}`,
      }),
    });
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
