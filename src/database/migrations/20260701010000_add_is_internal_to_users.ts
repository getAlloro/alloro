import type { Knex } from "knex";

/**
 * Adds users.is_internal — flags Alloro team accounts so telemetry and other
 * reporting can exclude staff activity from client-facing metrics.
 * Backfills existing @getalloro.com accounts as a ONE-TIME seed.
 *
 * Analog: 20260604000005_add_is_sandbox_to_organizations.ts
 */

const INTERNAL_EMAIL_SUFFIX = "@getalloro.com";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("users", "is_internal");
  if (!hasColumn) {
    await knex.schema.alterTable("users", (table) => {
      table.boolean("is_internal").notNullable().defaultTo(false);
    });
  }

  // One-time backfill: any account on the internal email domain.
  await knex("users")
    .whereRaw("lower(email) LIKE ?", [`%${INTERNAL_EMAIL_SUFFIX}`])
    .update({ is_internal: true });
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("users", "is_internal");
  if (hasColumn) {
    await knex.schema.alterTable("users", (table) => {
      table.dropColumn("is_internal");
    });
  }
}
