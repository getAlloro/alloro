import type { Knex } from "knex";
import { describe, expect, it, vi } from "vitest";
import {
  down,
  up,
} from "../database/migrations/20260713000000_make_pms_type_nullable";

function migrationHarness(hasColumn: boolean) {
  const alter = vi.fn();
  const defaultTo = vi.fn(() => ({ alter }));
  const nullable = vi.fn(() => ({ alter }));
  const notNullable = vi.fn(() => ({ defaultTo }));
  const string = vi.fn(() => ({ nullable, notNullable }));
  const table = { string };
  const alterTable = vi.fn(
    async (_tableName: string, callback: (builder: typeof table) => void) => {
      callback(table);
    }
  );
  const schema = {
    hasColumn: vi.fn(async () => hasColumn),
    alterTable,
  };
  const update = vi.fn(async () => 1);
  const query = {
    where: vi.fn(() => ({ update })),
    whereNull: vi.fn(() => ({ update })),
  };
  const knex = Object.assign(vi.fn(() => query), { schema });

  return {
    knex: knex as unknown as Knex,
    schema,
    alterTable,
    string,
    nullable,
    notNullable,
    defaultTo,
    alter,
    query,
    update,
  };
}

describe("organizations.pms_type nullable migration", () => {
  it("drops the stored default semantics before converting legacy defaults to null", async () => {
    const harness = migrationHarness(true);

    await up(harness.knex);

    expect(harness.alterTable).toHaveBeenCalledWith(
      "organizations",
      expect.any(Function)
    );
    expect(harness.string).toHaveBeenCalledWith("pms_type", 50);
    expect(harness.nullable).toHaveBeenCalledOnce();
    expect(harness.defaultTo).not.toHaveBeenCalled();
    expect(harness.alter).toHaveBeenCalledOnce();
    expect(harness.query.where).toHaveBeenCalledWith("pms_type", "default");
    expect(harness.update).toHaveBeenCalledWith({ pms_type: null });
    expect(harness.alterTable.mock.invocationCallOrder[0]).toBeLessThan(
      harness.update.mock.invocationCallOrder[0]
    );
  });

  it("restores null assignments before reapplying the legacy constraint", async () => {
    const harness = migrationHarness(true);

    await down(harness.knex);

    expect(harness.query.whereNull).toHaveBeenCalledWith("pms_type");
    expect(harness.update).toHaveBeenCalledWith({ pms_type: "default" });
    expect(harness.notNullable).toHaveBeenCalledOnce();
    expect(harness.defaultTo).toHaveBeenCalledWith("default");
    expect(harness.alter).toHaveBeenCalledOnce();
    expect(harness.update.mock.invocationCallOrder[0]).toBeLessThan(
      harness.alterTable.mock.invocationCallOrder[0]
    );
  });

  it("does nothing when the original migration has not added the column", async () => {
    const upHarness = migrationHarness(false);
    const downHarness = migrationHarness(false);

    await up(upHarness.knex);
    await down(downHarness.knex);

    expect(upHarness.alterTable).not.toHaveBeenCalled();
    expect(upHarness.update).not.toHaveBeenCalled();
    expect(downHarness.alterTable).not.toHaveBeenCalled();
    expect(downHarness.update).not.toHaveBeenCalled();
  });
});
