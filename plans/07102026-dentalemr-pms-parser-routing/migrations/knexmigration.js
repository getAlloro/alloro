/**
 * Rev 2 planning reference - make organizations.pms_type a nullable
 * assignment while preserving the runtime default parser.
 *
 * Execution must add a NEW follow-up TypeScript Knex migration. Do not rewrite
 * src/database/migrations/20260710000000_add_pms_type_to_organizations.ts,
 * because it may already exist in a database's migration history.
 *
 * Production safety:
 * - Converts only the legacy explicit "default" assignment to null.
 * - Custom parser keys remain unchanged.
 * - New rows inherit null because the column has no database default.
 * - No index: reads already address organizations by primary key.
 * - Down restores null rows to "default" before restoring NOT NULL.
 */

exports.up = async function up(knex) {
  await knex.schema.alterTable("organizations", (table) => {
    // On PostgreSQL, nullable().alter() drops both the legacy DEFAULT and the
    // NOT NULL constraint. defaultTo(null) would leave an explicit DEFAULT null.
    table.string("pms_type", 50).nullable().alter();
  });
  await knex("organizations")
    .where({ pms_type: "default" })
    .update({ pms_type: null });
};

exports.down = async function down(knex) {
  await knex("organizations")
    .whereNull("pms_type")
    .update({ pms_type: "default" });
  await knex.schema.alterTable("organizations", (table) => {
    table.string("pms_type", 50).notNullable().defaultTo("default").alter();
  });
};
