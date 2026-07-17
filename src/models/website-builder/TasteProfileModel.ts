import type { Knex } from "knex";
import { BaseModel } from "../BaseModel";
import type { QueryContext } from "../BaseModel";
import type { TasteProfile, TasteProfileAudit } from "../../types/tasteProfile";

const TASTE_PROFILE_APPROVAL_LOCK_NAMESPACE = 0x54505246;
const APPROVAL_SCOPE_LOCK_SQL =
  "SELECT pg_advisory_xact_lock(?::integer, hashtext(?::text))";

function approvalScopeLockKey(
  organizationId: number,
  locationId: number | null
): string {
  const locationScope =
    locationId === null ? "organization" : `location:${locationId}`;
  return `${organizationId}:${locationScope}`;
}

function requireTransaction(trx: Knex.Transaction): void {
  if (trx.isTransaction !== true) {
    throw new TypeError(
      "TasteProfileModel.markApproved requires a Knex.Transaction when a context is supplied."
    );
  }
}

async function lockApprovalScope(
  trx: Knex.Transaction,
  organizationId: number,
  locationId: number | null
): Promise<void> {
  await trx.raw(APPROVAL_SCOPE_LOCK_SQL, [
    TASTE_PROFILE_APPROVAL_LOCK_NAMESPACE,
    approvalScopeLockKey(organizationId, locationId),
  ]);
}

/**
 * The profile lifecycle. Every transition is one-way and guarded in a WHERE
 * clause (§5.4):
 *
 *   draft ──markApproved()──> approved ──(a newer approval)──> superseded
 *
 *  - `draft` ..... AI's output. Nothing staked yet, so a draft is disposable:
 *                  it is the ONLY status this model will delete.
 *  - `approved` .. a human put their name on it. This is the RECORD. It is
 *                  never deleted, never re-approved, and its signature is never
 *                  rewritten. At most one exists per org+location, enforced by
 *                  the approval transaction and database uniqueness.
 *  - `superseded`. a former record, retired by a NEWER approval. It keeps its
 *                  own `approved_by`/`approved_at` forever — that is the
 *                  approval history, not a copy of it.
 *
 * `superseded` needs no migration: `status` is a plain `text` column with no
 * CHECK constraint, and the migration says so in its own notes ("an app-level
 * enum stored as text — a new status never needs a migration"). This union is
 * the authoritative set; the migration's inline `// draft | approved` comment
 * enumerates the statuses that existed when the table was authored.
 */
export type TasteProfileStatus = "draft" | "approved" | "superseded";

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
 * or on purpose; use `findByIdForOrg` / `findCurrentApprovedByOrgAndLocation` /
 * `findLatestByOrgAndLocation` / `deleteByIdForOrg` /
 * `markApproved(id, organizationId, …)`.
 * `location_id` is a nullable dimension (null = organization-level profile),
 * handled explicitly like `PracticeFactModel.findByOrgAndLocation`.
 *
 * Status is not a caller-supplied field: `create()` always writes a `draft`, and
 * `approved` is reachable ONLY through `markApproved()`, which stamps
 * `approved_by`/`approved_at` in the same write (§5.4 — the owner sign-off is
 * enforced here on the server, never assumed from the caller's input).
 *
 * APPROVALS ARE APPEND-ONLY (§5.4). A business tool's output is a RECORD, and a
 * record you can delete is not a record. Two guards, together, make that true:
 *
 *  1. `markApproved()` is a one-way `draft -> approved` transition guarded in
 *     the WHERE clause, so an approved ROW can never be re-approved and its
 *     `approved_by`/`approved_at` can never be reattributed.
 *  2. `deleteByIdForOrg()` deletes DRAFTS ONLY. An approved or superseded row
 *     cannot be deleted through this model at all.
 *
 * Guard 1 alone was not enough, and the reason is the whole point of this
 * design: it protected the ROW, but a record's identity here is ORG+LOCATION,
 * not row id. Consumers read by org+location, so `deleteByIdForOrg()` +
 * `create()` + `markApproved()` — every call typed, tenant-scoped and
 * individually legitimate — used to yield a new approved row signed by whoever
 * ran it, with the previous signature gone entirely. Sealing every method left
 * that hole wide open because it needed ZERO type violations to walk through.
 * Guard 2 closes it at the model layer, in the DELETE's own predicate, rather
 * than by asking callers not to do it.
 *
 * SUPERSESSION IS HOW A PROFILE CHANGES. Approving a new draft for an
 * org+location does not delete the incumbent — it retires it to `superseded`,
 * in the same transaction, keeping its `approved_by`/`approved_at` intact. So
 * the table IS its own approval ledger: the rows for an org+location, ordered by
 * `approved_at`, ARE the history of who staked what and when. There is no shadow
 * audit table, deliberately — a second table recording the same fact is a second
 * write that can drift from the first, and a log that merely OBSERVES a deletion
 * does not prevent the laundering; it narrates it. The record is the row.
 *
 * WHAT THIS DOES AND DOES NOT PREVENT — read it precisely. It does NOT prevent a
 * different person from becoming the current approver: owner B composing a new
 * profile and signing it is a legitimate, staked act, and it is allowed. What it
 * prevents is doing that INVISIBLY. After the fix, owner A's signature is still
 * on a `superseded` row; before it, owner A's signature no longer existed. The
 * threat was never "someone else approves" — it was "someone else approves and
 * the previous stake disappears".
 *
 * CONCURRENCY IS ENFORCED TWICE (§10.5/§20.2). `markApproved()` takes a
 * transaction-scoped PostgreSQL advisory lock keyed by org+location before it
 * retires the incumbent. Concurrent approvals for one scope therefore serialize
 * while different location scopes remain independent. The additive migration
 * `20260717000000_enforce_taste_profile_approval_uniqueness` is the final
 * database backstop: one partial unique index covers non-null locations and a
 * second covers the organization-level `location_id IS NULL` case, which a
 * normal composite unique index cannot enforce because PostgreSQL treats NULLs
 * as distinct.
 *
 * RAW-HANDLE WRITES STILL BYPASS THE MODEL'S SIGNATURE-LIFECYCLE RULES.
 * `table()` is `protected` in TypeScript only, and transaction helpers expose a
 * handle that can rewrite columns directly. The database uniqueness indexes
 * still prevent two current approvals, but they do not make
 * `approved_by`/`approved_at` immutable against arbitrary SQL. This model is the
 * typed lifecycle boundary; the unique indexes are the current-state invariant.
 *
 * Through this model's typed public API, the column-writing paths are `create()`
 * (draft-only, explicit column copy), `markApproved()` (draft-only transition +
 * supersession) and `deleteByIdForOrg()` (draft-only delete) — every other
 * inherited writer is sealed. `TasteProfileModelSurface.test.ts` enforces that
 * list by enumerating the class's whole callable surface, so a newly added or
 * newly inherited write path FAILS the suite until it is audited against this
 * rule.
 *
 * So: no TYPED caller can erase or reattribute a stake. That is the guarantee.
 * It is not "the audit trail is tamper-proof" — raw SQL can still rewrite a
 * signature even though it cannot create a second current approval.
 *
 * Persisted JSONB shapes come from the neutral `types/tasteProfile` module —
 * never from the composition service, which is a controller-layer module (§7.1).
 *
 * WIRING STATUS: this model has NO production importers — the compose→persist
 * path has no production entry point (see the WIRING STATUS block in
 * `controllers/admin-websites/feature-services/service.taste-profile.ts`).
 * PR #171 no longer owns that wiring. PR #160 is intentionally a dormant
 * internal foundation until a separately scoped future owner adds both writer
 * and reader. It is a tested capability, not a live path.
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
   * The approval history for an org+location: every profile a human ever staked,
   * newest stake first, each with its own `approved_by`/`approved_at`.
   *
   * THIS IS WHAT MAKES "THE TABLE IS ITS OWN LEDGER" A FACT RATHER THAN A SLOGAN.
   * The class docstring rejects a separate audit table on the grounds that these
   * rows ARE the history — but a history no typed caller can read is not a
   * ledger, it is just retained bytes. Every other reader here returns a SINGLE
   * row, and `findMany`/`paginate` are sealed, so without this method auditing an
   * org's approvals would require the raw escape hatch the docs call unguarded.
   * An adversary caught exactly that gap; this closes it.
   *
   * Returns `approved` + `superseded` rows only. Drafts are excluded on purpose:
   * a draft was never staked, so it is not part of the record of who signed what.
   * Ordering is by `approved_at` desc — every returned row has one, because both
   * statuses are reachable only through `markApproved`, which stamps it.
   */
  static async findApprovalHistoryByOrgAndLocation(
    organizationId: number,
    locationId: number | null,
    trx?: QueryContext
  ): Promise<ITasteProfile[]> {
    const query = this.table(trx)
      .where({ organization_id: organizationId })
      .whereIn("status", ["approved", "superseded"]);
    if (locationId === null) {
      query.whereNull("location_id");
    } else {
      query.where({ location_id: locationId });
    }
    const found = await query.orderBy("approved_at", "desc");
    return found.map((row: unknown) => this.deserializeJsonFields(row));
  }

  /**
   * Newest profile row for an organization (+ optional location) of ANY status,
   * by `created_at`. Tenant-scoped: `organizationId` is required.
   * `location_id === null` selects the organization-level profile explicitly
   * (never a wildcard).
   *
   * NOT THE CONSUMER READ — use {@link findCurrentApprovedByOrgAndLocation} for
   * that. This method returns whatever row is newest, INCLUDING an unapproved
   * draft, so serving its result to a visitor would publish AI output no human
   * ever staked and defeat the whole approval gate. It exists for a drafting/
   * editor surface that needs to show the working row regardless of status.
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
   * typed caller. (It is not a claim that the audit trail is tamper-proof — see
   * the class docstring: raw-handle writes are outside this guarantee and are
   * recorded, not implied away.)
   *
   * APPEND-ONLY (§5.4). Approving supersedes the incumbent approved profile for
   * the same org+location rather than replacing or deleting it — see the class
   * docstring. The incumbent keeps its own signature on a `superseded` row, so a
   * new approval ADDS to the history instead of overwriting it.
   *
   * THE GUARD IS THE UPDATE'S PREDICATE, NOT THE READ. This method does read the
   * draft first (to learn which org+location scope to retire), and a
   * read-then-write check WOULD race: two concurrent approvals could both read
   * `draft` and both write, the second silently reattributing the first's
   * signature. That is not what happens here, because the read is not load-
   * bearing for the guarantee — the final UPDATE still carries `status =
   * 'draft'` in its own WHERE. A stale read costs 0 rows, never a signature.
   * `forUpdate()` additionally locks this draft for the transaction's duration.
   * After the draft is found, a transaction-scoped advisory lock serializes all
   * approvals for its org+location scope. The database's two partial unique
   * indexes remain the final invariant if a writer bypasses that cooperative
   * lock. Both rollback and concurrent approvals for nullable and non-null
   * locations are exercised by `scripts/verify-taste-profile-postgres.ts`
   * against PostgreSQL 16.
   *
   * Why that matters: `approved_by`/`approved_at` are the audit record of WHO
   * staked this profile and WHEN. A signature that a later caller can silently
   * overwrite is not a signature — the whole owner-approval gate would be
   * decorative, and the audit trail would attribute a sign-off to someone who
   * never made it. The guard is POSITIVE (`status = draft`), not a negative
   * `whereNot status = approved`, so it fails closed: every status added later
   * is non-transitionable until this predicate is deliberately widened.
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
   *    caller may still receive a serialization or uniqueness error at stricter
   *    isolation or when it bypasses the cooperative lock. The transaction
   *    rolls back in either case, so the current approved profile survives.
   *    Whether a 0
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
    trx?: Knex.Transaction
  ): Promise<number> {
    const run = async (ctx: Knex.Transaction): Promise<number> => {
      // Read the draft's OWN location scope to find the incumbent it retires.
      // The scope is taken from the row, never from a caller-supplied argument:
      // a caller passing a location could otherwise retire a different scope's
      // record. `forUpdate()` locks the row for the rest of the transaction.
      //
      // This read is NOT the guard — the guarded UPDATE below still carries
      // `status: "draft"`, so a stale read cannot approve twice. The read only
      // answers "which incumbent?", and a wrong answer costs 0 rows, not a
      // signature.
      const draft = await this.table(ctx)
        .where({ id, organization_id: organizationId, status: "draft" })
        .forUpdate()
        .first();
      if (!draft) return 0;

      // The draft lock protects this row. The advisory transaction lock protects
      // the org+location CURRENT slot shared by every draft in that scope.
      // `raw` is necessary for PostgreSQL advisory locks and is parameterized
      // (§10.2); the namespace prevents collision with unrelated lock domains.
      await lockApprovalScope(ctx, organizationId, draft.location_id);

      // Retire the incumbent record for this org+location. Guarded UPDATE
      // (`status: "approved"`), so it self-serializes on the row lock and
      // touches nothing else. `approved_by`/`approved_at` are deliberately NOT
      // cleared — a superseded row keeps the signature of the person who staked
      // it. That retained stake IS the approval history.
      const incumbent = this.table(ctx).where({
        organization_id: organizationId,
        status: "approved",
      });
      if (draft.location_id === null) {
        incumbent.whereNull("location_id");
      } else {
        incumbent.where({ location_id: draft.location_id });
      }
      await incumbent.update({ status: "superseded", updated_at: new Date() });

      // Stake the new record. Still draft-only, still one-way.
      //
      // The `status: "draft"` here is NOT redundant with the read above, and an
      // adversary proved it by deleting it: the suite stayed green (38/38), so
      // this predicate is the final state check even inside the required real
      // transaction. It protects retries, stale callers, and future changes to
      // the surrounding lock sequence. Do not "simplify" it away; the tests
      // assert THIS update's own predicate for that reason.
      return this.table(ctx)
        .where({ id, organization_id: organizationId, status: "draft" })
        .update({
          status: "approved",
          approved_by: approvedBy,
          approved_at: new Date(),
          updated_at: new Date(),
        });
    };

    // Retiring the incumbent and staking its replacement must be ONE atomic
    // step: a crash between them would leave an org+location with either two
    // approved records or none. A caller may supply only a real Knex transaction
    // — never root Knex, which would make each statement autocommit. TypeScript
    // rejects root Knex, and this runtime guard backstops JS/casts. Without a
    // supplied transaction, always open one here.
    if (trx) {
      requireTransaction(trx);
      return run(trx);
    }
    return this.transaction(run);
  }

  /**
   * The CURRENT approved profile for an org (+ optional location) — the record
   * consumers read. Only `status = "approved"` ever matches, so an unapproved
   * draft can never be served as though a human had staked it, and a superseded
   * profile stops being served the moment its replacement is approved.
   *
   * This, not {@link findLatestByOrgAndLocation}, is the consumer read. Ordered
   * by `approved_at` desc for deterministic reads and safe handling of legacy
   * duplicate state. The additive uniqueness migration prevents new
   * duplicate-current rows, including organization-level NULL scopes.
   */
  static async findCurrentApprovedByOrgAndLocation(
    organizationId: number,
    locationId: number | null,
    trx?: QueryContext
  ): Promise<ITasteProfile | undefined> {
    const query = this.table(trx).where({
      organization_id: organizationId,
      status: "approved",
    });
    if (locationId === null) {
      query.whereNull("location_id");
    } else {
      query.where({ location_id: locationId });
    }
    const row = await query.orderBy("approved_at", "desc").first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  /**
   * Delete one DRAFT profile by id, scoped to its owning organization
   * (§11.7/§5.4). `organizationId` is REQUIRED — a caller cannot delete another
   * org's row.
   *
   * DRAFTS ONLY. The WHERE carries `status: "draft"`, so an approved or
   * superseded profile cannot be deleted through this model at all. This is the
   * second half of the append-only guarantee (see the class docstring): without
   * it, `deleteByIdForOrg()` + `create()` + `markApproved()` re-signs an
   * org+location's profile using nothing but the public typed API, and the
   * previous owner's signature is gone rather than superseded. Sealing every
   * method did not stop that, because a record's identity here is org+location,
   * not row id — so the block has to live in this predicate.
   *
   * Why a draft may be deleted and an approval may not: a draft is AI output
   * that nobody staked, so discarding it destroys no record. An approved profile
   * is a human's signature — a record. "AI drafts, humans stake"; a stake you can
   * erase by delete-and-recreate is not a stake.
   *
   * This does NOT block the legitimate cases it might look like it blocks:
   *  - A MISTAKEN approved profile is fixed by composing a new one and approving
   *    it — supersession retires the mistake and keeps it visible as history.
   *    That is the correct outcome for a record: superseded, not vanished.
   *  - An ERASURE REQUEST (an org offboarding, a data-deletion request) is an
   *    org-lifecycle operation over all of that org's data, not a taste-profile
   *    CRUD call. It belongs to a deliberate, audited path at a higher layer;
   *    this method is not that path and should not be widened into it.
   *
   * The guard is POSITIVE (`status = draft`), not `whereNot status = approved`,
   * so it fails closed: every status added later is undeletable until this
   * predicate is deliberately widened.
   *
   * Returns the number of rows deleted. A 0 deliberately does NOT distinguish
   * "wrong organization" from "no such id" from "not a draft": the first two MUST
   * stay indistinguishable — telling them apart is the cross-tenant existence
   * leak {@link findByIdForOrg} avoids by design — and a caller that needs to
   * know reads the row back within its own org scope.
   */
  static async deleteByIdForOrg(
    id: string,
    organizationId: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id, organization_id: organizationId, status: "draft" })
      .del();
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
