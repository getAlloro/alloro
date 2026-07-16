import { BaseModel, QueryContext } from "../BaseModel";
import type { TasteProfile, TasteProfileAudit } from "../../types/tasteProfile";

export type TasteProfileStatus = "draft" | "approved";

export interface ITasteProfile {
  id: string;
  organization_id: number;
  location_id: number | null;
  status: TasteProfileStatus;
  business_name: string | null;
  business_category: string | null;
  profile: TasteProfile;
  source_summary: TasteProfileAudit;
  approved_by: string | null;
  approved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * DB-correctness layer for `taste_profiles` — one composed, source-linked
 * Taste Profile per business (Slice 2). Thin model, all DB access here, no
 * business logic (§6.1 reference: `GbpReviewInsightModel` / `PracticeFactModel`).
 * The honesty gate + composition live in the service layer
 * (`service.taste-profile.ts`); this model only persists the gated result.
 *
 * Tenant-scoped per §11.7/§5.5 — `organizationId` is a REQUIRED parameter on
 * every read and every mutation, never an optional filter a caller can skip.
 * EVERY unscoped `BaseModel` entry point is sealed rather than inherited
 * (`findById`, `findOne`, `findMany`, `updateById`, `deleteById`, `count`,
 * `paginate`, `createReturningId`), so the scope cannot be bypassed by accident
 * or on purpose; use `findByIdForOrg` / `findLatestByOrgAndLocation` /
 * `deleteByIdForOrg` / `markApproved(id, organizationId, …)`.
 * `location_id` is a nullable dimension (null = organization-level profile),
 * handled explicitly like `PracticeFactModel.findByOrgAndLocation`.
 *
 * Status is not a caller-supplied field: `create()` always writes a `draft`, and
 * `approved` is reachable ONLY through `markApproved()`, which stamps
 * `approved_by`/`approved_at` in the same write (§5.4 — the owner sign-off is
 * enforced here on the server, never assumed from the caller's input).
 *
 * The owner signature is WRITE-ONCE PER ROW (§5.4). `draft -> approved` is a
 * one-way transition guarded in the WHERE clause, so an approved ROW can never
 * be re-approved and its `approved_by`/`approved_at` can never be reattributed
 * to a different person or time. Through this model's typed public API, the
 * column-writing paths are `create()` (draft-only, explicit column copy),
 * `markApproved()` (draft-only transition) and `deleteByIdForOrg()` (removes
 * the row) — every other inherited writer is sealed.
 * `TasteProfileModel.test.ts` enforces that list by enumerating the class's
 * whole callable surface, so a newly added or newly inherited write path FAILS
 * the suite until it is audited against this rule.
 *
 * READ THE SCOPE OF THAT GUARANTEE HONESTLY — it is per-row and per-typed-API,
 * and it is NOT a claim that an org's approval history cannot be laundered:
 *
 *  1. DELETE-AND-REPLACE IS NOT BLOCKED, and it is not a row rewrite: an
 *     `deleteByIdForOrg()` + `create()` + `markApproved()` sequence — every
 *     call tenant-scoped, typed, and legitimate on its own — yields a NEW
 *     approved row signed by whoever ran it. Because consumers read by
 *     org+location via `findLatestByOrgAndLocation` (not by id), the
 *     ORGANIZATION-LEVEL profile is then signed by that person with no trace of
 *     the previous signature. Whether an owner may delete and re-approve their
 *     own org's profile is a POLICY question for the surface that exposes
 *     delete — there is no such surface yet (this model has no importers), so
 *     no policy is invented here. It is recorded, not silently implied away.
 *  2. RAW-HANDLE WRITES BYPASS THIS MODEL ENTIRELY. `table()` is `protected` in
 *     TypeScript only, so at runtime `(Model as any).table()` returns a live
 *     knex builder; `transaction()`/`beginTransaction()` likewise hand back a
 *     handle that can write any table. Neither is guarded here. This is true of
 *     every model in the repo — the model is the enforcement boundary for
 *     TYPED callers, not the database. Real enforcement against a raw writer
 *     would be a DB-level CHECK/trigger, which this table does not have.
 *
 * So: no TYPED caller can rewrite an existing row's signature. That is the
 * guarantee, and it is the one Dave's finding asked for. It is not "the audit
 * trail is tamper-proof".
 *
 * Persisted JSONB shapes come from the neutral `types/tasteProfile` module —
 * never from the composition service, which is a controller-layer module (§7.1).
 *
 * WIRING STATUS: this model has NO importers yet — the compose→persist path has
 * no production entry point (see the WIRING STATUS block in
 * `controllers/admin-websites/feature-services/service.taste-profile.ts`). It is
 * a tested capability, not a live path; do not describe it as one.
 */
export class TasteProfileModel extends BaseModel {
  protected static tableName = "taste_profiles";
  // JSONB columns — serialized on write / parsed on read by BaseModel.
  protected static jsonFields = ["profile", "source_summary"];

  /**
   * Insert a new taste-profile record. ALWAYS a `draft` (§5.4).
   *
   * `status` is deliberately NOT part of the input type: a profile that is
   * `approved` must carry the owner who signed it off and when. Letting a caller
   * pass `status: "approved"` here would mint an approved row with a null
   * `approved_by`/`approved_at` — an unsigned approval that later reads as a
   * real one. The only route to `approved` is {@link markApproved}, which sets
   * the status and the sign-off stamp in one write. Fields are copied
   * explicitly (never spread), so no extra column can ride in on the object.
   */
  static async create(
    data: Omit<
      ITasteProfile,
      "id" | "status" | "approved_by" | "approved_at" | "created_at" | "updated_at"
    >,
    trx?: QueryContext
  ): Promise<ITasteProfile> {
    return super.create(
      {
        organization_id: data.organization_id,
        location_id: data.location_id,
        status: "draft",
        business_name: data.business_name,
        business_category: data.business_category,
        profile: data.profile,
        source_summary: data.source_summary,
      },
      trx
    );
  }

  /**
   * SEALED (§11.7/§5.4) — `BaseModel.createReturningId` inserts an arbitrary
   * record, which would bypass BOTH guarantees {@link create} enforces: the
   * always-`draft` status and the explicit column copy. Disabled at compile time
   * so the only way into this table is the checked `create()` above.
   *
   * @deprecated Use {@link create}.
   */
  static async createReturningId(): Promise<never> {
    throw new Error(
      "TasteProfileModel.createReturningId bypasses the draft-only create contract and is disabled — use create() (§5.4)."
    );
  }

  /**
   * Read one profile by id, scoped to its owning organization (§11.7/§5.5).
   * `organizationId` is REQUIRED and always applied to the WHERE clause — a
   * caller holding only a leaked/guessed uuid cannot read another org's row
   * (analog: `GbpWorkItemModel.findByIdForScope`). Returns `undefined` when the
   * id belongs to a different organization — indistinguishable from "missing",
   * which is deliberate: it leaks no existence information across tenants.
   */
  static async findByIdForOrg(
    id: string,
    organizationId: number,
    trx?: QueryContext
  ): Promise<ITasteProfile | undefined> {
    const row = await this.table(trx)
      .where({ id, organization_id: organizationId })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  /**
   * SEALED (§11.7). `BaseModel.findById(id)` is unscoped, so inheriting it would
   * hand every caller a cross-tenant read of `taste_profiles`. Overriding it to
   * take no arguments makes `TasteProfileModel.findById(id)` a COMPILE error
   * (TS2554), not a runtime hope — the org scope cannot be forgotten.
   * TypeScript forbids widening the base signature with a required param
   * (TS2417), which is why this is a seal + a scoped sibling rather than an
   * extra argument on `findById` itself.
   *
   * @deprecated Use {@link findByIdForOrg}.
   */
  static async findById(): Promise<never> {
    throw new Error(
      "TasteProfileModel.findById is unscoped and disabled — use findByIdForOrg(id, organizationId) (§11.7)."
    );
  }

  /**
   * Latest profile for an organization (+ optional location), newest first.
   * Tenant-scoped: `organizationId` is required. `location_id === null` selects
   * the organization-level profile explicitly (never a wildcard).
   */
  static async findLatestByOrgAndLocation(
    organizationId: number,
    locationId: number | null,
    trx?: QueryContext
  ): Promise<ITasteProfile | undefined> {
    const query = this.table(trx).where({ organization_id: organizationId });
    if (locationId === null) {
      query.whereNull("location_id");
    } else {
      query.where({ location_id: locationId });
    }
    const row = await query.orderBy("created_at", "desc").first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  /**
   * Mark a profile approved (Tier 3 owner sign-off). AI drafts; the human
   * stakes — nothing publishes until this flips `status` to `approved`.
   *
   * Tenant-scoped (§11.7): `organizationId` is REQUIRED and part of the WHERE
   * clause, so an owner can only ever approve their OWN profile.
   *
   * WRITE-ONCE (§5.4). The WHERE also carries `status: "draft"`, so this is a
   * one-way `draft -> approved` transition: the row STOPS matching its own
   * update predicate the moment it is approved. A second call — by the same
   * owner or a different one — matches 0 rows and cannot rewrite `approved_by`
   * or `approved_at`. THIS ROW's original signature cannot be rewritten by any
   * typed caller. (It is not a claim that the org's approval history is
   * tamper-proof — see the class docstring: delete-and-replace and raw-handle
   * writes are both outside this guarantee, and are recorded, not implied away.)
   *
   * The guard is one atomic guarded UPDATE rather than a read-then-write check,
   * which would race: two concurrent approvals could both read `draft` and both
   * write, the second silently reattributing the signature the first recorded.
   * Under Postgres READ COMMITTED a second concurrent UPDATE blocks on the
   * first's row lock and, on commit, re-evaluates its WHERE against the updated
   * row (EvalPlanQual); it no longer matches `status = 'draft'` and reports 0.
   * Under REPEATABLE READ/SERIALIZABLE it raises a serialization failure
   * instead. Either way the signature is not overwritten — only the observable
   * differs. NOTE: that concurrency behaviour is reasoned from documented
   * Postgres semantics, not observed — there is no live database in this
   * branch's environment, so no test here executes concurrent transactions.
   *
   * Why that matters: `approved_by`/`approved_at` are the audit record of WHO
   * staked this profile and WHEN. A signature that a later caller can silently
   * overwrite is not a signature — the whole owner-approval gate would be
   * decorative, and the audit trail would attribute a sign-off to someone who
   * never made it. The guard is POSITIVE (`status = draft`), not a negative
   * `whereNot status = approved`, so it fails closed: any status added later is
   * non-transitionable until this predicate is deliberately widened.
   *
   * Returns the number of rows updated: 1 when the transition happened, 0 when
   * it did not. A 0 deliberately does NOT distinguish "wrong organization" from
   * "no such id" from "already approved":
   *  - The first two MUST stay indistinguishable — telling them apart is the
   *    cross-tenant existence leak {@link findByIdForOrg} avoids by design.
   *  - Choosing a no-op over a thrown `AlreadyApprovedError` is deliberate.
   *    Re-approval is not a crash: an at-least-once job, a retried request, or a
   *    double-clicked Approve button all re-issue the call, and the desired end
   *    state already holds — so the safe, idempotent answer is "0 rows changed",
   *    not an exception the caller must catch to behave correctly. §21.1 is
   *    explicit that a repeat run must be SAFE, not loud: "a job may run more
   *    than once (retries, at-least-once delivery); design every job so a repeat
   *    run is safe." A guarded UPDATE is exactly the idempotency guard it asks
   *    for, and this transition is the kind of thing a job will retry.
   *    PRECISELY: a SEQUENTIAL repeat (the retry case §21.1 is about — the first
   *    call already committed) returns 0 at every isolation level. A CONCURRENT
   *    second writer is a different scenario: under READ COMMITTED it also
   *    returns 0, but under REPEATABLE READ/SERIALIZABLE it raises `40001
   *    could not serialize access due to concurrent update` rather than
   *    returning 0. Since this method accepts a `trx`, a caller threading a
   *    REPEATABLE READ transaction must expect that throw. The signature is not
   *    overwritten in either case — but "always returns 0, never throws" would
   *    be a false contract, so it is not claimed. Whether a 0
   *    is a 404, a 409, or a benign no-op is a POLICY question that depends on
   *    the surface asking, and this is a thin DB-correctness layer with no
   *    business logic in it (§6.1). The model's job is to make the illegal write
   *    impossible and report what it did; the caller reads the row back with
   *    {@link findByIdForOrg} — within its own org scope — to decide what a 0
   *    means for its user.
   */
  static async markApproved(
    id: string,
    organizationId: number,
    approvedBy: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id, organization_id: organizationId, status: "draft" })
      .update({
        status: "approved",
        approved_by: approvedBy,
        approved_at: new Date(),
        updated_at: new Date(),
      });
  }

  /**
   * Delete one profile by id, scoped to its owning organization (§11.7).
   * `organizationId` is REQUIRED — a caller cannot delete another org's row.
   * Returns the number of rows deleted (0 = wrong org, or already gone).
   */
  static async deleteByIdForOrg(
    id: string,
    organizationId: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id, organization_id: organizationId }).del();
  }

  /**
   * SEALED (§11.7) — see {@link findById}. An unscoped delete-by-id is the most
   * destructive cross-tenant hole of the three; disabled at compile time.
   *
   * @deprecated Use {@link deleteByIdForOrg}.
   */
  static async deleteById(): Promise<never> {
    throw new Error(
      "TasteProfileModel.deleteById is unscoped and disabled — use deleteByIdForOrg(id, organizationId) (§11.7)."
    );
  }

  // ── Sealed generic entry points (§11.7) ──────────────────────────────────
  // `BaseModel` exposes condition-based reads and an id-based update whose WHERE
  // clause is whatever the CALLER passes. On a tenant table that is a
  // cross-tenant read/write with no organization predicate — the isolation
  // guarantee above would only hold for callers who remembered to add one. Each
  // is overridden to take no arguments, so any real call is a COMPILE error
  // (TS2554) and the org scope cannot be forgotten; the runtime throw is the
  // backstop for untyped/JS callers. Scoped siblings above cover every use.

  /**
   * SEALED (§11.7). `findOne({ id })` would read any tenant's row.
   * @deprecated Use {@link findByIdForOrg} or {@link findLatestByOrgAndLocation}.
   */
  static async findOne(): Promise<never> {
    throw new Error(
      "TasteProfileModel.findOne is unscoped and disabled — use findByIdForOrg(id, organizationId) or findLatestByOrgAndLocation(organizationId, locationId) (§11.7)."
    );
  }

  /**
   * SEALED (§11.7). `findMany({})` would return EVERY tenant's rows.
   * @deprecated Use {@link findLatestByOrgAndLocation}.
   */
  static async findMany(): Promise<never> {
    throw new Error(
      "TasteProfileModel.findMany is unscoped and disabled — use findLatestByOrgAndLocation(organizationId, locationId) (§11.7)."
    );
  }

  /**
   * SEALED (§11.7/§5.4). An unscoped update-by-id is the cross-tenant WRITE:
   * it could mutate another org's profile, and — writing arbitrary columns — set
   * `status: "approved"` with no owner sign-off, defeating {@link markApproved}.
   * @deprecated Use {@link markApproved}.
   */
  static async updateById(): Promise<never> {
    throw new Error(
      "TasteProfileModel.updateById is unscoped and disabled — use markApproved(id, organizationId, approvedBy) (§11.7/§5.4)."
    );
  }

  /**
   * SEALED (§11.7). An unscoped count leaks the size of other tenants' data.
   * NOTE: `BaseModel.count()` is callable with zero arguments, so this seal is
   * enforced at RUNTIME rather than by TS2554 — the honest exception to the
   * compile-time rule. Add a `countForOrg(organizationId)` when a caller needs
   * one; none does today.
   * @deprecated No scoped counterpart yet — add one rather than unsealing this.
   */
  static async count(): Promise<never> {
    throw new Error(
      "TasteProfileModel.count is unscoped and disabled — add a tenant-scoped countForOrg(organizationId) instead (§11.7)."
    );
  }

  /**
   * SEALED (§11.7). `paginate` runs a caller-built query with no enforced
   * organization predicate — a paged cross-tenant read.
   * @deprecated Add a tenant-scoped lister rather than unsealing this.
   */
  static async paginate(): Promise<never> {
    throw new Error(
      "TasteProfileModel.paginate is unscoped and disabled — add a tenant-scoped lister that requires organizationId instead (§11.7)."
    );
  }
}
