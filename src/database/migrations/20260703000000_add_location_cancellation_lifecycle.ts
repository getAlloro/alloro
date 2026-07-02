import type { Knex } from "knex";

/**
 * Location cancellation lifecycle (plans/07032026-multi-location-billing, Phase B).
 *
 * Adds to `locations`:
 *   - status: 'active' | 'pending_cancellation' | 'cancelled'
 *     (NOT NULL, default 'active', CHECK constraint)
 *   - cancel_effective_at: when a pending cancellation takes effect
 *     (the subscription period end at the time of the cancel request)
 *   - cancelled_at: when the location became cancelled
 *   - index (organization_id, status) — listing + finalizer queries filter on both
 *
 * No data rewrites; every existing row defaults to 'active'.
 * Rollback drops the columns — status/cancellation history is lost (flagged
 * as a prod risk in the plan before merge; acceptable because the columns
 * are new and only this feature writes them).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("locations", (table) => {
    table.text("status").notNullable().defaultTo("active");
    table.timestamp("cancel_effective_at", { useTz: true }).nullable();
    table.timestamp("cancelled_at", { useTz: true }).nullable();
    table.index(["organization_id", "status"], "idx_locations_org_status");
  });
  await knex.raw(
    `ALTER TABLE locations ADD CONSTRAINT chk_locations_status
       CHECK (status IN ('active', 'pending_cancellation', 'cancelled'))`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    "ALTER TABLE locations DROP CONSTRAINT IF EXISTS chk_locations_status"
  );
  await knex.schema.alterTable("locations", (table) => {
    table.dropIndex(
      ["organization_id", "status"],
      "idx_locations_org_status"
    );
    table.dropColumn("status");
    table.dropColumn("cancel_effective_at");
    table.dropColumn("cancelled_at");
  });
}
