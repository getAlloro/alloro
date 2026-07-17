import type { Knex } from "knex";
import { describe, expect, it, vi } from "vitest";
import {
  down,
  up,
} from "../database/migrations/20260717010000_add_schedule_run_logical_key";

function migrationHarness(hasColumn: boolean) {
  const nullable = vi.fn();
  const string = vi.fn(() => ({ nullable }));
  const dropColumn = vi.fn();
  const table = { string, dropColumn };
  const alterTable = vi.fn(
    async (_tableName: string, callback: (builder: typeof table) => void) => {
      callback(table);
    }
  );
  const schema = {
    hasColumn: vi.fn(async () => hasColumn),
    alterTable,
  };
  const raw = vi.fn(async () => undefined);
  const knex = { schema, raw } as unknown as Knex;

  return {
    knex,
    schema,
    alterTable,
    string,
    nullable,
    dropColumn,
    raw,
  };
}

describe("schedule_runs logical-run ownership migration", () => {
  it("adds a nullable key and a resumable composite unique index", async () => {
    const harness = migrationHarness(false);

    await up(harness.knex);

    expect(harness.schema.hasColumn).toHaveBeenCalledWith(
      "schedule_runs",
      "logical_run_key"
    );
    expect(harness.alterTable).toHaveBeenCalledWith(
      "schedule_runs",
      expect.any(Function)
    );
    expect(harness.string).toHaveBeenCalledWith("logical_run_key", 255);
    expect(harness.nullable).toHaveBeenCalledOnce();
    expect(harness.raw).toHaveBeenCalledWith(
      expect.stringContaining("CREATE UNIQUE INDEX IF NOT EXISTS")
    );
    expect(harness.raw).toHaveBeenCalledWith(
      expect.stringContaining("(schedule_id, logical_run_key)")
    );
  });

  it("re-runs without re-adding the column and still repairs a missing index", async () => {
    const harness = migrationHarness(true);

    await up(harness.knex);

    expect(harness.alterTable).not.toHaveBeenCalled();
    expect(harness.raw).toHaveBeenCalledWith(
      expect.stringContaining("CREATE UNIQUE INDEX IF NOT EXISTS")
    );
  });

  it("drops the index before dropping only the additive column", async () => {
    const harness = migrationHarness(true);

    await down(harness.knex);

    expect(harness.raw).toHaveBeenCalledWith(
      expect.stringContaining("DROP INDEX IF EXISTS")
    );
    expect(harness.dropColumn).toHaveBeenCalledWith("logical_run_key");
    expect(harness.raw.mock.invocationCallOrder[0]).toBeLessThan(
      harness.alterTable.mock.invocationCallOrder[0]
    );
  });
});
