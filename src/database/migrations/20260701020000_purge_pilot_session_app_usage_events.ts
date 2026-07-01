import type { Knex } from "knex";

/**
 * One-time purge of Pilot-session telemetry rows (Mission Control's embedded
 * "view as user" support feature — see plans/06272026-embedded-organization-pilot-tab,
 * not a trial/client-account concept). These rows are staff-generated support-tool
 * activity, not client usage, and Pilot session writes are hard-blocked at ingestion
 * as of this deploy (see AppTelemetryIngestionService). Irreversible — see
 * plans/07012026-telemetry-internal-filtering/spec.html Risk section.
 */

export async function up(knex: Knex): Promise<void> {
  await knex("app_usage_events").where({ is_pilot_session: true }).del();
}

export async function down(): Promise<void> {
  // No-op: deleted rows cannot be restored. Accepted, documented data cleanup —
  // these are staff support-session rows, not client data.
}
