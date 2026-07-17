import { BaseModel, QueryContext } from "./BaseModel";

/**
 * NAP-consistency observation — Alloro Funnel Engine A4. A time-series log: one
 * row per (location, run_date). `conflicts` is the specific listings that
 * disagree (source/host/matchState), so an operator can act. A log, never a score.
 */

export interface INapConsistencyObservation {
  id: string;
  organization_id: number;
  location_id: number;
  run_date: string;
  sources_checked: number;
  consistent_count: number;
  conflict_count: number;
  conflicts: unknown[];
  observed_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface RecordNapObservationInput {
  organizationId: number;
  locationId: number;
  runDate: string;
  sourcesChecked: number;
  consistentCount: number;
  conflictCount: number;
  conflicts: unknown[];
  observedAt: Date;
}

/**
 * Tenant-scoped per §11.7/§5.5 — `organizationId` is a REQUIRED parameter on the
 * read path, never an optional filter a caller can skip. EVERY unscoped
 * `BaseModel` read/write entry point is SEALED rather than inherited, so the
 * scope cannot be bypassed by accident or on purpose. The only ways into this
 * table are {@link record}, {@link hasObservationForLogicalRun}, and
 * {@link listForLocation}.
 *
 * The sealed set was derived by ENUMERATING `BaseModel`'s public static surface
 * (`src/models/BaseModel.ts`), not from a remembered list. That surface is 11
 * public statics; 9 of them touch the table and are sealed here:
 *   findById, findOne, findMany, create, createReturningId, updateById,
 *   deleteById, paginate  → sealed at COMPILE time (TS2554)
 *   count                 → sealed at RUNTIME only (see the note on {@link count})
 *
 * The remaining 2 — `transaction` and `beginTransaction` — are deliberately NOT
 * sealed, and this is a reasoned exception rather than an oversight:
 *   - Neither reads or writes this table. They open a transaction boundary and
 *     hand back a `Knex.Transaction`.
 *   - Sealing them here would be security theater: `BaseModel` is the base of
 *     every model, so the identical handle is one `AnyOtherModel.transaction()`
 *     away. The seal would cost the caller nothing to route around.
 *   - The §6.1 pattern REQUIRES them: `record(input, trx?)` and
 *     `listForLocation(org, loc, limit, trx?)` both accept a `QueryContext`, so
 *     a caller composing an atomic multi-model write needs a handle from
 *     somewhere. Sealing them would break the documented transaction pattern
 *     while closing no hole.
 * The residual is honest and named: anyone holding a raw `trx` can query any
 * table unscoped. That is a property of the whole `models/` layer, not of this
 * table, and is out of scope for a per-model seal.
 */
export class NapConsistencyObservationModel extends BaseModel {
  protected static tableName = "nap_consistency_observation";

  /**
   * Idempotent per (location, run_date): a second write for the same run day is
   * ignored (a log, not a score).
   *
   * Returns whether a row was ACTUALLY inserted. `false` means the conflict
   * target already had a row and this call was a no-op — callers must not count
   * that as a new observation. `ON CONFLICT DO NOTHING RETURNING id` yields zero
   * rows on the ignore path, which is the signal.
   */
  static async record(
    input: RecordNapObservationInput,
    trx?: QueryContext
  ): Promise<boolean> {
    const inserted = await this.table(trx)
      .insert({
        organization_id: input.organizationId,
        location_id: input.locationId,
        run_date: input.runDate,
        sources_checked: input.sourcesChecked,
        consistent_count: input.consistentCount,
        conflict_count: input.conflictCount,
        conflicts: JSON.stringify(input.conflicts),
        observed_at: input.observedAt,
      })
      .onConflict(["location_id", "run_date"])
      .ignore()
      .returning("id");
    return inserted.length > 0;
  }

  /**
   * Pre-measurement idempotency guard (§21.1). A BullMQ retry uses the same
   * logical run date, so a location already persisted by an earlier attempt is
   * skipped before another paid provider request. Tenant and location are both
   * required even though the database uniqueness key is (location, run_date).
   */
  static async hasObservationForLogicalRun(
    organizationId: number,
    locationId: number,
    runDate: string,
    trx?: QueryContext
  ): Promise<boolean> {
    const row = await this.table(trx)
      .where({
        organization_id: organizationId,
        location_id: locationId,
        run_date: runDate,
      })
      .first("id");
    return Boolean(row);
  }

  /**
   * Tenant-scoped read (§11.7): organizationId is a REQUIRED argument and the
   * query filters by BOTH organization and location, so one tenant can never
   * read another's observations even if a location_id is guessed or reused.
   */
  static async listForLocation(
    organizationId: number,
    locationId: number,
    limit = 100,
    trx?: QueryContext
  ): Promise<INapConsistencyObservation[]> {
    const rows = await this.table(trx)
      .where({ organization_id: organizationId, location_id: locationId })
      .orderBy("observed_at", "desc")
      .limit(limit);
    // jsonb comes back parsed under node-pg, but be explicit either way.
    return rows.map((r: INapConsistencyObservation) => ({
      ...r,
      conflicts:
        typeof r.conflicts === "string"
          ? JSON.parse(r.conflicts)
          : r.conflicts ?? [],
    }));
  }

  // ── Sealed unscoped entry points (§11.7 / §5.5) ──────────────────────────
  // `nap_consistency_observation` is a tenant-scoped table (`organization_id`).
  // `BaseModel` exposes id-based and condition-based reads/writes whose WHERE
  // clause is whatever the CALLER passes — on this table that is a cross-tenant
  // read or write with no organization predicate. Inheriting them would make the
  // §11.7 scope on `listForLocation` bypassable, so each is overridden to take
  // NO arguments: any real call is a COMPILE error (TS2554), and the runtime
  // throw is the backstop for untyped/JS callers. TypeScript forbids widening a
  // base signature with a required param (TS2417), which is why this is a seal +
  // a scoped sibling rather than an extra argument on the inherited method.

  /**
   * SEALED (§11.7). `BaseModel.findById(id)` filters on `{ id }` alone, so it
   * would return another tenant's observation to anyone holding a guessed or
   * leaked uuid.
   * @deprecated Use {@link listForLocation}(organizationId, locationId).
   */
  static async findById(): Promise<never> {
    throw new Error(
      "NapConsistencyObservationModel.findById is unscoped and disabled — use listForLocation(organizationId, locationId) (§11.7)."
    );
  }

  /**
   * SEALED (§11.7). `findOne({ location_id })` would read whichever tenant's row
   * happens to match first — two orgs can share a `location_id`.
   * @deprecated Use {@link listForLocation}(organizationId, locationId).
   */
  static async findOne(): Promise<never> {
    throw new Error(
      "NapConsistencyObservationModel.findOne is unscoped and disabled — use listForLocation(organizationId, locationId) (§11.7)."
    );
  }

  /**
   * SEALED (§11.7). `findMany({})` would return EVERY tenant's observations.
   * @deprecated Use {@link listForLocation}(organizationId, locationId).
   */
  static async findMany(): Promise<never> {
    throw new Error(
      "NapConsistencyObservationModel.findMany is unscoped and disabled — use listForLocation(organizationId, locationId) (§11.7)."
    );
  }

  /**
   * SEALED (§11.7 / §20.1). `BaseModel.create` inserts an arbitrary record: it
   * would let a caller write a row under ANY `organization_id`, and — bypassing
   * the `onConflict(["location_id","run_date"]).ignore()` target — break the
   * idempotency contract {@link record} exists to enforce. The executor counts
   * the boolean {@link record} returns; a raw insert has no such signal.
   * @deprecated Use {@link record}.
   */
  static async create(): Promise<never> {
    throw new Error(
      "NapConsistencyObservationModel.create bypasses the tenant scope and the per-(location, run_date) idempotency contract and is disabled — use record(input) (§11.7/§20.1)."
    );
  }

  /**
   * SEALED (§11.7 / §20.1) — see {@link create}. Same arbitrary insert, and the
   * id it returns would come from a row that skipped the conflict target.
   * @deprecated Use {@link record}.
   */
  static async createReturningId(): Promise<never> {
    throw new Error(
      "NapConsistencyObservationModel.createReturningId bypasses the tenant scope and the idempotency contract and is disabled — use record(input) (§11.7/§20.1)."
    );
  }

  /**
   * SEALED (§11.7). An unscoped update-by-id is the cross-tenant WRITE — it
   * could rewrite another org's observation, and this table is an append-only
   * log: a recorded observation is never edited after the fact.
   * @deprecated No scoped counterpart — observations are immutable once written.
   */
  static async updateById(): Promise<never> {
    throw new Error(
      "NapConsistencyObservationModel.updateById is unscoped and disabled — observations are an append-only log and are never mutated (§11.7)."
    );
  }

  /**
   * SEALED (§11.7). An unscoped delete-by-id is the most destructive
   * cross-tenant hole of the set — it would drop another org's history.
   * @deprecated No scoped counterpart yet — add a deleteByIdForOrg(id, organizationId) rather than unsealing this.
   */
  static async deleteById(): Promise<never> {
    throw new Error(
      "NapConsistencyObservationModel.deleteById is unscoped and disabled — add a tenant-scoped deleteByIdForOrg(id, organizationId) instead (§11.7)."
    );
  }

  /**
   * SEALED (§11.7). `paginate` runs a caller-built query with no enforced
   * organization predicate — a paged cross-tenant read.
   * @deprecated Add a tenant-scoped lister rather than unsealing this.
   */
  static async paginate(): Promise<never> {
    throw new Error(
      "NapConsistencyObservationModel.paginate is unscoped and disabled — add a tenant-scoped lister that requires organizationId instead (§11.7)."
    );
  }

  /**
   * SEALED (§11.7). An unscoped count leaks the size of other tenants' data.
   *
   * HONEST EXCEPTION — this is the one seal in this class that is NOT enforced
   * at compile time. `BaseModel.count(conditions?, trx?)` takes ALL-optional
   * arguments, so `count()` with zero args already type-checks against the
   * zero-arg override: TS2554 cannot fire and the RUNTIME throw is the only
   * guard. A JS caller, or a TS caller writing bare `count()`, gets an
   * exception rather than a compile error. Documented rather than papered over.
   * Add a `countForOrg(organizationId)` when a caller needs one; none does today.
   * @deprecated No scoped counterpart yet — add one rather than unsealing this.
   */
  static async count(): Promise<never> {
    throw new Error(
      "NapConsistencyObservationModel.count is unscoped and disabled — add a tenant-scoped countForOrg(organizationId) instead (§11.7)."
    );
  }
}
