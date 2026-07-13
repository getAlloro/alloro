/**
 * Execution reference - add organizations.pms_type.
 *
 * The runnable TypeScript Knex migration is
 * src/database/migrations/20260710000000_add_pms_type_to_organizations.ts.
 * This plan artifact mirrors its reversible DDL for review.
 *
 * Production safety:
 * - Additive organizations column only.
 * - Existing and new rows resolve to "default"; no organization is silently
 *   assigned the DentalEMR parser.
 * - No index: reads already address organizations by primary key.
 * - Down drops only this new column.
 */

exports.up = async function up(knex) {
  await knex.schema.alterTable("organizations", (table) => {
    table.string("pms_type", 50).notNullable().defaultTo("default");
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable("organizations", (table) => {
    table.dropColumn("pms_type");
  });
};
