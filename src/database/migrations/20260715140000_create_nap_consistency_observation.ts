import { Knex } from "knex";

/**
 * Alloro Funnel Engine A4 — Citations & NAP Consistency Monitor.
 *
 * Creates ONE thing: `nap_consistency_observation` — a time-series log (one row
 * per location per run) of NAP consistency across external sources. A log,
 * never a score.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO SCHEDULE SEED — deliberate (Dave review #166 round 3 item 1, §10.3).
 *
 * An earlier revision seeded a DISABLED `schedules` row for `agent_key =
 * nap_consistency` with `.onConflict("agent_key").ignore()`, and `down()`
 * deleted that row by key. Those two are contradictory: `.ignore()` means a
 * pre-existing operator-owned row is LEFT ALONE — up() did not create it — yet
 * down() deleted it regardless. A rollback could therefore destroy an
 * operator's tuned schedule this migration never owned.
 *
 * The exit taken is the one that dissolves the problem rather than managing it:
 * this migration does not write to `schedules` at all, so no row exists whose
 * ownership could be ambiguous, and `down()` is confined to the table this
 * migration actually created. Ownership-safe BY CONSTRUCTION, not by a
 * provenance check that must itself be kept correct forever.
 *
 * Nothing is lost by dropping the seed. The seeded row was `enabled = false` —
 * it ran nothing. Its only function was to appear in the admin Schedules page
 * so an operator could switch it on. That page already creates schedules:
 * `POST /api/admin/schedules` (AdminSchedulesController.createSchedule) accepts
 * `agent_key` and rejects a duplicate with 409. The `nap_consistency` handler
 * stays registered in `services/agentRegistry.ts`, so an operator-created row
 * resolves to it immediately. The schedule becomes operator-created and
 * therefore operator-OWNED — which is what it always was in substance.
 *
 * The rejected alternative was migration-owned provenance (a column marking the
 * rows this migration inserted, deleting only on a match). That adds a
 * permanent column to the SHARED `schedules` table — schema every agent carries
 * forever — to solve a problem that exists only because we seed. More
 * production surface, not less.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * RESUMABLE (Dave review #166 round 1 item 3): table creation is guarded by a
 * `hasTable` check, so a re-run against a database where this migration
 * partially landed converges instead of throwing "already exists".
 *
 * PRODUCTION RISK (AGENTS.md migration safety):
 *   - up()   — additive only. Creates one new table. No data rewrite, no
 *              backfill, no lock on an existing table, and no write to any
 *              table this migration did not create. Safe against production.
 *   - down() — drops `nap_consistency_observation`, destroying the observation
 *              history it holds. That is the inherent, accepted semantic of
 *              reversing a create-table migration, and it is ownership-safe:
 *              this migration created that table. It is a LOG — rebuildable by
 *              re-running the monitor — and no other table references it, so
 *              the drop cannot cascade into anything else.
 *   - Assumes `organizations` and `locations` exist (both long-established) and
 *              that `gen_random_uuid()` is available, as used by existing
 *              migrations in this directory.
 *   - Dev-only assumption: NONE. This migration has never been deployed to any
 *              environment (branch is unmerged), so removing the seed cannot
 *              strand an already-seeded row anywhere.
 */

const OBSERVATION_TABLE = "nap_consistency_observation";

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
}

export async function down(knex: Knex): Promise<void> {
  // ONLY the table this migration created. Deliberately touches nothing else —
  // in particular it must never delete from `schedules`: any row there for
  // `nap_consistency` was created by an operator, not by up(), and destroying
  // another owner's data on rollback is exactly what round 3 rejected (§10.3).
  await knex.schema.dropTableIfExists(OBSERVATION_TABLE);
}
