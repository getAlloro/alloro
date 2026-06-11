/**
 * Rev 1 (T14): snapshot provenance metadata on website_builder.pages
 *
 * change_source  string(20)  nullable — how the row's content was written:
 *                save | publish | restore | restore-section | find-replace
 * revision_note  string(255) nullable — optional user-entered note captured at save time
 *
 * Additive + nullable only. No backfill, no index.
 *
 * NOTE: the repo's migrations live in src/database/migrations as TypeScript
 * (analog: 20260324000001_add_artifact_page_columns.ts). During execution,
 * create the real migration there following that analog; this scaffold is the
 * plan-folder reference copy.
 */

exports.up = async function up(knex) {
  // TODO: fill during execution
  await knex.schema.withSchema("website_builder").alterTable("pages", (table) => {
    table.string("change_source", 20).nullable();
    table.string("revision_note", 255).nullable();
  });
};

exports.down = async function down(knex) {
  // TODO: fill during execution
  await knex.schema.withSchema("website_builder").alterTable("pages", (table) => {
    table.dropColumn("change_source");
    table.dropColumn("revision_note");
  });
};
