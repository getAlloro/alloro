// Knex migration plan for website project admin archive state.
//
// Actual execution file should live in:
//   src/database/migrations/20260514000000_add_website_project_archived_at.ts
//
// Schema:
//   table: website_builder.projects
//   column: archived_at timestamptz nullable
//
// Important:
//   Do not add ARCHIVED to website_builder.project_status.
//   Archive is admin visibility metadata, not lifecycle status.

exports.up = async function up(knex) {
  await knex.schema.withSchema("website_builder").alterTable("projects", (table) => {
    table.timestamp("archived_at", { useTz: true }).nullable();
  });

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_wb_projects_archived_at
      ON website_builder.projects (archived_at)
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`DROP INDEX IF EXISTS website_builder.idx_wb_projects_archived_at`);

  await knex.schema.withSchema("website_builder").alterTable("projects", (table) => {
    table.dropColumn("archived_at");
  });
};
