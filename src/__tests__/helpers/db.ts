/**
 * Knex `db` mock for the model-bypass seam.
 *
 * Several request paths hit the shared knex instance (src/database/connection.ts)
 * directly — rbacMiddleware (`db("organization_users")`), tokenRefreshMiddleware
 * (`db("google_connections")`), and controllers that bypass models/ (e.g.
 * practice-ranking `db("practice_rankings")`). To run those endpoints with no
 * Postgres, the test mocks the `db` export with this chainable stub.
 *
 * HOW IT WORKS
 *   `db(table)` returns a chainable, thenable query builder. Every builder method
 *   (where, orderBy, select, first, whereNotNull, update, insert, ...) returns the
 *   same builder, so any chain shape works. Awaiting the builder (or calling a
 *   terminal like .first()/.select() and awaiting) resolves to the value you
 *   registered for that table via `setTableResult`.
 *
 * USAGE (in a test file, BEFORE importing the app):
 *   import { mockDb, setTableResult } from "./helpers/db";
 *   vi.mock("../../database/connection", () => mockDb());
 *   // then per test:
 *   setTableResult("organization_users", { id: 1, organization_id: 7, role: "admin" });
 *   setTableResult("practice_rankings", []); // list reads
 *
 * Defaults: an unregistered table resolves to `undefined` for `.first()`-style
 * single reads and `[]` for list reads. Because a single thenable can only carry
 * one value, register the exact shape the endpoint under test expects.
 */

import { vi } from "vitest";

/** Per-table resolved values, keyed by table name. */
const tableResults = new Map<string, unknown>();

/** Register the value the next query against `table` should resolve to. */
export function setTableResult(table: string, value: unknown): void {
  tableResults.set(table, value);
}

/** Clear all registered table results (call in beforeEach/afterEach). */
export function resetTableResults(): void {
  tableResults.clear();
}

/**
 * Builds a chainable + thenable query-builder stub bound to one table. Every
 * method returns the same builder; awaiting resolves to the registered value
 * (or sensible defaults).
 */
function makeQueryBuilder(table: string): any {
  const resolved = (): unknown => {
    if (tableResults.has(table)) return tableResults.get(table);
    return undefined;
  };

  const resolvedList = (): unknown => {
    if (tableResults.has(table)) return tableResults.get(table);
    return [];
  };

  // knex `.first()` switches the builder from resolving to a row[] to resolving
  // to a single row, and the builder stays chainable afterwards (e.g.
  // `.first().select("col")`). Mirror that with a flag instead of having
  // `.first()` return a bare Promise.
  let singleRow = false;
  const resolveValue = (): unknown => (singleRow ? resolved() : resolvedList());

  const builder: any = {
    // Thenable: `await db("t").where(...)` resolves here. List shape by default;
    // becomes single-row once `.first()` has been called in the chain.
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(resolveValue()).then(onFulfilled, onRejected),
    catch: (onRejected: (e: unknown) => unknown) =>
      Promise.resolve(resolveValue()).catch(onRejected),
    finally: (onFinally: () => void) =>
      Promise.resolve(resolveValue()).finally(onFinally),
  };

  // Chainable no-op methods — return the same builder.
  const chainMethods = [
    "where",
    "andWhere",
    "orWhere",
    "whereIn",
    "whereNotIn",
    "whereNull",
    "whereNotNull",
    "whereRaw",
    "orderBy",
    "orderByRaw",
    "groupBy",
    "having",
    "limit",
    "offset",
    "join",
    "leftJoin",
    "innerJoin",
    "returning",
    "onConflict",
    "merge",
    "distinct",
    "count",
    "clone",
  ];
  for (const m of chainMethods) {
    builder[m] = vi.fn(() => builder);
  }

  // `select` may be terminal (awaited) or chained — return builder so both work.
  builder.select = vi.fn(() => builder);

  // `.first()` marks the chain as single-row and stays chainable (knex returns
  // the builder, so `.first().select("col")` works). Awaiting now resolves to
  // the registered object (or undefined).
  builder.first = vi.fn(() => {
    singleRow = true;
    return builder;
  });

  // Mutating terminals — resolve to the registered value or a benign default.
  builder.insert = vi.fn(() => Promise.resolve(resolved() ?? [1]));
  builder.update = vi.fn(() => Promise.resolve(resolved() ?? 1));
  builder.del = vi.fn(() => Promise.resolve(resolved() ?? 1));
  builder.delete = vi.fn(() => Promise.resolve(resolved() ?? 1));

  return builder;
}

/**
 * Returns a module factory for `vi.mock("../../database/connection", ...)`.
 * Provides `db` (callable per-table + `.raw`), the default export, and the
 * connection lifecycle no-ops the app imports.
 */
export function mockDb() {
  const db: any = vi.fn((table: string) => makeQueryBuilder(table));
  db.raw = vi.fn(() => Promise.resolve({ rows: [] }));
  db.destroy = vi.fn(() => Promise.resolve());

  return {
    db,
    default: db,
    testConnection: vi.fn(() => Promise.resolve(true)),
    closeConnection: vi.fn(() => Promise.resolve()),
    healthCheck: vi.fn(() =>
      Promise.resolve({
        status: "healthy",
        message: "mock",
        timestamp: new Date(),
      }),
    ),
  };
}
