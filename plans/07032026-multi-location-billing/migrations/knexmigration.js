/**
 * Multi-Location Billing — Phase B: location cancellation lifecycle
 *
 * Adds to `locations`:
 *   - status: 'active' | 'pending_cancellation' | 'cancelled' (NOT NULL, default 'active', CHECK constraint)
 *   - cancel_effective_at: timestamptz null — when a pending cancellation takes effect
 *   - cancelled_at: timestamptz null — when the location became cancelled
 *   - index (organization_id, status)
 *
 * No data rewrites; all existing rows default to 'active'.
 * Rollback: drops the columns — status history is lost (flag as prod risk before merge).
 *
 * Final file lands at src/database/migrations/<stamp>_add_location_cancellation_lifecycle.ts
 * (TypeScript, matching repo migration style — this scaffold is the contract).
 */

// TODO: fill during execution
// exports.up = async function up(knex) {
//   await knex.schema.alterTable("locations", (table) => {
//     table.text("status").notNullable().defaultTo("active");
//     table.timestamp("cancel_effective_at", { useTz: true }).nullable();
//     table.timestamp("cancelled_at", { useTz: true }).nullable();
//     table.index(["organization_id", "status"], "idx_locations_org_status");
//   });
//   await knex.raw(
//     "ALTER TABLE locations ADD CONSTRAINT chk_locations_status CHECK (status IN ('active', 'pending_cancellation', 'cancelled'))"
//   );
// };
//
// exports.down = async function down(knex) {
//   await knex.raw("ALTER TABLE locations DROP CONSTRAINT IF EXISTS chk_locations_status");
//   await knex.schema.alterTable("locations", (table) => {
//     table.dropIndex(["organization_id", "status"], "idx_locations_org_status");
//     table.dropColumn("status");
//     table.dropColumn("cancel_effective_at");
//     table.dropColumn("cancelled_at");
//   });
// };
