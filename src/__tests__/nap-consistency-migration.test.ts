import { describe, expect, it, vi } from "vitest";
import type { Knex } from "knex";
import {
  down,
  up,
} from "../database/migrations/20260715140000_create_nap_consistency_observation";

/**
 * A4 migration resumability proofs (Dave review #166 item 3). Mirrors the
 * existing mocked-knex migration harness (see pms-type-migration.test.ts) — no
 * database is touched, so these assert the migration's SHAPE: that table
 * creation is guarded by `hasTable` and the schedule seed cannot throw on the
 * UNIQUE `schedules.agent_key`. A real partial-execution rehearsal against a
 * database is a dev-deploy step, not a unit test.
 */

const OBSERVATION_TABLE = "nap_consistency_observation";

function migrationHarness(hasTable: boolean) {
  const onConflict = vi.fn(() => ({ ignore }));
  const ignore = vi.fn();
  const merge = vi.fn();
  const insert = vi.fn((_row: Record<string, unknown>) => ({ onConflict, merge }));
  const del = vi.fn();
  const where = vi.fn(() => ({ del }));

  const schema = {
    hasTable: vi.fn(async () => hasTable),
    createTable: vi.fn(),
    dropTableIfExists: vi.fn(),
  };

  // knex is callable (knex("schedules")) AND carries .schema / .raw.
  const knex = Object.assign(
    vi.fn(() => ({ insert, where })),
    { schema, raw: vi.fn((sql: string) => sql) }
  );

  return { knex: knex as unknown as Knex, schema, insert, onConflict, ignore, merge, where, del };
}

describe("nap_consistency_observation migration — resumable after partial execution (§7)", () => {
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

  it("seeds the schedule with onConflict(agent_key).ignore() so a re-run cannot throw", async () => {
    const h = migrationHarness(true);

    await up(h.knex);

    expect(h.insert).toHaveBeenCalledOnce();
    expect(h.onConflict).toHaveBeenCalledWith("agent_key");
    expect(h.ignore).toHaveBeenCalledOnce();
    // .ignore(), never .merge(): re-running must not overwrite a schedule an
    // operator has already enabled or re-timed.
    expect(h.merge).not.toHaveBeenCalled();
  });

  it("seeds the schedule DISABLED — merging must never incur SerpApi cost", async () => {
    const h = migrationHarness(false);

    await up(h.knex);

    const seeded = h.insert.mock.calls[0][0];
    expect(seeded.agent_key).toBe("nap_consistency");
    expect(seeded.enabled).toBe(false);
  });

  it("down() removes the seeded schedule and drops the table if present", async () => {
    const h = migrationHarness(true);

    await down(h.knex);

    expect(h.where).toHaveBeenCalledWith({ agent_key: "nap_consistency" });
    expect(h.del).toHaveBeenCalledOnce();
    expect(h.schema.dropTableIfExists).toHaveBeenCalledWith(OBSERVATION_TABLE);
  });
});
