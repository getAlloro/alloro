/**
 * Unit tests — KeywordSearchVolumeModel (T3, powers the Patient Journey
 * "Searching your market" stage).
 *
 * Data strategy: Option B (mock the data layer). The shared knex `db`
 * (src/database/connection) is replaced with a capturing chainable stub so the
 * test runs with NO live Postgres. We assert the model's *contract*, not SQL:
 *
 *   • getMarketVolumeForLocation — sums seeded volumes for a location/month into
 *     a single MarketVolumeSummary, and zero-fills when no rows exist.
 *   • upsert — issues an insert + onConflict(...).merge(...) keyed on
 *     (location_id, keyword, report_month), i.e. the idempotent contract.
 *   • tenant scope (§11.7/§20.2) — every read filters by organization_id, so one
 *     tenant can never read another's rows; the org id is threaded into the
 *     WHERE clause, not assumed.
 *
 * Synthetic only (§20.4): all ids/values are made up; no fixtures, no network.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A capturing chainable knex stub. Unlike the shared helpers/db.ts mock, this
 * one records the arguments passed to `where`, `insert`, `onConflict`, `merge`,
 * and `select` so the tenant-scope + upsert-contract assertions can inspect them.
 * Every call against the same table within one test pushes onto shared logs.
 */
type Captured = {
  table: string[];
  where: Record<string, unknown>[];
  insert: Record<string, unknown>[];
  onConflict: unknown[];
  merge: Record<string, unknown>[];
};

const captured: Captured = { table: [], where: [], insert: [], onConflict: [], merge: [] };

/** The single-row value the next `.first()` chain resolves to. */
let firstResult: unknown;

function resetCaptured(): void {
  captured.table = [];
  captured.where = [];
  captured.insert = [];
  captured.onConflict = [];
  captured.merge = [];
  firstResult = undefined;
}

function makeBuilder(): Record<string, unknown> {
  let singleRow = false;
  const resolveValue = (): unknown => (singleRow ? firstResult : []);
  const builder: Record<string, unknown> = {
    then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(resolveValue()).then(onF, onR),
    catch: (onR: (e: unknown) => unknown) => Promise.resolve(resolveValue()).catch(onR),
    finally: (onF: () => void) => Promise.resolve(resolveValue()).finally(onF),
  };
  builder.where = vi.fn((cond: Record<string, unknown>) => {
    captured.where.push(cond);
    return builder;
  });
  builder.orderBy = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.first = vi.fn(() => {
    singleRow = true;
    return builder;
  });
  builder.onConflict = vi.fn((cols: unknown) => {
    captured.onConflict.push(cols);
    return builder;
  });
  builder.merge = vi.fn((row: Record<string, unknown>) => {
    captured.merge.push(row);
    return Promise.resolve(1);
  });
  builder.insert = vi.fn((row: Record<string, unknown>) => {
    captured.insert.push(row);
    return builder;
  });
  return builder;
}

vi.mock("../database/connection", () => {
  const db = vi.fn((table: string) => {
    captured.table.push(table);
    return makeBuilder();
  }) as unknown as { (table: string): unknown; raw: unknown };
  // db.raw(...) is passed as a select arg; identity stub is enough.
  (db as unknown as { raw: (s: string) => string }).raw = vi.fn((s: string) => s);
  return { db, default: db };
});

import { KeywordSearchVolumeModel } from "../models/KeywordSearchVolumeModel";

const ORG = 7;
const OTHER_ORG = 99;
const LOCATION = 42;
const MONTH = "2026-06-01";

beforeEach(() => {
  vi.clearAllMocks();
  resetCaptured();
});

describe("KeywordSearchVolumeModel.getMarketVolumeForLocation", () => {
  it("returns the summed volume + keyword count for a seeded location/month", async () => {
    // The SUM/COUNT aggregate select resolves to a single row.
    firstResult = { total_volume: 1480, keyword_count: 6 };

    const summary = await KeywordSearchVolumeModel.getMarketVolumeForLocation(ORG, LOCATION, MONTH);

    expect(summary).toEqual({ totalVolume: 1480, keywordCount: 6, reportMonth: MONTH });
  });

  it("zero-fills (no throw) when the location has no rows for the month", async () => {
    firstResult = undefined; // aggregate over an empty set → no row

    const summary = await KeywordSearchVolumeModel.getMarketVolumeForLocation(ORG, LOCATION, MONTH);

    expect(summary).toEqual({ totalVolume: 0, keywordCount: 0, reportMonth: MONTH });
  });

  it("scopes the read to organization_id + location_id (tenant isolation, §11.7)", async () => {
    firstResult = { total_volume: 10, keyword_count: 1 };

    await KeywordSearchVolumeModel.getMarketVolumeForLocation(ORG, LOCATION, MONTH);

    expect(captured.table).toContain("keyword_search_volume");
    expect(captured.where[0]).toEqual({
      organization_id: ORG,
      location_id: LOCATION,
      report_month: MONTH,
    });
  });

  it("threads a DIFFERENT org id into the WHERE — cannot read another tenant's rows", async () => {
    firstResult = { total_volume: 0, keyword_count: 0 };

    await KeywordSearchVolumeModel.getMarketVolumeForLocation(OTHER_ORG, LOCATION, MONTH);

    // The org id is taken from the (server-supplied) arg, never hardcoded; a
    // request for OTHER_ORG filters on OTHER_ORG, so ORG's rows are unreachable.
    expect(captured.where[0]).toMatchObject({ organization_id: OTHER_ORG });
    expect(captured.where[0]).not.toMatchObject({ organization_id: ORG });
  });
});

describe("KeywordSearchVolumeModel.findLatestMonth", () => {
  it("is tenant-scoped and returns the latest report_month string", async () => {
    firstResult = { latest_month: "2026-06-01" };

    const latest = await KeywordSearchVolumeModel.findLatestMonth(ORG, LOCATION);

    expect(latest).toBe("2026-06-01");
    expect(captured.where[0]).toEqual({ organization_id: ORG, location_id: LOCATION });
  });

  it("returns null when the location has never been harvested", async () => {
    firstResult = { latest_month: null };

    const latest = await KeywordSearchVolumeModel.findLatestMonth(ORG, LOCATION);

    expect(latest).toBeNull();
  });
});

describe("KeywordSearchVolumeModel.upsert", () => {
  it("inserts the row with the tenant org id and merges on the natural key (idempotent)", async () => {
    await KeywordSearchVolumeModel.upsert({
      organizationId: ORG,
      locationId: LOCATION,
      keyword: "orthodontist near me",
      reportMonth: MONTH,
      searchVolume: 320,
      locationName: "Austin, TX",
    });

    // Insert carries the tenant scope + the natural-key columns.
    expect(captured.insert[0]).toMatchObject({
      organization_id: ORG,
      location_id: LOCATION,
      keyword: "orthodontist near me",
      report_month: MONTH,
      search_volume: 320,
      source: "dataforseo",
    });
    // Conflict target is the (location, keyword, month) unique key → idempotent.
    expect(captured.onConflict[0]).toEqual(["location_id", "keyword", "report_month"]);
    // Merge re-applies the mutable fields (so a re-harvest updates, not dupes).
    expect(captured.merge[0]).toMatchObject({
      organization_id: ORG,
      search_volume: 320,
      source: "dataforseo",
    });
  });

  it("persists a null search_volume verbatim (honest 'no data' at finer geo)", async () => {
    await KeywordSearchVolumeModel.upsert({
      organizationId: ORG,
      locationId: LOCATION,
      keyword: "rare term",
      reportMonth: MONTH,
      searchVolume: null,
    });

    expect(captured.insert[0]).toMatchObject({ search_volume: null });
    expect(captured.merge[0]).toMatchObject({ search_volume: null });
  });

  it("upsertMany issues one upsert per row", async () => {
    await KeywordSearchVolumeModel.upsertMany([
      { organizationId: ORG, locationId: LOCATION, keyword: "a", reportMonth: MONTH, searchVolume: 1 },
      { organizationId: ORG, locationId: LOCATION, keyword: "b", reportMonth: MONTH, searchVolume: 2 },
    ]);

    expect(captured.insert).toHaveLength(2);
    expect(captured.insert.map((r) => r.keyword)).toEqual(["a", "b"]);
  });
});
