import { Knex } from "knex";

/**
 * Alloro Funnel Engine A4 — Citations & NAP Consistency Monitor.
 * Additive + reversible. Two things:
 *   1. `nap_consistency_observation` — a time-series log (one row per location per
 *      run) of NAP consistency across external sources. A log, never a score.
 *   2. Seeds the recurring `nap_consistency` schedule ⚠️ DISABLED (enabled=false)
 *      — it ships ready but incurs NO SerpApi cost until Corey intentionally
 *      enables it. Dave: this row is deliberately disabled; do not enable on merge.
 *
 * RESUMABLE (Dave review #166): every step is guarded, so a re-run against a
 * database where this migration partially landed converges instead of throwing.
 *   - Table creation is behind a `hasTable` check.
 *   - The schedule seed is `onConflict("agent_key").ignore()`. NOTE: a duplicate
 *     row is not actually possible — `schedules.agent_key` carries a UNIQUE
 *     constraint (20260315000001_create_schedules_tables.ts:8), so a blind insert
 *     would ERROR on a pre-existing row rather than duplicate it. The guard turns
 *     that hard failure into a no-op, and deliberately does NOT merge: it must
 *     never re-enable or re-schedule a row an operator has already tuned.
 */

const OBSERVATION_TABLE = "nap_consistency_observation";
const AGENT_KEY = "nap_consistency";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(OBSERVATION_TABLE))) {
    await knex.schema.createTable(OBSERVATION_TABLE, (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      table
        .integer("organization_id")
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      table
        .integer("location_id")
        .notNullable()
        .references("id")
        .inTable("locations")
        .onDelete("CASCADE");
      table.date("run_date").notNullable();
      table.integer("sources_checked").notNullable().defaultTo(0);
      table.integer("consistent_count").notNullable().defaultTo(0);
      table.integer("conflict_count").notNullable().defaultTo(0);
      // Each conflict: { source, sourceHost, matchState } — the specific listing
      // that disagrees, so an operator can act. "worth double-checking", not a
      // confirmed error (directory scraping is noisy).
      table.jsonb("conflicts").notNullable().defaultTo("[]");
      table.timestamp("observed_at", { useTz: true }).notNullable();
      table.timestamps(true, true);

      table.unique(["location_id", "run_date"], {
        indexName: "nap_consistency_observation_idem",
      });
      table.index(["organization_id", "location_id", "observed_at"]);
    });
  }

  // Seed the recurring monitor schedule — DISABLED. Ready, but no cost until enabled.
  // Guarded: a re-run must not throw on the UNIQUE agent_key, and must never
  // overwrite an operator's tuning (hence .ignore(), not .merge()).
  const now = new Date();
  const nextRun = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  await knex("schedules")
    .insert({
      agent_key: AGENT_KEY,
      display_name: "Citations & NAP Consistency Monitor",
      description:
        "Recurring NAP-consistency check across external listings for all onboarded locations. Observe + flag conflicts; never a rank promise. SEEDED DISABLED — enable to set live (incurs SerpApi cost).",
      schedule_type: "interval_days",
      interval_days: 14,
      timezone: "UTC",
      enabled: false,
      next_run_at: nextRun,
      created_at: now,
      updated_at: now,
    })
    .onConflict("agent_key")
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex("schedules").where({ agent_key: AGENT_KEY }).del();
  await knex.schema.dropTableIfExists(OBSERVATION_TABLE);
}
