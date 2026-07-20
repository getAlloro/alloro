import type { Knex } from "knex";

/**
 * Findability Sensor (A5, slice 1) — additive, reversible schema.
 *
 * Two tables, no schedule seed:
 *   - `findability_sensor_readings`  one honest SoLV snapshot per
 *     (organization, location, keyword-family, run_date). Holds the aggregated
 *     reading (SoLV/ARP/ATRP + coverage) and the raw per-pin ranks as jsonb —
 *     the time-series the future Reader/Watcher slices read, and the substrate
 *     the fleet flywheel will one day sit on (spec Rev 2).
 *   - `findability_sensor_keyword_configs`  the done-for-you + owner-steerable
 *     keyword/area config per location. `enabled` defaults FALSE (Value #2:
 *     every lever ships OFF until the owner/operator turns it on).
 *
 * NO SCHEDULE IS SEEDED (Rev 4, review finding #2). This slice ships the sensor
 * only — there is no `agentRegistry` handler for a `findability_sensor` key, so
 * a seeded row could never produce a dispatchable run even if it were enabled
 * (it also carried no `next_run_at`, and findDueSchedules requires
 * `enabled = true AND next_run_at <= now()`). Seeding a row that cannot run is
 * dead config that reads as a shipped capability. The schedule belongs in the
 * slice that ships the fleet executor + its registry handler, and lands with it.
 *
 * Both uniqueness rules are enforced by the DB, not by app-level check-then-write
 * (a TOCTOU race under concurrent scheduled + manual writes). Both use
 * COALESCE(location_id, -1) because Postgres treats NULLs as DISTINCT in a plain
 * unique index, so a null location would otherwise escape the constraint.
 *
 * Safety: all additive (two new tables); no locks on or changes to existing
 * tables; fully reversible down(); idempotent (table guards + IF NOT EXISTS
 * indexes). No data rewrites, no seeds.
 * Spec: plans/07152026-findability-sensor/spec.html
 */

const READINGS = "findability_sensor_readings";
const CONFIGS = "findability_sensor_keyword_configs";

export async function up(knex: Knex): Promise<void> {
  const hasReadings = await knex.schema.hasTable(READINGS);
  if (!hasReadings) {
    await knex.schema.createTable(READINGS, (t) => {
      t.increments("id").primary();
      t.integer("organization_id").notNullable();
      t.integer("location_id").nullable();

      // The tracked keyword-family and where it came from.
      t.text("keyword").notNullable();
      t.text("keyword_source"); // 'gsc_demand' | 'service_list' (app-level enum, no DB CHECK)

      // Sampling parameters, persisted for reproducibility of this reading.
      t.integer("grid_size").notNullable();
      t.decimal("radius_miles", 6, 2).notNullable();
      t.decimal("center_lat", 10, 7);
      t.decimal("center_lng", 10, 7);

      // The honest aggregate. solv_percent/arp/atrp are NULLABLE on purpose:
      // null = "no known pin to read" (all pins errored), distinct from 0.
      t.decimal("solv_percent", 6, 2).nullable();
      t.decimal("arp", 6, 2).nullable();
      t.decimal("atrp", 6, 2).nullable();
      t.integer("total_pins").notNullable().defaultTo(0);
      t.integer("known_pins").notNullable().defaultTo(0);
      t.integer("unknown_pins").notNullable().defaultTo(0);
      t.integer("ranked_pins").notNullable().defaultTo(0);
      t.integer("top_three_pins").notNullable().defaultTo(0);
      t.decimal("coverage", 5, 2).notNullable().defaultTo(0); // known/total confidence

      // Raw per-pin outcomes (rank + competitors seen) — the future map + audit trail.
      t.jsonb("per_pin").notNullable().defaultTo("[]");

      // Paige honesty caveat: was the scan run while the business was open?
      t.boolean("open_hours_known").notNullable().defaultTo(false);

      t.timestamp("observed_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.date("run_date").notNullable(); // idempotency key: one snapshot per run-date
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

      t.index(["organization_id", "location_id"], "fs_readings_org_loc_idx");
      t.index(["observed_at"], "fs_readings_observed_at_idx");
    });
  }

  // Enforce "one snapshot per (org, location, keyword, run_date)" at the DB.
  // Real location ids are positive, so -1 is a safe sentinel for "no location".
  // Created outside the table guard with IF NOT EXISTS so the migration
  // converges to the enforced shape even on a DB that ran an earlier draft.
  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS fs_readings_dedup_uidx ON ${READINGS} ` +
      `(organization_id, COALESCE(location_id, -1), keyword, run_date)`,
  );

  const hasConfigs = await knex.schema.hasTable(CONFIGS);
  if (!hasConfigs) {
    await knex.schema.createTable(CONFIGS, (t) => {
      t.increments("id").primary();
      t.integer("organization_id").notNullable();
      t.integer("location_id").nullable();

      // The resolved, owner-steerable keyword families: [{keyword, source}].
      t.jsonb("keywords").notNullable().defaultTo("[]");
      t.integer("grid_size").notNullable().defaultTo(7);
      t.decimal("radius_miles", 6, 2).notNullable().defaultTo(2.5);

      // Owner-steerable on/off. Ships OFF (Value #2 — every lever default OFF).
      t.boolean("enabled").notNullable().defaultTo(false);

      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

      // Non-unique lookup index: findForLocation reads by the literal
      // (organization_id, location_id) pair, which the COALESCE expression
      // index below cannot serve. Both indexes earn their keep.
      t.index(["organization_id", "location_id"], "fs_configs_org_loc_idx");
    });
  }

  // Enforce "one keyword configuration per (organization, location)" at the DB
  // (review finding #1). Mirrors the readings dedup index above, including the
  // COALESCE so a null-location config cannot escape the constraint.
  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS fs_configs_dedup_uidx ON ${CONFIGS} ` +
      `(organization_id, COALESCE(location_id, -1))`,
  );
}

export async function down(knex: Knex): Promise<void> {
  // Dropping each table drops its indexes with it. No schedules row is seeded
  // by up(), so there is none to remove here.
  await knex.schema.dropTableIfExists(CONFIGS);
  await knex.schema.dropTableIfExists(READINGS);
}
