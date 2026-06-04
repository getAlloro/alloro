import type { Knex } from "knex";

/**
 * Adds organizations.is_sandbox — replaces Mission Control's hardcoded sandbox
 * name list (was MissionControlModel.isSandboxOrganization) with a real DB flag.
 * Backfills the existing sandbox/test orgs by normalized name as a ONE-TIME seed;
 * the names live nowhere else in the codebase after this.
 *
 * Analog: 20260323000001_add_billing_quantity_override.ts
 */

const SANDBOX_NORMALIZED_NAMES = [
  "test",
  "hamiltonwise'sorganization",
  "alloroteam'sorganization",
];

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("organizations", "is_sandbox");
  if (!hasColumn) {
    await knex.schema.alterTable("organizations", (table) => {
      table.boolean("is_sandbox").notNullable().defaultTo(false);
    });
  }

  // One-time backfill: lower(name) with all whitespace stripped, matched to the set.
  await knex("organizations")
    .whereRaw("lower(regexp_replace(name, '\\s+', '', 'g')) = ANY(?)", [
      SANDBOX_NORMALIZED_NAMES,
    ])
    .update({ is_sandbox: true });
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("organizations", "is_sandbox");
  if (hasColumn) {
    await knex.schema.alterTable("organizations", (table) => {
      table.dropColumn("is_sandbox");
    });
  }
}
