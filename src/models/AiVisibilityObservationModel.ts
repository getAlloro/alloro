import { BaseModel, QueryContext } from "./BaseModel";

/**
 * AI-Answer Visibility (AEO) observation — Alloro Funnel Engine A3.
 * A LOG: one row per (location, prompt, engine, run_date). `position` is stored
 * raw for analysis and is NEVER surfaced as a rank. `engine`/`capture_method`
 * are DB-CHECK-constrained strings (the strict unions live in the service layer,
 * so the model imports no service type).
 */

export interface IAiVisibilityObservation {
  id: string;
  organization_id: number;
  location_id: number;
  engine: string;
  capture_method: string;
  prompt_key: string;
  prompt_text: string;
  mentioned: boolean;
  cited: boolean;
  cited_source: string | null;
  position: number | null;
  raw_excerpt: string;
  run_date: string;
  observed_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface RecordObservationInput {
  organizationId: number;
  locationId: number;
  engine: string;
  captureMethod: string;
  promptKey: string;
  promptText: string;
  mentioned: boolean;
  cited: boolean;
  citedSource: string | null;
  position: number | null;
  rawExcerpt: string;
  /** "YYYY-MM-DD" — the run day, part of the idempotency key. */
  runDate: string;
  observedAt: Date;
}

/**
 * Tenant-scoped per §11.7/§5.5 — `ai_visibility_observation` carries an
 * `organization_id`, so `organizationId` is a REQUIRED parameter on the read,
 * never an optional filter a caller can forget. EVERY unscoped `BaseModel`
 * entry point is sealed rather than inherited (`findById`, `findOne`,
 * `findMany`, `create`, `createReturningId`, `updateById`, `deleteById`,
 * `count`, `paginate`), so the scope cannot be bypassed by accident or on
 * purpose. The sanctioned surface is exactly two methods: {@link record} to
 * write and {@link listForLocation} to read.
 *
 * The seals override each method to take NO arguments, which makes any real
 * call a COMPILE error (TS2554) rather than a runtime hope; the throw is the
 * backstop for untyped/JS callers. TypeScript forbids widening a base
 * signature with a required parameter (TS2417), which is why this is a seal
 * plus a scoped sibling rather than an extra argument on `findById` itself.
 *
 * HONEST EXCEPTION — `count()`: `BaseModel.count()` is callable with zero
 * arguments, so the arity trick cannot fire and that seal is RUNTIME-ONLY.
 * It is documented rather than papered over. See {@link count}.
 *
 * HONEST RESIDUAL — `transaction()` / `beginTransaction()` are inherited
 * public statics that are deliberately NOT sealed. They never touch
 * `tableName`; they hand back a Knex transaction handle, which is the
 * sanctioned BaseModel pattern (the transaction boundary lives in the
 * orchestration layer while the raw `db` handle stays owned by `models/`).
 * Sealing them here would close nothing — the identical handle is reachable
 * through every other model — and would break that pattern for this one class.
 * The breadth of a raw handle is a BaseModel-wide property, not a hole this
 * batch opens.
 *
 * WIRING STATUS: `listForLocation` has no production caller yet — the read
 * path is a tested capability, not a live route. Do not describe it as one.
 */
export class AiVisibilityObservationModel extends BaseModel {
  protected static tableName = "ai_visibility_observation";

  /**
   * Idempotent insert: a second write for the same (location, prompt, engine,
   * run_date) is ignored (no duplicate observation, no error). A log, not a score.
   *
   * @returns `true` when a NEW row was inserted, `false` when an existing row
   * made this a no-op. The caller MUST have this to report what was actually
   * captured: counting an ignored conflict as a fresh observation overstates the
   * run (an idempotent re-run would claim to have captured a full set again).
   */
  static async record(
    input: RecordObservationInput,
    trx?: QueryContext
  ): Promise<boolean> {
    const inserted = await this.table(trx)
      .insert({
        organization_id: input.organizationId,
        location_id: input.locationId,
        engine: input.engine,
        capture_method: input.captureMethod,
        prompt_key: input.promptKey,
        prompt_text: input.promptText,
        mentioned: input.mentioned,
        cited: input.cited,
        cited_source: input.citedSource,
        position: input.position,
        raw_excerpt: input.rawExcerpt,
        run_date: input.runDate,
        observed_at: input.observedAt,
      })
      .onConflict(["location_id", "prompt_key", "engine", "run_date"])
      .ignore()
      .returning("id");
    // PostgreSQL returns no row for an ignored conflict, one for a real insert.
    return inserted.length > 0;
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
  ): Promise<IAiVisibilityObservation[]> {
    return this.table(trx)
      .where({ organization_id: organizationId, location_id: locationId })
      .orderBy("observed_at", "desc")
      .limit(limit);
  }

  // ── Sealed unscoped entry points (§11.7 / §5.5) ──────────────────────────
  // `BaseModel` exposes id-based and condition-based reads/writes whose WHERE
  // clause is whatever the CALLER passes. On a tenant table that is a
  // cross-tenant read/write with no organization predicate — the isolation
  // guarantee on `listForLocation` would only hold for callers who remembered
  // to add one. Each is overridden to take no arguments, so any real call is a
  // COMPILE error (TS2554); the runtime throw backstops untyped callers.

  /**
   * SEALED (§11.7). `BaseModel.findById(id)` is unscoped, so inheriting it
   * would hand every caller a cross-tenant read of `ai_visibility_observation`
   * — a leaked or guessed uuid would read another org's observations.
   * @deprecated Use {@link listForLocation}, which requires an organizationId.
   */
  static async findById(): Promise<never> {
    throw new Error(
      "AiVisibilityObservationModel.findById is unscoped and disabled — use listForLocation(organizationId, locationId) (§11.7)."
    );
  }

  /**
   * SEALED (§11.7). `findOne({ location_id })` would read another tenant's row
   * at a reused or guessed location_id, with no organization predicate.
   * @deprecated Use {@link listForLocation}.
   */
  static async findOne(): Promise<never> {
    throw new Error(
      "AiVisibilityObservationModel.findOne is unscoped and disabled — use listForLocation(organizationId, locationId) (§11.7)."
    );
  }

  /**
   * SEALED (§11.7). `findMany({})` would return EVERY tenant's observations.
   * @deprecated Use {@link listForLocation}.
   */
  static async findMany(): Promise<never> {
    throw new Error(
      "AiVisibilityObservationModel.findMany is unscoped and disabled — use listForLocation(organizationId, locationId) (§11.7)."
    );
  }

  /**
   * SEALED (§11.7). `BaseModel.create` inserts an arbitrary record, which
   * bypasses BOTH guarantees {@link record} enforces: the
   * (location, prompt, engine, run_date) idempotency key — an unguarded insert
   * duplicates an observation and overstates a run — and the explicit column
   * copy. It would also write a caller-supplied `organization_id` with no
   * check, planting a row in another tenant's data.
   * @deprecated Use {@link record}.
   */
  static async create(): Promise<never> {
    throw new Error(
      "AiVisibilityObservationModel.create bypasses the idempotent record() contract and is disabled — use record(input) (§11.7/§5.4)."
    );
  }

  /**
   * SEALED (§11.7/§5.4). Same hole as {@link create} — an arbitrary insert that
   * skips the idempotency key and the tenant check. (This one is easy to miss:
   * it is not on the usual list of unscoped readers, but it is a full write.)
   * @deprecated Use {@link record}.
   */
  static async createReturningId(): Promise<never> {
    throw new Error(
      "AiVisibilityObservationModel.createReturningId bypasses the idempotent record() contract and is disabled — use record(input) (§11.7/§5.4)."
    );
  }

  /**
   * SEALED (§11.7). An unscoped update-by-id is the cross-tenant WRITE: it
   * could rewrite another org's observation — and since this table is an
   * append-only LOG, no scoped counterpart should exist at all.
   * @deprecated Observations are immutable; there is no scoped update.
   */
  static async updateById(): Promise<never> {
    throw new Error(
      "AiVisibilityObservationModel.updateById is unscoped and disabled — observations are an append-only log with no scoped update (§11.7)."
    );
  }

  /**
   * SEALED (§11.7). An unscoped delete-by-id is the most destructive
   * cross-tenant hole — it would erase another org's observation.
   * @deprecated Rows are removed only by the organization/location CASCADE.
   * Add a `deleteByIdForOrg(id, organizationId)` rather than unsealing this.
   */
  static async deleteById(): Promise<never> {
    throw new Error(
      "AiVisibilityObservationModel.deleteById is unscoped and disabled — add a tenant-scoped deleteByIdForOrg(id, organizationId) instead (§11.7)."
    );
  }

  /**
   * SEALED (§11.7). An unscoped count leaks the size of other tenants' data.
   *
   * NOTE — the honest exception: `BaseModel.count()` is callable with ZERO
   * arguments, so overriding the arity cannot make a call a compile error the
   * way it does for every seal above. `AiVisibilityObservationModel.count()`
   * still TYPE-CHECKS; this seal fires only at RUNTIME. That is a real gap in
   * the compile-time guarantee, stated rather than hidden. Add a
   * `countForOrg(organizationId)` when a caller needs one; none does today.
   * @deprecated No scoped counterpart yet — add one rather than unsealing this.
   */
  static async count(): Promise<never> {
    throw new Error(
      "AiVisibilityObservationModel.count is unscoped and disabled — add a tenant-scoped countForOrg(organizationId) instead (§11.7)."
    );
  }

  /**
   * SEALED (§11.7). `paginate` runs a caller-built query with no enforced
   * organization predicate — a paged cross-tenant read.
   * @deprecated Add a tenant-scoped lister rather than unsealing this.
   */
  static async paginate(): Promise<never> {
    throw new Error(
      "AiVisibilityObservationModel.paginate is unscoped and disabled — add a tenant-scoped lister that requires organizationId instead (§11.7)."
    );
  }
}
