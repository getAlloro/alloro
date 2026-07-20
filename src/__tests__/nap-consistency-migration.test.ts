import { describe, expect, it, vi } from "vitest";
import type { Knex } from "knex";
import {
  down,
  up,
} from "../database/migrations/20260715140000_create_nap_consistency_observation";

/**
 * A4 migration proofs.
 *
 * SCOPE HONESTY: this mirrors the existing mocked-knex migration harness (see
 * pms-type-migration.test.ts). No database is touched, so every assertion here
 * is a SHAPE assertion about which knex calls the migration makes — NOT DDL
 * proof. It proves the migration never issues a write against `schedules`; it
 * does not prove the table it creates is valid PostgreSQL. A real execution
 * against a database is a dev-deploy step (the acceptance artifact's T14/T15
 * stay pending).
 *
 * Two things are locked here:
 *   1. Resumability (round 1 item 3) — table creation guarded by `hasTable`.
 *   2. Ownership safety (round 3 item 1, §10.3) — the migration does not write
 *      to `schedules` in EITHER direction. The harness records every table name
 *      knex is called with, so a re-introduced seed or a re-introduced `down()`
 *      delete fails the suite instead of shipping.
 */

const OBSERVATION_TABLE = "nap_consistency_observation";

function migrationHarness(hasTable: boolean) {
  const ignore = vi.fn();
  const onConflict = vi.fn(() => ({ ignore }));
  const merge = vi.fn();
  const insert = vi.fn((_row: Record<string, unknown>) => ({ onConflict, merge }));
  const del = vi.fn();
  const update = vi.fn();
  const where = vi.fn(() => ({ del, update }));

  const schema = {
    hasTable: vi.fn(async () => hasTable),
    createTable: vi.fn(),
    dropTableIfExists: vi.fn(),
  };

  // Every table name the migration opens a query builder on. This is the
  // ownership tripwire: `schedules` must never appear.
  const tablesTouched: string[] = [];

  // knex is callable (knex("some_table")) AND carries .schema / .raw.
  const knex = Object.assign(
    vi.fn((table: string) => {
      tablesTouched.push(table);
      return { insert, where };
    }),
    { schema, raw: vi.fn((sql: string) => sql) }
  );

  return {
    knex: knex as unknown as Knex,
    schema,
    insert,
    onConflict,
    ignore,
    merge,
    where,
    del,
    update,
    tablesTouched,
  };
}

describe("nap_consistency_observation migration — resumable after partial execution", () => {
  it("creates the table only when it does not already exist", async () => {
    const h = migrationHarness(false);

    await up(h.knex);

    expect(h.schema.hasTable).toHaveBeenCalledWith(OBSERVATION_TABLE);
    expect(h.schema.createTable).toHaveBeenCalledOnce();
  });

  it("SKIPS table creation on a re-run where the table already landed", async () => {
    const h = migrationHarness(true);

    await up(h.knex);

    // The bug this guards: an unguarded createTable throws "already exists" and
    // wedges the deploy when the migration is resumed against a partial state.
    expect(h.schema.hasTable).toHaveBeenCalledWith(OBSERVATION_TABLE);
    expect(h.schema.createTable).not.toHaveBeenCalled();
  });
});

/**
 * Dave review #166 round 3 item 1 (§10.3): "A rollback can therefore delete
 * data this migration did not create."
 *
 * The fix removes the schedule seed entirely, so ownership is not checked at
 * runtime — it is structural. These tests are the structural guard: they fail
 * the moment a write to `schedules` reappears in either direction.
 */
describe("nap_consistency_observation migration — ownership safety (§10.3)", () => {
  it("up() NEVER writes to `schedules` — it seeds no row it would then own", async () => {
    const h = migrationHarness(false);

    await up(h.knex);

    expect(h.tablesTouched).not.toContain("schedules");
    expect(h.insert).not.toHaveBeenCalled();
    // Not merely "guarded" — absent. A seed guarded by onConflict().ignore() is
    // precisely the row up() does NOT create and must therefore never delete.
    expect(h.onConflict).not.toHaveBeenCalled();
    expect(h.merge).not.toHaveBeenCalled();
  });

  it("down() NEVER deletes from `schedules` — an operator's row is not ours to destroy", async () => {
    const h = migrationHarness(true);

    await down(h.knex);

    // The exact defect from round 3: knex("schedules").where({agent_key}).del().
    expect(h.tablesTouched).not.toContain("schedules");
    expect(h.where).not.toHaveBeenCalled();
    expect(h.del).not.toHaveBeenCalled();
  });

  it("down() drops ONLY the table this migration created", async () => {
    const h = migrationHarness(true);

    await down(h.knex);

    expect(h.schema.dropTableIfExists).toHaveBeenCalledOnce();
    expect(h.schema.dropTableIfExists).toHaveBeenCalledWith(OBSERVATION_TABLE);
  });

  it("up() touches no table other than the one it creates", async () => {
    const h = migrationHarness(false);

    await up(h.knex);

    // Catches ownership creep generally, not just the `schedules` instance:
    // up() is additive and must not write anyone else's rows.
    expect(h.tablesTouched).toEqual([]);
    expect(h.schema.createTable).toHaveBeenCalledWith(
      OBSERVATION_TABLE,
      expect.any(Function)
    );
  });
});
