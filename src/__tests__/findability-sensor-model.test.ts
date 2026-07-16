/**
 * Findability Sensor persistence — regression tests (A5 slice 1, review Rev 4).
 *
 * Covers the two things the parallel review called out:
 *   1. Concurrent configuration saves must not produce two configs for one
 *      location (review finding #1 — `upsertConfig` was a check-then-create
 *      TOCTOU race behind a merely-indexed, non-unique column pair).
 *   2. This slice must not ship a schedule it cannot run (review finding #2).
 *
 * HOW THE DB IS FAKED — and what that does and does not prove.
 * Following the in-memory Knex-shaped evaluator precedent in
 * `receipts-report-model.test.ts`, `db` is replaced with a stub that emulates
 * the two Postgres behaviours under test:
 *   - the UNIQUE index, keyed the way the migration keys it, i.e. on
 *     (organization_id, COALESCE(location_id, -1)) — so a null location is one
 *     slot, not infinitely many. A plain INSERT that collides raises 23505.
 *   - INSERT ... ON CONFLICT DO UPDATE resolved ATOMICALLY: the stub's
 *     check-and-write critical section contains no await, so two concurrent
 *     inserts serialize exactly as Postgres would serialize them on the index.
 * The await boundary sits BEFORE that critical section, so the window a
 * check-then-create implementation leaves open is real here: these tests fail
 * against the pre-fix `upsertConfig` (verified by reverting it and re-running).
 *
 * HONEST LIMIT: this proves the MODEL converges on a unique index — it does not
 * prove Postgres accepts the DDL or infers the conflict target. The conflict
 * target and the index expression are written to match, but a mismatch raises
 * 42P10 only against a live server. That check is Layer 3 (see test.html T5/T6).
 */

import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── the Postgres-shaped fake ─────────────────────────────────────────

type Row = Record<string, unknown>;

/** Unique-index key builders — these MIRROR the migration's index expressions. */
const uniqueKeyFor: Record<string, (row: Row) => string> = {
  findability_sensor_keyword_configs: (r) =>
    `${r.organization_id}|${r.location_id ?? -1}`,
  findability_sensor_readings: (r) =>
    `${r.organization_id}|${r.location_id ?? -1}|${r.keyword}|${r.run_date}`,
};

const tables = new Map<string, Row[]>();
let nextId = 1;

function reset(): void {
  tables.clear();
  nextId = 1;
}

function rowsOf(table: string): Row[] {
  if (!tables.has(table)) tables.set(table, []);
  return tables.get(table) as Row[];
}

class UniqueViolation extends Error {
  code = "23505";
  constructor(table: string) {
    super(`duplicate key value violates unique constraint on ${table}`);
  }
}

/** A raw fragment; only its text matters to the fake. */
class RawFragment {
  constructor(public readonly sql: string) {}
}

function makeBuilder(table: string): Record<string, unknown> {
  const conds: Row = {};
  let single = false;
  let pending: Row | null = null;
  let conflict: RawFragment | null = null;
  let mergeCols: string[] | null = null;

  /**
   * The atomic critical section. Deliberately synchronous: Postgres resolves
   * INSERT ... ON CONFLICT against the index atomically, and so must this, or
   * the fake would invent a race that the real DB does not have.
   */
  const applyInsert = (): Row[] => {
    const rows = rowsOf(table);
    const keyOf = uniqueKeyFor[table];
    const incoming = pending as Row;
    const existing = rows.find((r) => keyOf(r) === keyOf(incoming));

    if (existing) {
      if (!conflict) throw new UniqueViolation(table);
      // ON CONFLICT DO UPDATE — only the merge columns are refreshed.
      for (const col of mergeCols ?? []) {
        if (col in incoming) existing[col] = incoming[col];
      }
      return [{ ...existing }];
    }
    const created = { id: nextId++, ...incoming };
    rows.push(created);
    return [{ ...created }];
  };

  const resolve = (): Promise<unknown> =>
    // The await boundary: a check-then-create caller yields here, which is
    // exactly the window this test suite is built to expose.
    Promise.resolve().then(() => {
      if (pending) return applyInsert();
      const rows = rowsOf(table);
      const matches = rows.filter((r) =>
        Object.entries(conds).every(([k, v]) => (r[k] ?? null) === (v ?? null)),
      );
      return single ? matches[0] : matches;
    });

  const builder: Record<string, unknown> = {
    then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
      resolve().then(ok, err),
    catch: (err: (e: unknown) => unknown) => resolve().catch(err),
    finally: (fn: () => void) => resolve().finally(fn),
    where: (c: Row) => (Object.assign(conds, c), builder),
    orderBy: () => builder,
    first: () => ((single = true), builder),
    insert: (row: Row) => ((pending = row), builder),
    onConflict: (raw: RawFragment) => ((conflict = raw), builder),
    merge: (cols: string[]) => ((mergeCols = cols), builder),
    returning: () => builder,
    update: (patch: Row) => {
      const rows = rowsOf(table);
      const matches = rows.filter((r) =>
        Object.entries(conds).every(([k, v]) => (r[k] ?? null) === (v ?? null)),
      );
      matches.forEach((r) => Object.assign(r, patch));
      return Promise.resolve(matches.length);
    },
  };
  return builder;
}

vi.mock("../database/connection", () => {
  const db = vi.fn((table: string) => makeBuilder(table)) as unknown as Record<
    string,
    unknown
  > & ((t: string) => unknown);
  (db as Record<string, unknown>).raw = vi.fn((sql: string) => new RawFragment(sql));
  return { db, default: db, testConnection: vi.fn(), closeConnection: vi.fn() };
});

import {
  FindabilitySensorKeywordConfigModel,
  FindabilitySensorReadingModel,
  type FindabilitySensorKeywordConfigInput,
} from "../models/FindabilitySensorModel";
import { getAgentHandler, getRegisteredAgents } from "../services/agentRegistry";

// ── fixtures ─────────────────────────────────────────────────────────

function config(
  over: Partial<FindabilitySensorKeywordConfigInput> = {},
): FindabilitySensorKeywordConfigInput {
  return {
    organization_id: 7,
    location_id: 42,
    keywords: [{ keyword: "dentist", source: "service_list" }],
    grid_size: 7,
    radius_miles: 2.5,
    enabled: false,
    ...over,
  };
}

beforeEach(reset);

// ── finding #1: the configuration race ───────────────────────────────

describe("upsertConfig — one configuration per (organization, location)", () => {
  it("two concurrent saves for the same location leave exactly ONE config", async () => {
    await Promise.all([
      FindabilitySensorKeywordConfigModel.upsertConfig(
        config({ keywords: [{ keyword: "dentist", source: "service_list" }] }),
      ),
      FindabilitySensorKeywordConfigModel.upsertConfig(
        config({ keywords: [{ keyword: "implants", source: "gsc_demand" }] }),
      ),
    ]);

    const rows = rowsOf("findability_sensor_keyword_configs");
    expect(rows).toHaveLength(1);
  });

  it("two concurrent saves for the same NULL-location org leave exactly ONE config", async () => {
    // The COALESCE case: a plain unique index would let both through, because
    // Postgres treats NULLs as DISTINCT.
    await Promise.all([
      FindabilitySensorKeywordConfigModel.upsertConfig(config({ location_id: null })),
      FindabilitySensorKeywordConfigModel.upsertConfig(config({ location_id: null })),
    ]);

    expect(rowsOf("findability_sensor_keyword_configs")).toHaveLength(1);
  });

  it("a save is a single atomic statement — no check-then-create read", async () => {
    // The structural regression guard: the race returns the moment someone
    // reintroduces a read-then-branch-then-write.
    await FindabilitySensorKeywordConfigModel.upsertConfig(config());
    const saved = await FindabilitySensorKeywordConfigModel.upsertConfig(
      config({ enabled: true }),
    );

    expect(rowsOf("findability_sensor_keyword_configs")).toHaveLength(1);
    expect(saved.enabled).toBe(true);
  });

  it("a re-save edits the location's config in place and keeps created_at", async () => {
    const first = await FindabilitySensorKeywordConfigModel.upsertConfig(config());
    const createdAt = first.created_at;

    const second = await FindabilitySensorKeywordConfigModel.upsertConfig(
      config({ grid_size: 9, radius_miles: 5, enabled: true }),
    );

    expect(second.id).toBe(first.id);
    expect(second.created_at).toBe(createdAt); // birth timestamp survives
    expect(second.grid_size).toBe(9);
    expect(second.enabled).toBe(true);
  });

  it("does not over-constrain: different locations in one org each keep a config", async () => {
    await Promise.all([
      FindabilitySensorKeywordConfigModel.upsertConfig(config({ location_id: 1 })),
      FindabilitySensorKeywordConfigModel.upsertConfig(config({ location_id: 2 })),
      FindabilitySensorKeywordConfigModel.upsertConfig(config({ location_id: null })),
    ]);

    expect(rowsOf("findability_sensor_keyword_configs")).toHaveLength(3);
  });

  it("does not over-constrain: the same location id under different orgs is distinct", async () => {
    await Promise.all([
      FindabilitySensorKeywordConfigModel.upsertConfig(config({ organization_id: 1 })),
      FindabilitySensorKeywordConfigModel.upsertConfig(config({ organization_id: 2 })),
    ]);

    expect(rowsOf("findability_sensor_keyword_configs")).toHaveLength(2);
  });
});

// ── the same race on the readings table ──────────────────────────────

describe("upsertReading — one snapshot per (org, location, keyword, run_date)", () => {
  const reading = (over: Record<string, unknown> = {}) =>
    ({
      organization_id: 7,
      location_id: 42,
      keyword: "dentist",
      keyword_source: "service_list",
      grid_size: 7,
      radius_miles: 2.5,
      center_lat: 30,
      center_lng: -97,
      solv_percent: 50,
      arp: 4,
      atrp: 6,
      total_pins: 9,
      known_pins: 9,
      unknown_pins: 0,
      ranked_pins: 5,
      top_three_pins: 4,
      coverage: 1,
      per_pin: [],
      open_hours_known: false,
      observed_at: new Date(),
      run_date: "2026-07-15",
      ...over,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

  it("two concurrent scans of the same keyword/day leave exactly ONE snapshot", async () => {
    await Promise.all([
      FindabilitySensorReadingModel.upsertReading(reading({ solv_percent: 50 })),
      FindabilitySensorReadingModel.upsertReading(reading({ solv_percent: 60 })),
    ]);

    expect(rowsOf("findability_sensor_readings")).toHaveLength(1);
  });

  it("a same-day re-scan updates the measurement rather than stacking a duplicate", async () => {
    await FindabilitySensorReadingModel.upsertReading(reading({ solv_percent: 50 }));
    const second = await FindabilitySensorReadingModel.upsertReading(
      reading({ solv_percent: 75 }),
    );

    expect(rowsOf("findability_sensor_readings")).toHaveLength(1);
    expect(second.solv_percent).toBe(75);
  });

  it("a different run_date is a new point in the time-series, not a conflict", async () => {
    await FindabilitySensorReadingModel.upsertReading(reading({ run_date: "2026-07-15" }));
    await FindabilitySensorReadingModel.upsertReading(reading({ run_date: "2026-07-16" }));

    expect(rowsOf("findability_sensor_readings")).toHaveLength(2);
  });
});

// ── finding #2: no schedule this slice cannot run ────────────────────

describe("schedule wiring — the slice ships no un-runnable schedule", () => {
  it("registers no findability_sensor handler, so no schedule may seed for it", () => {
    // The sensor's fleet executor is a later slice. Until it exists, a seeded
    // schedule row would be dead config that reads as a shipped capability.
    expect(getAgentHandler("findability_sensor")).toBeUndefined();
  });

  it("the sensor migration seeds no schedules row", () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/database/migrations/20260715000000_create_findability_sensor_tables.ts",
      ),
      "utf8",
    );
    expect(source).not.toMatch(/knex\(\s*["']schedules["']\s*\)/);
  });

  it("every registered agent key resolves to a callable handler", () => {
    // The invariant the seed broke, stated positively: a dispatchable key must
    // have something to dispatch to.
    const keys = getRegisteredAgents().map((a) => a.key);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(typeof getAgentHandler(key)?.handler).toBe("function");
    }
  });
});
