// Per-site Rybbit reporting timezone — knex form of the migration.
// The real migration is authored in TypeScript under
// src/database/migrations/ at execution time, matching the analog
// 20260312000001_add_rybbit_site_id_to_projects.ts. Additive + nullable.

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema
    .withSchema("website_builder")
    .alterTable("projects", (table) => {
      table.string("rybbit_time_zone", 64).nullable();
    });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema
    .withSchema("website_builder")
    .alterTable("projects", (table) => {
      table.dropColumn("rybbit_time_zone");
    });
};
