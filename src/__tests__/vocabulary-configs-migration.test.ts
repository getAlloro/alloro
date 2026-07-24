/**
 * `vocabulary_configs` migration proofs.
 *
 * SCOPE HONESTY: this mirrors the existing mocked-knex migration harness (see
 * nap-consistency-migration.test.ts and pms-type-migration.test.ts). No database
 * is touched, so every assertion here is a SHAPE assertion about which knex
 * calls the migration makes — NOT DDL proof. It proves the migration is
 * idempotent, that it touches only its own table, and that `org_id` is declared
 * as an integer foreign key to `organizations`. It does not prove the resulting
 * DDL is valid PostgreSQL; a real execution is a dev-deploy step.
 */

import { describe, expect, it, vi } from "vitest";
import type { Knex } from "knex";
import {
  down,
  up,
} from "../database/migrations/20260723000000_create_vocabulary_configs";

const TABLE = "vocabulary_configs";

interface ColumnCall {
  method: string;
  args: unknown[];
  chain: string[];
  chainArgs: unknown[][];
}

function migrationHarness(hasTable: boolean) {
  const createdTables: string[] = [];
  const droppedTables: string[] = [];
  const columns: ColumnCall[] = [];

  /** Records the builder chain a column declaration walks. */
  function columnBuilder(method: string, args: unknown[]) {
    const record: ColumnCall = { method, args, chain: [], chainArgs: [] };
    columns.push(record);
    const proxy: Record<string, unknown> = {};
    for (const link of [
      "notNullable",
      "nullable",
      "primary",
      "references",
      "inTable",
      "onDelete",
      "defaultTo",
      "unsigned",
      "index",
    ]) {
      proxy[link] = (...linkArgs: unknown[]) => {
        record.chain.push(link);
        record.chainArgs.push(linkArgs);
        return proxy;
      };
    }
    return proxy;
  }

  const tableBuilder = new Proxy(
    {},
    {
      get: (_target, prop: string) =>
        (...args: unknown[]) =>
          columnBuilder(prop, args),
    }
  );

  const schema = {
    hasTable: vi.fn(async () => hasTable),
    createTable: vi.fn(
      async (name: string, cb: (t: unknown) => void) => {
        createdTables.push(name);
        cb(tableBuilder);
      }
    ),
    dropTableIfExists: vi.fn(async (name: string) => {
      droppedTables.push(name);
    }),
  };

  const knex = Object.assign(
    vi.fn(() => {
      throw new Error("migration must not query rows");
    }),
    { schema, fn: { now: () => "now()" } }
  ) as unknown as Knex;

  return { knex, schema, createdTables, droppedTables, columns };
}

describe("20260723000000_create_vocabulary_configs — up()", () => {
  it("is idempotent: creates nothing when the table already exists", async () => {
    const h = migrationHarness(true);
    await up(h.knex);
    expect(h.schema.createTable).not.toHaveBeenCalled();
    expect(h.createdTables).toEqual([]);
  });

  it("creates only its own table", async () => {
    const h = migrationHarness(false);
    await up(h.knex);
    expect(h.createdTables).toEqual([TABLE]);
  });

  it("declares org_id as an integer FK to organizations with ON DELETE CASCADE", async () => {
    const h = migrationHarness(false);
    await up(h.knex);

    const orgId = h.columns.find((c) => c.args[0] === "org_id");
    expect(orgId).toBeDefined();
    // Integer, matching organizations.id — not bigInteger, which node-postgres
    // would hand back as a string.
    expect(orgId?.method).toBe("integer");
    expect(orgId?.chain).toContain("notNullable");
    // Referential integrity: without the FK a deleted org leaves an orphan row
    // forever and nothing in the schema says what this column means.
    expect(orgId?.chain).toContain("references");
    expect(orgId?.chain).toContain("inTable");
    const inTableArgs = orgId?.chainArgs[orgId.chain.indexOf("inTable")];
    expect(inTableArgs?.[0]).toBe("organizations");
    const onDeleteArgs = orgId?.chainArgs[orgId.chain.indexOf("onDelete")];
    expect(onDeleteArgs?.[0]).toBe("CASCADE");
  });

  it("keeps the unique constraint the first-write-wins guard relies on", async () => {
    const h = migrationHarness(false);
    await up(h.knex);

    const unique = h.columns.find((c) => c.method === "unique");
    expect(unique?.args[0]).toEqual(["org_id"]);
  });
});

describe("20260723000000_create_vocabulary_configs — down()", () => {
  it("is a real reversal that drops only its own table", async () => {
    const h = migrationHarness(true);
    await down(h.knex);
    expect(h.droppedTables).toEqual([TABLE]);
    expect(h.schema.createTable).not.toHaveBeenCalled();
  });
});
