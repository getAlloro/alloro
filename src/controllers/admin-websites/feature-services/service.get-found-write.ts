/**
 * Get-found write wiring — Alloro Funnel Engine Slice 1b.
 *
 * SCOPE — read this before relying on it.
 *
 * This module is the ROW CONTRACT for the new `page_seo_schema` target_type: it
 * builds (and can insert) a PENDING recommendation from an owner-approved
 * `schema_json`. It QUEUES; it never approves.
 *
 * What Slice 1b ships in production is the EXECUTE half. `executeBatch`
 * dispatches `page_seo_schema` → `executeUpdatePageSeoSchema`
 * (`service.ai-command-execute.ts`), reachable from
 * `POST /:id/ai-command/:batchId/execute`. An approved row of this type is
 * written to the batch's pinned draft, auto-published, and then verified against
 * the live page's `seo_data.schema_json` (`util.ai-command-verify`). A human
 * approves each row through the existing rail — no new autonomy.
 *
 * What Slice 1b does NOT ship is the PRODUCER. Nothing in the application
 * creates a `page_seo_schema` row today — `queueSeoSchemaRecommendation` below
 * has no production caller, so the type is inert until one exists. The intended
 * producer is the get-found batch, and it is blocked upstream: Slice 1a's
 * `runGetFoundChecker` (`services/ai-seo-audit/getFoundChecker.ts`) is itself
 * not invoked from any application path, so there is no get-found analysis
 * result in production to turn into a recommendation. Building one needs the
 * deferred pieces (hosted-page fetch, a GBP identity source, a get-found batch
 * type and its UI) — it is deliberately NOT faked here.
 *
 * So: do not describe this module as "turns a get-found finding into a pending
 * recommendation" end-to-end until that producer lands.
 *
 * Design notes that DO hold today: `page_seo_schema` is the only type that
 * writes `seo_data` (every other rides the existing HTML/structure handlers),
 * and the answer-first section restructure reuses the shipping `page_section`
 * handler unchanged (no new handler for it).
 */

import { AiCommandRecommendationModel } from "../../../models/website-builder/AiCommandRecommendationModel";

/** The single new recommendation target_type introduced by Slice 1b. */
export const SEO_SCHEMA_TARGET_TYPE = "page_seo_schema";

export interface SeoSchemaRecommendationInput {
  batchId: string;
  /** Page whose `seo_data.schema_json` will be written (the active/published id). */
  pageId: string;
  pagePath: string;
  /**
   * Owner-approved, fact-sourced ARRAY of schema.org JSON-LD objects to write to
   * `seo_data.schema_json` (the shape the whole codebase reads — consumers call
   * `.some(...)` and guard with `Array.isArray`). Only claims the practice
   * genuinely holds — the execute handler re-checks it through the honesty gate
   * before writing.
   */
  schemaJson: Record<string, unknown>[];
  /** Owner-facing rationale (e.g. built from the get-found missing-field set). */
  recommendation: string;
  sortOrder: number;
}

/**
 * Build the PENDING recommendation row (pure — no DB). Column shape matches the
 * rows `service.ai-command-analysis` inserts; `status` is left to the table
 * default (`pending`) so the row must be human-approved before it can execute.
 */
export function buildSeoSchemaRecommendationRow(
  input: SeoSchemaRecommendationInput
): Record<string, unknown> {
  return {
    batch_id: input.batchId,
    target_type: SEO_SCHEMA_TARGET_TYPE,
    target_id: input.pageId,
    target_label: `${input.pagePath} > structured data`,
    target_meta: JSON.stringify({
      page_path: input.pagePath,
      schema_json: input.schemaJson,
    }),
    recommendation: input.recommendation,
    instruction: `Write complete, owner-approved structured data (schema.org JSON-LD) to ${input.pagePath}.`,
    sort_order: input.sortOrder,
  };
}

/**
 * Queue the schema-write recommendation as PENDING. A human must approve it in
 * the existing rail before `executeBatch` runs it — this function adds no
 * autonomy and performs no live write itself.
 *
 * NOT CALLED IN PRODUCTION YET (see the module header). This is the entry point
 * the get-found batch will call once that producer is built; today only tests
 * exercise it. Treat "Slice 1b can queue a schema recommendation" as a
 * capability of the CONTRACT, not of the running system.
 */
export async function queueSeoSchemaRecommendation(
  input: SeoSchemaRecommendationInput
): Promise<void> {
  await AiCommandRecommendationModel.insertRow(buildSeoSchemaRecommendationRow(input));
}
