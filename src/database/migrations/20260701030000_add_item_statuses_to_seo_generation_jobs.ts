import { Knex } from "knex";

/**
 * Adds item_statuses jsonb column to website_builder.seo_generation_jobs
 * (Rev 5 of plans/07012026-seo-generator-revamp): per-item bulk-generation
 * progress, so the frontend n/n counter can show a live grouped breakdown
 * (pending/processing/done/failed) instead of only the aggregate counts.
 *
 * Mirrors the existing failed_items jsonb column on this same table — same
 * precedent, no new table. Each array entry: { id, title, status } where
 * status is "pending" | "processing" | "done" | "failed".
 *
 * Additive only. Not-null with a '[]' default so callers never see null;
 * no backfill needed since existing rows simply start with an empty array.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema("website_builder").alterTable("seo_generation_jobs", (table) => {
    table.jsonb("item_statuses").notNullable().defaultTo("[]");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("website_builder").alterTable("seo_generation_jobs", (table) => {
    table.dropColumn("item_statuses");
  });
}
