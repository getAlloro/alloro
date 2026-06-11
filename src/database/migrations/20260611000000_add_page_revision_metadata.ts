import type { Knex } from "knex";

/**
 * Snapshot provenance metadata for the website editor versioning workflow.
 *
 * change_source — how a row's content came to be written:
 *                 save | publish | restore | restore-section | find-replace
 * revision_note — optional user-entered note captured at save time.
 *
 * Additive + nullable only: no backfill, no index, zero impact on readers.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema("website_builder")
    .alterTable("pages", (t) => {
      t.string("change_source", 20).nullable();
      t.string("revision_note", 255).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema("website_builder")
    .alterTable("pages", (t) => {
      t.dropColumn("revision_note");
      t.dropColumn("change_source");
    });
}
