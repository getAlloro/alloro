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

const decimalFieldsFor: Record<string, string[]> = {
  findability_sensor_keyword_configs: ["radius_miles"],
  findability_sensor_readings: [
    "radius_miles",
    "center_lat",
    "center_lng",
    "solv_percent",
    "arp",
    "atrp",
    "coverage",
  ],
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

/** Mirror `pg`'s default NUMERIC parser: decimal columns are returned as strings. */
function readAsPostgres(table: string, row: Row): Row {
  const result = { ...row };
  for (const field of decimalFieldsFor[table] ?? []) {
    if (result[field] !== null && result[field] !== undefined) {
      result[field] = String(result[field]);
    }
  }
  return result;
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
      return [readAsPostgres(table, existing)];
    }
    const created = { id: nextId++, ...incoming };
    rows.push(created);
    return [readAsPostgres(table, created)];
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
      const postgresRows = matches.map((row) => readAsPostgres(table, row));
      return single ? postgresRows[0] : postgresRows;
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
// Imported to ENUMERATE the real inherited surface rather than trust a list.
import { BaseModel as BaseModelRef } from "../models/BaseModel";
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
    const readBack = await FindabilitySensorKeywordConfigModel.findForLocation(7, 42);

    expect(second.id).toBe(first.id);
    expect(second.created_at).toBe(createdAt); // birth timestamp survives
    expect(second.grid_size).toBe(9);
    expect(second.radius_miles).toBe(5);
    expect(typeof second.radius_miles).toBe("number");
    expect(Number.isFinite(second.radius_miles)).toBe(true);
    expect(readBack?.radius_miles).toBe(5);
    expect(typeof readBack?.radius_miles).toBe("number");
    expect(Number.isFinite(readBack?.radius_miles)).toBe(true);
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

  it("normalizes every PostgreSQL NUMERIC-backed metric to a finite number", async () => {
    const saved = await FindabilitySensorReadingModel.upsertReading(
      reading({
        radius_miles: 2.75,
        center_lat: 30.2672,
        center_lng: -97.7431,
        solv_percent: 75.25,
        arp: 4.5,
        atrp: 8.25,
        coverage: 0.89,
      }),
    );
    const [readBack] = await FindabilitySensorReadingModel.latestForLocation(7, 42);

    for (const row of [saved, readBack]) {
      const metrics = [
        row.radius_miles,
        row.center_lat,
        row.center_lng,
        row.solv_percent,
        row.arp,
        row.atrp,
        row.coverage,
      ];
      expect(metrics.every((metric) => typeof metric === "number")).toBe(true);
      expect(metrics.every((metric) => Number.isFinite(metric))).toBe(true);
      expect(row).toMatchObject({
        radius_miles: 2.75,
        center_lat: 30.2672,
        center_lng: -97.7431,
        solv_percent: 75.25,
        arp: 4.5,
        atrp: 8.25,
        coverage: 0.89,
      });
    }
  });

  it("preserves nullable NUMERIC-backed metrics as null", async () => {
    const saved = await FindabilitySensorReadingModel.upsertReading(
      reading({
        center_lat: null,
        center_lng: null,
        solv_percent: null,
        arp: null,
        atrp: null,
      }),
    );

    expect(saved).toMatchObject({
      center_lat: null,
      center_lng: null,
      solv_percent: null,
      arp: null,
      atrp: null,
    });
  });

  it("a different run_date is a new point in the time-series, not a conflict", async () => {
    await FindabilitySensorReadingModel.upsertReading(reading({ run_date: "2026-07-15" }));
    await FindabilitySensorReadingModel.upsertReading(reading({ run_date: "2026-07-16" }));

    expect(rowsOf("findability_sensor_readings")).toHaveLength(2);
  });
});

// ── tenant isolation: the §11.7 seal, proven behaviorally (§20.2) ────

/**
 * Both sensor tables are tenant tables. §20.2 requires the §11.7 rule be
 * "proven here, not assumed" — so these tests do not assert on shape (that a
 * method merely EXISTS, which would pass against a model that leaks). They
 * (a) seed TWO organizations and prove a scoped read returns only the caller's
 * rows, and (b) CALL every sealed entry point and prove it refuses.
 */

const readingFor = (over: Record<string, unknown> = {}) =>
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

describe("tenant isolation — one organization cannot read another's rows (§11.7/§5.5/§20.2)", () => {
  it("latestForLocation returns ONLY the caller's organization's readings", async () => {
    // Same location id, same keyword, same day — under two different orgs.
    await FindabilitySensorReadingModel.upsertReading(
      readingFor({ organization_id: 7, solv_percent: 11 }),
    );
    await FindabilitySensorReadingModel.upsertReading(
      readingFor({ organization_id: 8, solv_percent: 99 }),
    );

    const forOrg7 = await FindabilitySensorReadingModel.latestForLocation(7, 42);

    expect(forOrg7).toHaveLength(1);
    expect(forOrg7[0].organization_id).toBe(7);
    expect(forOrg7[0].solv_percent).toBe(11);
    // The leak this guards: org 8's measurement must be invisible to org 7.
    expect(forOrg7.some((r) => r.organization_id === 8)).toBe(false);
    expect(forOrg7.some((r) => r.solv_percent === 99)).toBe(false);
  });

  it("findForLocation returns ONLY the caller's organization's config", async () => {
    await FindabilitySensorKeywordConfigModel.upsertConfig(
      config({ organization_id: 7, location_id: 42, grid_size: 7 }),
    );
    await FindabilitySensorKeywordConfigModel.upsertConfig(
      config({ organization_id: 8, location_id: 42, grid_size: 13 }),
    );

    const forOrg7 = await FindabilitySensorKeywordConfigModel.findForLocation(7, 42);
    const forOrg8 = await FindabilitySensorKeywordConfigModel.findForLocation(8, 42);

    expect(forOrg7?.organization_id).toBe(7);
    expect(forOrg7?.grid_size).toBe(7);
    expect(forOrg8?.organization_id).toBe(8);
    expect(forOrg8?.grid_size).toBe(13);
  });

  it("findForLocation cannot reach a location owned by another organization", async () => {
    await FindabilitySensorKeywordConfigModel.upsertConfig(
      config({ organization_id: 8, location_id: 42 }),
    );

    // Org 7 asking for org 8's location gets "missing", not the row — and the
    // undefined is indistinguishable from absent, leaking no existence info.
    const stolen = await FindabilitySensorKeywordConfigModel.findForLocation(7, 42);
    expect(stolen).toBeUndefined();
  });

  it("the null-location config of one org is invisible to another org", async () => {
    await FindabilitySensorKeywordConfigModel.upsertConfig(
      config({ organization_id: 8, location_id: null, grid_size: 13 }),
    );

    expect(
      await FindabilitySensorKeywordConfigModel.findForLocation(7, null),
    ).toBeUndefined();
    expect(
      (await FindabilitySensorKeywordConfigModel.findForLocation(8, null))?.grid_size,
    ).toBe(13);
  });
});

describe("sealed unscoped entry points refuse at runtime (§11.7)", () => {
  // The JS/untyped caller — the one TS2554 cannot stop. This is the backstop,
  // and it is exercised WITH arguments, exactly as a real leak would call it.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const untypedReading = FindabilitySensorReadingModel as any;
  const untypedConfig = FindabilitySensorKeywordConfigModel as any;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const sealed: [string, () => Promise<unknown>][] = [
    ["Reading.findById", () => untypedReading.findById(1)],
    ["Reading.findOne", () => untypedReading.findOne({ organization_id: 8 })],
    ["Reading.findMany", () => untypedReading.findMany({})],
    ["Reading.create", () => untypedReading.create({ organization_id: 8 })],
    ["Reading.createReturningId", () => untypedReading.createReturningId({ organization_id: 8 })],
    ["Reading.updateById", () => untypedReading.updateById(1, { solv_percent: 0 })],
    ["Reading.deleteById", () => untypedReading.deleteById(1)],
    ["Reading.count", () => untypedReading.count()],
    ["Reading.paginate", () => untypedReading.paginate((q: unknown) => q, {})],
    ["Config.findById", () => untypedConfig.findById(1)],
    ["Config.findOne", () => untypedConfig.findOne({ organization_id: 8 })],
    ["Config.findMany", () => untypedConfig.findMany({})],
    ["Config.create", () => untypedConfig.create({ organization_id: 8 })],
    ["Config.createReturningId", () => untypedConfig.createReturningId({ organization_id: 8 })],
    ["Config.updateById", () => untypedConfig.updateById(1, { enabled: true })],
    ["Config.deleteById", () => untypedConfig.deleteById(1)],
    ["Config.count", () => untypedConfig.count()],
    ["Config.paginate", () => untypedConfig.paginate((q: unknown) => q, {})],
  ];

  it.each(sealed)("%s throws and cites the Article", async (_name, call) => {
    await expect(call()).rejects.toThrow(/unscoped|bypasses/);
    await expect(call()).rejects.toThrow(/§11\.7|§5\.4|§21\.1/);
  });

  it("a sealed write leaves the table untouched — it refuses, it does not partially write", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const untyped = FindabilitySensorKeywordConfigModel as any;
    await expect(
      untyped.create({ organization_id: 8, location_id: 1, keywords: [] }),
    ).rejects.toThrow();

    expect(rowsOf("findability_sensor_keyword_configs")).toHaveLength(0);
  });

  it("every unscoped BaseModel entry point is sealed — enumerated from source, not remembered", () => {
    // Guards the CLASS, not the two examples a reviewer happened to name: if
    // BaseModel ever grows a NEW public static, this fails until someone
    // triages it onto one of the two lists below.
    //
    // Enumerated from the SOURCE, deliberately. `protected` is a TypeScript
    // construct that is ERASED at runtime, so Object.getOwnPropertyNames() on
    // the class cannot tell a public entry point from a protected helper — it
    // reports `table`, `parseJson`, `serializeJsonFields` and friends as though
    // they were inherited API. The declaration is the only honest source of
    // truth for visibility. (Same fs-read precedent as the migration guard.)
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/models/BaseModel.ts"),
      "utf8",
    );
    const publicStatics = [
      ...source.matchAll(/^\s+(?:(protected|private|public)\s+)?static\s+(?:async\s+)?(\w+)/gm),
    ]
      .filter(([, modifier]) => modifier === undefined || modifier === "public")
      .map(([, , name]) => name);

    // The real public surface — ELEVEN, not the nine an unaided list remembers.
    expect(publicStatics.sort()).toEqual(
      [
        "beginTransaction",
        "count",
        "create",
        "createReturningId",
        "deleteById",
        "findById",
        "findMany",
        "findOne",
        "paginate",
        "transaction",
        "updateById",
      ].sort(),
    );

    // Not table access: they open a transaction and carry no WHERE clause, so
    // they pose no tenant hazard. BaseModel documents them as the sanctioned
    // boundary for composing several model writes. Deliberately left open.
    const allowed = ["transaction", "beginTransaction"];
    const mustBeSealed = publicStatics.filter((k) => !allowed.includes(k));
    expect(mustBeSealed).toHaveLength(9);

    for (const name of mustBeSealed) {
      for (const model of [
        FindabilitySensorReadingModel,
        FindabilitySensorKeywordConfigModel,
      ]) {
        // Sealed => the subclass declares its OWN override, and that override is
        // NOT the inherited BaseModel function object.
        expect(Object.prototype.hasOwnProperty.call(model, name)).toBe(true);
        expect((model as unknown as Record<string, unknown>)[name]).not.toBe(
          (BaseModelRef as unknown as Record<string, unknown>)[name],
        );
      }
    }
  });
});

/**
 * COMPILE-TIME seals (§11.7). Never executed — `tsc --noEmit` covers `src/`, so
 * each `@ts-expect-error` is verified by the same gate that builds the app: if
 * anyone unseals one of these, the directive becomes unused and TS2578 FAILS
 * the build. That is the enforcement; the runtime throws above are the backstop.
 */
export async function _compileTimeSealsAreEnforced(): Promise<void> {
  // @ts-expect-error §11.7 — sealed: an id-only read would cross tenants.
  await FindabilitySensorReadingModel.findById(1);
  // @ts-expect-error §11.7 — sealed: caller-supplied WHERE crosses tenants.
  await FindabilitySensorReadingModel.findOne({ organization_id: 8 });
  // @ts-expect-error §11.7 — sealed: would return every tenant's readings.
  await FindabilitySensorReadingModel.findMany({});
  // @ts-expect-error §11.7/§21.1 — sealed: bypasses the idempotent upsert.
  await FindabilitySensorReadingModel.create({ organization_id: 8 });
  // @ts-expect-error §11.7/§21.1 — sealed: bypasses the idempotent upsert.
  await FindabilitySensorReadingModel.createReturningId({ organization_id: 8 });
  // @ts-expect-error §11.7 — sealed: unscoped cross-tenant write.
  await FindabilitySensorReadingModel.updateById(1, {});
  // @ts-expect-error §11.7 — sealed: unscoped cross-tenant delete.
  await FindabilitySensorReadingModel.deleteById(1);
  // @ts-expect-error §11.7 — sealed: paged cross-tenant read.
  await FindabilitySensorReadingModel.paginate((q) => q, {});

  // @ts-expect-error §11.7 — sealed: an id-only read would cross tenants.
  await FindabilitySensorKeywordConfigModel.findById(1);
  // @ts-expect-error §11.7 — sealed: the call findForLocation used to delegate to.
  await FindabilitySensorKeywordConfigModel.findOne({ organization_id: 8 });
  // @ts-expect-error §11.7 — sealed: would return every tenant's configs.
  await FindabilitySensorKeywordConfigModel.findMany({});
  // @ts-expect-error §11.7/§5.4 — sealed: bypasses one-config-per-location.
  await FindabilitySensorKeywordConfigModel.create({ organization_id: 8 });
  // @ts-expect-error §11.7/§5.4 — sealed: bypasses one-config-per-location.
  await FindabilitySensorKeywordConfigModel.createReturningId({ organization_id: 8 });
  // @ts-expect-error §11.7/§5.4 — sealed: could flip `enabled` on another org.
  await FindabilitySensorKeywordConfigModel.updateById(1, { enabled: true });
  // @ts-expect-error §11.7 — sealed: unscoped cross-tenant delete.
  await FindabilitySensorKeywordConfigModel.deleteById(1);
  // @ts-expect-error §11.7 — sealed: paged cross-tenant read.
  await FindabilitySensorKeywordConfigModel.paginate((q) => q, {});

  // NOTE: `count()` is absent on purpose. `BaseModel.count()` is callable with
  // ZERO arguments, so a zero-arg call raises no TS2554 and a @ts-expect-error
  // here would itself be an unused-directive error. Its seal is RUNTIME-only —
  // proven by the "throws and cites the Article" cases above. This is the honest
  // limit of the compile-time technique, recorded rather than papered over.
}

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
