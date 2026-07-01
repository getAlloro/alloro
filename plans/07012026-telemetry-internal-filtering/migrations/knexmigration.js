// Migration 1 of 2 — add users.is_internal, backfilled by @getalloro.com domain.
// Filename convention on execution: src/database/migrations/{timestamp}_add_is_internal_to_users.ts

const TABLE = "users";
const INTERNAL_DOMAIN = "@getalloro.com";

exports.up = async function up(knex) {
  const hasColumn = await knex.schema.hasColumn(TABLE, "is_internal");
  if (!hasColumn) {
    await knex.schema.alterTable(TABLE, (table) => {
      table.boolean("is_internal").notNullable().defaultTo(false);
    });
  }

  // One-time backfill: any user whose email ends in @getalloro.com is internal staff.
  await knex(TABLE)
    .whereRaw("lower(email) LIKE ?", [`%${INTERNAL_DOMAIN}`])
    .update({ is_internal: true });
};

exports.down = async function down(knex) {
  const hasColumn = await knex.schema.hasColumn(TABLE, "is_internal");
  if (hasColumn) {
    await knex.schema.alterTable(TABLE, (table) => {
      table.dropColumn("is_internal");
    });
  }
};

// ---------------------------------------------------------------------------

// Migration 2 of 2 — purge existing Pilot-session telemetry rows (support/admin
// "view as user" embedded sessions, see plans/06272026-embedded-organization-pilot-tab).
// These rows are staff-generated support-tool telemetry, not real client usage.
// Filename convention on execution: src/database/migrations/{timestamp}_purge_pilot_session_app_usage_events.ts

const APP_USAGE_EVENTS_TABLE = "app_usage_events";

exports.up = async function up(knex) {
  // Irreversible data purge — see spec Risk section for production-safety notes.
  await knex(APP_USAGE_EVENTS_TABLE).where({ is_pilot_session: true }).del();
};

exports.down = async function down(knex) {
  // No-op: deleted rows cannot be restored. Documented as an accepted, irreversible
  // data cleanup — the rows are staff support-session telemetry, not client data.
  return Promise.resolve();
};
