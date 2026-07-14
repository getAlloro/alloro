import { describe, expect, it, vi } from "vitest";
import type { Knex } from "knex";
import {
  down,
  up,
} from "../database/migrations/20260710000000_add_pms_type_to_organizations";

function migrationHarness(hasColumn: boolean) {
  const defaultTo = vi.fn();
  const notNullable = vi.fn(() => ({ defaultTo }));
  const string = vi.fn(() => ({ notNullable }));
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
  return {
    knex: { schema } as unknown as Knex,
    schema,
    alterTable,
    string,
    notNullable,
    defaultTo,
    dropColumn,
  };
}

describe("organizations.pms_type migration", () => {
  it("adds a non-null varchar(50) with the safe default", async () => {
    const harness = migrationHarness(false);

    await up(harness.knex);

    expect(harness.schema.hasColumn).toHaveBeenCalledWith(
      "organizations",
      "pms_type"
    );
    expect(harness.alterTable).toHaveBeenCalledOnce();
    expect(harness.string).toHaveBeenCalledWith("pms_type", 50);
    expect(harness.notNullable).toHaveBeenCalledOnce();
    expect(harness.defaultTo).toHaveBeenCalledWith("default");
  });

  it("drops only pms_type on rollback", async () => {
    const harness = migrationHarness(true);

    await down(harness.knex);

    expect(harness.alterTable).toHaveBeenCalledOnce();
    expect(harness.dropColumn).toHaveBeenCalledWith("pms_type");
  });

  it("is guarded when the desired schema state already exists", async () => {
    const upHarness = migrationHarness(true);
    const downHarness = migrationHarness(false);

    await up(upHarness.knex);
    await down(downHarness.knex);

    expect(upHarness.alterTable).not.toHaveBeenCalled();
    expect(downHarness.alterTable).not.toHaveBeenCalled();
  });
});
