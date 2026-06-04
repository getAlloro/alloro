/**
 * Plan artifact — mirrors the EXECUTABLE migration that T1 creates during execution at:
 *   src/database/migrations/20260604000000_add_is_sandbox_to_organizations.ts
 *
 * The live project uses TypeScript knex migrations; this .js is the convention copy.
 * Analog: src/database/migrations/20260323000001_add_billing_quantity_override.ts
 *
 * Adds organizations.is_sandbox (boolean, NOT NULL, default false) and backfills the
 * known sandbox/test orgs by normalized name. After this, sandbox membership lives in
 * the column — the hardcoded name list is removed from runtime code.
 */

const SANDBOX_NORMALIZED_NAMES = [
  "test",
  "hamiltonwise'sorganization",
  "alloroteam'sorganization",
];

exports.up = async function up(knex) {
  await knex.schema.alterTable("organizations", (table) => {
    table.boolean("is_sandbox").notNullable().defaultTo(false);
  });

  // One-time backfill: lower(name) with all whitespace stripped, matched to the set.
  await knex("organizations")
    .whereRaw("lower(regexp_replace(name, '\\s+', '', 'g')) = ANY(?)", [
      SANDBOX_NORMALIZED_NAMES,
    ])
    .update({ is_sandbox: true });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable("organizations", (table) => {
    table.dropColumn("is_sandbox");
  });
};
