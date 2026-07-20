import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";
import type { KeywordFamily, PinObservation } from "../types/findability-sensor";

/**
 * Findability Sensor persistence (A5, slice 1).
 *
 * Two models over the additive sensor tables:
 *   - FindabilitySensorReadingModel  the honest SoLV time-series (one snapshot
 *     per organization/location/keyword/run_date; upsert = idempotent).
 *   - FindabilitySensorKeywordConfigModel  the done-for-you + owner-steerable
 *     keyword/area config (one per organization/location).
 *
 * All DB access lives here (Constitution §7.4). jsonb columns are declared as
 * jsonFields so BaseModel (de)serializes them.
 *
 * ── SEALING NOTE (§11.7/§5.5) ────────────────────────────────────────────────
 * Both tables are TENANT tables (`organization_id`). `BaseModel` hands every
 * subclass a set of public statics whose WHERE clause is whatever the CALLER
 * passes; inherited unchanged on a tenant table, each is a cross-tenant read or
 * write that only stays safe for callers who remember to add an organization
 * predicate. §11.7 requires the tenant scope be "a required argument — not an
 * optional filter a caller may forget", so every unscoped entry point is SEALED
 * rather than inherited, and the only way into these tables is the scoped API:
 *   readings — `upsertReading(input)` / `latestForLocation(organizationId, …)`
 *   configs  — `upsertConfig(input)` / `findForLocation(organizationId, …)`
 *
 * The seal is a compile-time technique: each is overridden to take NO arguments,
 * so a real call is a COMPILE error (TS2554: "Expected 0 arguments, but got N"),
 * not a convention someone has to remember. TypeScript forbids widening a base
 * signature with a required param (TS2417), which is why this is a seal + a
 * scoped sibling rather than an extra argument on `findById` itself. The runtime
 * throw is the backstop for untyped/JS callers.
 *
 * ENUMERATED, not assumed. `BaseModel`'s ACTUAL public static surface is ELEVEN
 * methods (src/models/BaseModel.ts):
 *   findById, findOne, findMany, create, createReturningId, updateById,
 *   deleteById, count, paginate   → all 9 SEALED on both models below
 *   transaction, beginTransaction → deliberately NOT sealed
 * `transaction`/`beginTransaction` are public and inherited, but they open a
 * transaction and touch no table — they carry no WHERE clause and so no tenant
 * hazard. BaseModel documents them as the sanctioned boundary for callers
 * composing several model writes atomically; sealing them would break that
 * pattern for no isolation gain. Everything else in BaseModel is `protected`
 * (tableName, jsonFields, table, parseJson, toJson, (de)serializeJsonFields)
 * and is not part of the inherited public surface.
 *
 * `count()` is the honest exception: `BaseModel.count()` is callable with zero
 * arguments, so its seal is enforced at RUNTIME only — TS2554 cannot fire on a
 * zero-arg call. It is sealed all the same.
 *
 * Proven behaviorally, not asserted by shape (§20.2): see the tenant-isolation
 * suite in `src/__tests__/findability-sensor-model.test.ts`, which calls every
 * seal and proves cross-org reads return nothing.
 */

export interface IFindabilitySensorReading {
  id: number;
  organization_id: number;
  location_id: number | null;
  keyword: string;
  keyword_source: KeywordFamily["source"] | null;
  grid_size: number;
  radius_miles: number;
  center_lat: number | null;
  center_lng: number | null;
  solv_percent: number | null;
  arp: number | null;
  atrp: number | null;
  total_pins: number;
  known_pins: number;
  unknown_pins: number;
  ranked_pins: number;
  top_three_pins: number;
  coverage: number;
  per_pin: PinObservation[];
  open_hours_known: boolean;
  observed_at: Date;
  run_date: string;
  created_at: Date;
  updated_at: Date;
}

/** The fields a runner supplies for one snapshot. */
export type FindabilitySensorReadingInput = Omit<
  IFindabilitySensorReading,
  "id" | "created_at" | "updated_at"
>;

function toFiniteDecimal(value: unknown, field: string): number {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && value.trim() === "")
  ) {
    throw new Error(
      `Findability Sensor database field "${field}" did not contain a finite decimal.`,
    );
  }
  const normalized = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(normalized)) {
    throw new Error(
      `Findability Sensor database field "${field}" did not contain a finite decimal.`,
    );
  }
  return normalized;
}

function toFiniteNullableDecimal(value: unknown, field: string): number | null {
  return value === null || value === undefined
    ? null
    : toFiniteDecimal(value, field);
}

/**
 * PostgreSQL's `pg` driver returns NUMERIC/DECIMAL columns as strings by
 * default. The model API promises finite numbers, so normalize every decimal
 * column at the persistence boundary instead of making each consumer remember
 * which fields need `Number(...)` (§4.5).
 */
function normalizeReadingDecimals(
  row: IFindabilitySensorReading,
): IFindabilitySensorReading {
  return {
    ...row,
    radius_miles: toFiniteDecimal(row.radius_miles, "radius_miles"),
    center_lat: toFiniteNullableDecimal(row.center_lat, "center_lat"),
    center_lng: toFiniteNullableDecimal(row.center_lng, "center_lng"),
    solv_percent: toFiniteNullableDecimal(row.solv_percent, "solv_percent"),
    arp: toFiniteNullableDecimal(row.arp, "arp"),
    atrp: toFiniteNullableDecimal(row.atrp, "atrp"),
    coverage: toFiniteDecimal(row.coverage, "coverage"),
  };
}

/**
 * Columns an on-conflict re-run refreshes. Deliberately excludes the identity
 * key (organization_id, location_id, keyword, run_date) and `created_at`, so a
 * same-day re-scan updates the measurement in place and keeps the row's
 * original birth timestamp.
 */
const READING_MERGE_COLUMNS = [
  "keyword_source",
  "grid_size",
  "radius_miles",
  "center_lat",
  "center_lng",
  "solv_percent",
  "arp",
  "atrp",
  "total_pins",
  "known_pins",
  "unknown_pins",
  "ranked_pins",
  "top_three_pins",
  "coverage",
  "per_pin",
  "open_hours_known",
  "observed_at",
  "updated_at",
];

export class FindabilitySensorReadingModel extends BaseModel {
  protected static tableName = "findability_sensor_readings";
  protected static jsonFields: string[] = ["per_pin"];

  /**
   * Idempotent write: one snapshot per (organization, location, keyword,
   * run_date). A re-run on the same day updates the existing row rather than
   * stacking duplicates (spec: "one snapshot per (location, keyword-family,
   * run-date)").
   *
   * Race-safe by construction: a single INSERT ... ON CONFLICT DO UPDATE that
   * the DB resolves atomically against `fs_readings_dedup_uidx`. There is no
   * check-then-write window for a concurrent (scheduled + manual) scan to slip
   * through, and — unlike a catch-23505-and-retry — it never aborts a caller's
   * surrounding transaction, so it is safe with or without a `trx`.
   *
   * The conflict target must match the index expression exactly (including the
   * COALESCE), or Postgres cannot infer the index and raises 42P10.
   */
  static async upsertReading(
    input: FindabilitySensorReadingInput,
    trx?: QueryContext,
  ): Promise<IFindabilitySensorReading> {
    const now = new Date();
    const row = this.serializeJsonFields({
      ...input,
      location_id: input.location_id ?? null,
      created_at: now,
      updated_at: now,
    });
    const [written] = await this.table(trx)
      .insert(row)
      .onConflict(
        (trx || db).raw(
          "(organization_id, COALESCE(location_id, -1), keyword, run_date)",
        ),
      )
      .merge(READING_MERGE_COLUMNS)
      .returning("*");
    return normalizeReadingDecimals(
      this.deserializeJsonFields(written) as IFindabilitySensorReading,
    );
  }

  /**
   * The location's readings, newest first. Tenant-scoped (§11.7/§5.5):
   * `organizationId` is a REQUIRED argument and always in the WHERE clause, so
   * this can never return another organization's rows. `locationId === null`
   * selects the organization-level readings explicitly (knex renders the object
   * form as `location_id is null`, not `= NULL`), never a wildcard.
   */
  static async latestForLocation(
    organizationId: number,
    locationId: number | null,
    trx?: QueryContext,
  ): Promise<IFindabilitySensorReading[]> {
    const rows = await this.table(trx)
      .where({ organization_id: organizationId, location_id: locationId ?? null })
      .orderBy("observed_at", "desc");
    return rows.map((row: unknown) =>
      normalizeReadingDecimals(
        this.deserializeJsonFields(row) as IFindabilitySensorReading,
      ),
    );
  }

  // ── Sealed unscoped entry points (§11.7/§5.5) ────────────────────────────
  // See the SEALING NOTE above the models. `findability_sensor_readings` is a
  // tenant table; every inherited entry point whose WHERE clause is
  // caller-supplied is sealed. The scoped API above (`upsertReading`,
  // `latestForLocation`) covers every use in this slice.

  /**
   * SEALED (§11.7). `BaseModel.findById(id)` is unscoped — a caller holding a
   * guessed/leaked id would read another tenant's reading.
   * @deprecated Use {@link latestForLocation} (organizationId is required).
   */
  static async findById(): Promise<never> {
    throw new Error(
      "FindabilitySensorReadingModel.findById is unscoped and disabled — use latestForLocation(organizationId, locationId) (§11.7).",
    );
  }

  /**
   * SEALED (§11.7). `findOne({ ... })` would read any tenant's row.
   * @deprecated Use {@link latestForLocation}.
   */
  static async findOne(): Promise<never> {
    throw new Error(
      "FindabilitySensorReadingModel.findOne is unscoped and disabled — use latestForLocation(organizationId, locationId) (§11.7).",
    );
  }

  /**
   * SEALED (§11.7). `findMany({})` would return EVERY tenant's readings.
   * @deprecated Use {@link latestForLocation}.
   */
  static async findMany(): Promise<never> {
    throw new Error(
      "FindabilitySensorReadingModel.findMany is unscoped and disabled — use latestForLocation(organizationId, locationId) (§11.7).",
    );
  }

  /**
   * SEALED (§11.7/§21.1). A plain insert bypasses the ON CONFLICT merge that
   * makes a re-scan idempotent, stacking duplicate snapshots for one
   * (org, location, keyword, run_date) — or simply raising 23505 against
   * `fs_readings_dedup_uidx`. The honest write is the upsert.
   * @deprecated Use {@link upsertReading}.
   */
  static async create(): Promise<never> {
    throw new Error(
      "FindabilitySensorReadingModel.create bypasses the idempotent upsert and is disabled — use upsertReading(input) (§11.7/§21.1).",
    );
  }

  /**
   * SEALED (§11.7/§21.1) — same hazard as {@link create}, and it returns only an
   * id, so the caller cannot even see the merged row.
   * @deprecated Use {@link upsertReading}.
   */
  static async createReturningId(): Promise<never> {
    throw new Error(
      "FindabilitySensorReadingModel.createReturningId bypasses the idempotent upsert and is disabled — use upsertReading(input) (§11.7/§21.1).",
    );
  }

  /**
   * SEALED (§11.7). An unscoped update-by-id is the cross-tenant WRITE: it could
   * rewrite another organization's measurement to an arbitrary value.
   * @deprecated Use {@link upsertReading}, which merges by the identity key.
   */
  static async updateById(): Promise<never> {
    throw new Error(
      "FindabilitySensorReadingModel.updateById is unscoped and disabled — use upsertReading(input) (§11.7).",
    );
  }

  /**
   * SEALED (§11.7). An unscoped delete-by-id is the most destructive
   * cross-tenant hole — it could silently erase another practice's history.
   * @deprecated Add a tenant-scoped deleter that requires organizationId.
   */
  static async deleteById(): Promise<never> {
    throw new Error(
      "FindabilitySensorReadingModel.deleteById is unscoped and disabled — add a tenant-scoped deleteForOrg(id, organizationId) instead (§11.7).",
    );
  }

  /**
   * SEALED (§11.7). An unscoped count leaks how much data other tenants hold.
   * NOTE: `BaseModel.count()` is callable with ZERO arguments, so this seal is
   * enforced at RUNTIME only — it cannot raise TS2554 like the others. The
   * honest exception to the compile-time rule.
   * @deprecated Add a tenant-scoped countForOrg(organizationId) instead.
   */
  static async count(): Promise<never> {
    throw new Error(
      "FindabilitySensorReadingModel.count is unscoped and disabled — add a tenant-scoped countForOrg(organizationId) instead (§11.7).",
    );
  }

  /**
   * SEALED (§11.7). `paginate` runs a caller-built query with no enforced
   * organization predicate — a paged cross-tenant read.
   * @deprecated Add a tenant-scoped lister that requires organizationId.
   */
  static async paginate(): Promise<never> {
    throw new Error(
      "FindabilitySensorReadingModel.paginate is unscoped and disabled — add a tenant-scoped lister that requires organizationId instead (§11.7).",
    );
  }
}

export interface IFindabilitySensorKeywordConfig {
  id: number;
  organization_id: number;
  location_id: number | null;
  keywords: KeywordFamily[];
  grid_size: number;
  radius_miles: number;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export type FindabilitySensorKeywordConfigInput = Omit<
  IFindabilitySensorKeywordConfig,
  "id" | "created_at" | "updated_at"
>;

function normalizeConfigDecimals(
  row: IFindabilitySensorKeywordConfig,
): IFindabilitySensorKeywordConfig {
  return {
    ...row,
    radius_miles: toFiniteDecimal(row.radius_miles, "radius_miles"),
  };
}

/**
 * Columns an on-conflict save refreshes. Excludes the identity key
 * (organization_id, location_id) and `created_at` — a re-save edits the
 * location's one config in place rather than creating a second one.
 */
const CONFIG_MERGE_COLUMNS = [
  "keywords",
  "grid_size",
  "radius_miles",
  "enabled",
  "updated_at",
];

export class FindabilitySensorKeywordConfigModel extends BaseModel {
  protected static tableName = "findability_sensor_keyword_configs";
  protected static jsonFields: string[] = ["keywords"];

  /**
   * The location's one config. Tenant-scoped (§11.7/§5.5): `organizationId` is
   * REQUIRED and always in the WHERE clause. Returns `undefined` when the
   * location belongs to another organization — indistinguishable from
   * "missing", which is deliberate: it leaks no existence information.
   *
   * Reads the table directly rather than delegating to `BaseModel.findOne`,
   * which is sealed below — the scoped read must not route through an unscoped
   * entry point.
   */
  static async findForLocation(
    organizationId: number,
    locationId: number | null,
    trx?: QueryContext,
  ): Promise<IFindabilitySensorKeywordConfig | undefined> {
    const row = await this.table(trx)
      .where({ organization_id: organizationId, location_id: locationId ?? null })
      .first();
    return row
      ? normalizeConfigDecimals(
          this.deserializeJsonFields(row) as IFindabilitySensorKeywordConfig,
        )
      : undefined;
  }

  /**
   * One config per (organization, location) — enforced by the DB, not by this
   * method (review finding #1).
   *
   * A single INSERT ... ON CONFLICT DO UPDATE against `fs_configs_dedup_uidx`.
   * The previous check-then-create was a TOCTOU race: two concurrent saves for
   * the same location (a double-clicked save, or onboarding racing an owner
   * edit) could both read "no existing row" and both insert, leaving two
   * configs for one location and a scan whose keyword set depends on which row
   * it happened to read. The unique index makes that unrepresentable, and this
   * upsert converges on it instead of colliding with it.
   *
   * The conflict target must match the index expression exactly (including the
   * COALESCE, which is what stops a null-location config from escaping the
   * constraint — Postgres treats NULLs as DISTINCT in a plain unique index).
   */
  static async upsertConfig(
    input: FindabilitySensorKeywordConfigInput,
    trx?: QueryContext,
  ): Promise<IFindabilitySensorKeywordConfig> {
    const now = new Date();
    const row = this.serializeJsonFields({
      ...input,
      location_id: input.location_id ?? null,
      created_at: now,
      updated_at: now,
    });
    const [written] = await this.table(trx)
      .insert(row)
      .onConflict((trx || db).raw("(organization_id, COALESCE(location_id, -1))"))
      .merge(CONFIG_MERGE_COLUMNS)
      .returning("*");
    return normalizeConfigDecimals(
      this.deserializeJsonFields(written) as IFindabilitySensorKeywordConfig,
    );
  }

  // ── Sealed unscoped entry points (§11.7/§5.5) ────────────────────────────
  // See the SEALING NOTE above the models. `findability_sensor_keyword_configs`
  // is a tenant table; the scoped API above (`findForLocation`, `upsertConfig`)
  // covers every use in this slice.

  /**
   * SEALED (§11.7). `BaseModel.findById(id)` is unscoped — a caller holding a
   * guessed/leaked id would read another tenant's keyword configuration.
   * @deprecated Use {@link findForLocation} (organizationId is required).
   */
  static async findById(): Promise<never> {
    throw new Error(
      "FindabilitySensorKeywordConfigModel.findById is unscoped and disabled — use findForLocation(organizationId, locationId) (§11.7).",
    );
  }

  /**
   * SEALED (§11.7). `findOne({ ... })` would read any tenant's config — the
   * exact call {@link findForLocation} used to delegate to.
   * @deprecated Use {@link findForLocation}.
   */
  static async findOne(): Promise<never> {
    throw new Error(
      "FindabilitySensorKeywordConfigModel.findOne is unscoped and disabled — use findForLocation(organizationId, locationId) (§11.7).",
    );
  }

  /**
   * SEALED (§11.7). `findMany({})` would return EVERY tenant's configs.
   * @deprecated Use {@link findForLocation}.
   */
  static async findMany(): Promise<never> {
    throw new Error(
      "FindabilitySensorKeywordConfigModel.findMany is unscoped and disabled — use findForLocation(organizationId, locationId) (§11.7).",
    );
  }

  /**
   * SEALED (§11.7/§5.4). A plain insert bypasses the ON CONFLICT merge, which is
   * what makes "one config per (organization, location)" converge instead of
   * colliding — and it would let a second config exist for a location whose
   * keyword set a scan then picks non-deterministically (or raise 23505 against
   * `fs_configs_dedup_uidx`).
   * @deprecated Use {@link upsertConfig}.
   */
  static async create(): Promise<never> {
    throw new Error(
      "FindabilitySensorKeywordConfigModel.create bypasses the one-config-per-location upsert and is disabled — use upsertConfig(input) (§11.7/§5.4).",
    );
  }

  /**
   * SEALED (§11.7/§5.4) — same hazard as {@link create}.
   * @deprecated Use {@link upsertConfig}.
   */
  static async createReturningId(): Promise<never> {
    throw new Error(
      "FindabilitySensorKeywordConfigModel.createReturningId bypasses the one-config-per-location upsert and is disabled — use upsertConfig(input) (§11.7/§5.4).",
    );
  }

  /**
   * SEALED (§11.7/§5.4). An unscoped update-by-id is the cross-tenant WRITE, and
   * writing arbitrary columns it could flip `enabled` to true on another
   * organization's config — turning on a lever its owner never consented to
   * (Value #2: every lever ships OFF until the owner turns it on).
   * @deprecated Use {@link upsertConfig}.
   */
  static async updateById(): Promise<never> {
    throw new Error(
      "FindabilitySensorKeywordConfigModel.updateById is unscoped and disabled — use upsertConfig(input) (§11.7/§5.4).",
    );
  }

  /**
   * SEALED (§11.7). An unscoped delete-by-id could erase another practice's
   * keyword configuration.
   * @deprecated Add a tenant-scoped deleter that requires organizationId.
   */
  static async deleteById(): Promise<never> {
    throw new Error(
      "FindabilitySensorKeywordConfigModel.deleteById is unscoped and disabled — add a tenant-scoped deleteForOrg(id, organizationId) instead (§11.7).",
    );
  }

  /**
   * SEALED (§11.7). An unscoped count leaks how many locations other tenants
   * run. NOTE: `BaseModel.count()` is callable with ZERO arguments, so this seal
   * is enforced at RUNTIME only — it cannot raise TS2554 like the others.
   * @deprecated Add a tenant-scoped countForOrg(organizationId) instead.
   */
  static async count(): Promise<never> {
    throw new Error(
      "FindabilitySensorKeywordConfigModel.count is unscoped and disabled — add a tenant-scoped countForOrg(organizationId) instead (§11.7).",
    );
  }

  /**
   * SEALED (§11.7). `paginate` runs a caller-built query with no enforced
   * organization predicate — a paged cross-tenant read.
   * @deprecated Add a tenant-scoped lister that requires organizationId.
   */
  static async paginate(): Promise<never> {
    throw new Error(
      "FindabilitySensorKeywordConfigModel.paginate is unscoped and disabled — add a tenant-scoped lister that requires organizationId instead (§11.7).",
    );
  }
}
