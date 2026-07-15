/**
 * Get-found write wiring — Alloro Funnel Engine Slice 1b.
 *
 * Turns a Slice-1a get-found finding plus an owner-approved `schema_json` into a
 * PENDING recommendation row of the new `page_seo_schema` target_type, inserted
 * on an existing ai-command batch. It QUEUES; it never approves. A human approves
 * the row through the existing rail, and `executeBatch` then runs the schema-write
 * handler (`executeUpdatePageSeoSchema`) and auto-publishes the pinned draft — so
 * no new autonomy is added here. The `page_seo_schema` type is the only one that
 * writes `seo_data`; every other rides the existing HTML/structure handlers, and
 * the answer-first section restructure reuses the shipping `page_section` handler
 * unchanged (no new handler for it).
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
   * Owner-approved, fact-sourced schema.org object to write to
   * `seo_data.schema_json`. Only claims the practice genuinely holds — the
   * execute handler re-checks it through the honesty gate before writing.
   */
  schemaJson: Record<string, unknown>;
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
 */
export async function queueSeoSchemaRecommendation(
  input: SeoSchemaRecommendationInput
): Promise<void> {
  await AiCommandRecommendationModel.insertRow(buildSeoSchemaRecommendationRow(input));
}
