/**
 * Unit tests — TasteProfileModel tenant isolation (§11.7/§5.5/§20.2).
 *
 * Data strategy: Option B (mock the data layer), matching this repo's existing
 * convention (vitest.config.ts — no live Postgres, no network), and following
 * `PracticeFactModel.test.ts` directly.
 *
 * HONEST NOTE ON WHAT THIS PROVES. There is no database here. The mock below is
 * an in-memory `taste_profiles` table whose query builder ACTUALLY APPLIES the
 * `.where()` conditions the model passes it. That is deliberately stronger than
 * asserting query shape (i.e. "the WHERE mentions organization_id"): a shape
 * assertion would pass even if the model built a correct-looking clause that
 * filtered nothing. Applying the filters means org B's row is excluded because
 * the model's own WHERE excluded it.
 *
 * What it does NOT prove: that Postgres honors the same clause (it does — this
 * is a plain equality WHERE), and it does not exercise real SQL, types, or the
 * uuid PK. A live-DB integration test is the deferred Option A in
 * vitest.config.ts. The compile-time half of the guarantee (a caller CANNOT
 * omit organizationId) is enforced by `npx tsc --noEmit`, not by this file —
 * see the sealed-entry-point test at the bottom.
 *
 * Synthetic only (§20.4): every id/value below is invented.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ITasteProfile } from "../models/website-builder/TasteProfileModel";
import type { TasteProfile, TasteProfileAudit } from "../types/tasteProfile";

// ── In-memory `taste_profiles` table + a Knex-shaped query builder ──────────
let rows: ITasteProfile[] = [];

function makeProfile(): TasteProfile {
  return {
    business_name: "Cedar Park Dental",
    business_category: "Dentist",
    voice: { archetype: "The Caregiver", tone_descriptor: "warm, unhurried" },
    hero_quote: { value: "They explained every step.", source: "review:r-101" },
    suggested_headline: "Dentistry at your pace",
    unique_strength: null,
    praise_themes: [],
    credentials: [],
    practice_facts: [],
    customer_journey: { why_they_choose: [], what_makes_them_hesitate: [] },
  };
}

function makeAudit(): TasteProfileAudit {
  return { kept: 1, dropped: [], rejected: [] };
}

function makeRow(overrides: Partial<ITasteProfile>): ITasteProfile {
  return {
    id: overrides.id ?? `tp-${Math.random().toString(36).slice(2)}`,
    organization_id: overrides.organization_id ?? 1,
    location_id: overrides.location_id ?? null,
    status: overrides.status ?? "draft",
    business_name: overrides.business_name ?? "Cedar Park Dental",
    business_category: overrides.business_category ?? "Dentist",
    profile: overrides.profile ?? makeProfile(),
    source_summary: overrides.source_summary ?? makeAudit(),
    approved_by: overrides.approved_by ?? null,
    approved_at: overrides.approved_at ?? null,
    created_at: overrides.created_at ?? new Date("2026-07-01T00:00:00Z"),
    updated_at: overrides.updated_at ?? new Date("2026-07-01T00:00:00Z"),
  };
}

/** Records every WHERE condition the model built, for the query-shape assertions. */
let lastWhereConditions: Array<Record<string, unknown>> = [];

/** Builds a chainable query-builder bound to the in-memory `rows` array. */
function makeQueryBuilder(): any {
  const filters: Array<(r: ITasteProfile) => boolean> = [];
  // `orderBy` records its intent here and `apply()` honours it on the RESULT VIEW.
  // The sort must never touch the `rows` store: the tests assert positionally
  // (`rows[0]`), so re-ordering the store would make those assertions describe a
  // different row than the author meant.
  let sortSpec: { col: string; dir: string } | null = null;

  const sortKey = (r: ITasteProfile, col: string): number => {
    const v = (r as unknown as Record<string, unknown>)[col];
    if (v instanceof Date) return v.getTime();
    if (v === null || v === undefined) return -Infinity; // nulls sort last under desc
    return Number(v);
  };

  const apply = (): ITasteProfile[] => {
    const matched = rows.filter((r) => filters.every((f) => f(r)));
    if (!sortSpec) return matched;
    const { col, dir } = sortSpec;
    return [...matched].sort((a, b) =>
      dir === "desc" ? sortKey(b, col) - sortKey(a, col) : sortKey(a, col) - sortKey(b, col)
    );
  };

  const builder: any = {
    where: vi.fn((cond: Record<string, unknown>) => {
      lastWhereConditions.push(cond);
      filters.push((r) =>
        Object.entries(cond).every(
          ([k, v]) => (r as unknown as Record<string, unknown>)[k] === v
        )
      );
      return builder;
    }),
    whereNull: vi.fn((col: string) => {
      filters.push((r) => (r as unknown as Record<string, unknown>)[col] === null);
      return builder;
    }),
    orderBy: vi.fn((col: string, dir: string) => {
      // Ordering is load-bearing now: findCurrentApprovedByOrgAndLocation orders by
      // approved_at desc. Recorded, then applied to the returned view only — the
      // `rows` store keeps its insertion order (see sortSpec above).
      sortSpec = { col, dir };
      return builder;
    }),
    // `forUpdate()` is a row lock in Postgres. Here it is a chainable no-op:
    // an in-memory array has no locks, no isolation and no concurrency, so this
    // mock CANNOT prove the locking behaviour markApproved's docstring reasons
    // about — it only lets the same call chain run. Stated, not glossed.
    forUpdate: vi.fn(() => builder),
    first: vi.fn(() => Promise.resolve(apply()[0])),
    // Inserts land in the same in-memory table, so create()'s persisted column
    // values (notably `status`) can be asserted as written, not as intended.
    insert: vi.fn((data: Record<string, unknown>) => ({
      returning: vi.fn(() => {
        const row = {
          id: `tp-generated-${rows.length + 1}`,
          ...data,
        } as unknown as ITasteProfile;
        rows.push(row);
        return Promise.resolve([row]);
      }),
    })),
    update: vi.fn((data: Record<string, unknown>) => {
      const targets = apply();
      targets.forEach((r) => Object.assign(r, data));
      return Promise.resolve(targets.length);
    }),
    del: vi.fn(() => {
      const toDelete = apply();
      rows = rows.filter((r) => !toDelete.includes(r));
      return Promise.resolve(toDelete.length);
    }),
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(apply()).then(onFulfilled, onRejected),
  };

  return builder;
}

// `markApproved` now opens a transaction when the caller supplies none, so the
// mocked `db` needs `.transaction()`. It hands the SAME callable back as the
// "trx", so model calls threaded through it hit the same in-memory table.
//
// HONEST LIMIT: this is a transaction in NAME only. There is no atomicity, no
// isolation, no rollback. It proves the SEQUENCE of writes markApproved issues;
// it proves nothing about what Postgres does when two of them race, and no test
// below claims otherwise.
vi.mock("../database/connection", () => {
  const db: any = vi.fn(() => makeQueryBuilder());
  db.transaction = vi.fn((cb: (trx: unknown) => unknown) => Promise.resolve(cb(db)));
  return { db };
});

// Import after the mock is registered.
import { TasteProfileModel } from "../models/website-builder/TasteProfileModel";

beforeEach(() => {
  rows = [];
  lastWhereConditions = [];
  vi.clearAllMocks();
});

const ORG_A = 1;
const ORG_B = 2;

describe("TasteProfileModel — cross-org isolation: reads (§11.7/§20.2)", () => {
  it("findByIdForOrg returns org A's own profile", async () => {
    rows = [makeRow({ id: "tp-a", organization_id: ORG_A })];

    const found = await TasteProfileModel.findByIdForOrg("tp-a", ORG_A);

    expect(found).toBeDefined();
    expect(found?.id).toBe("tp-a");
    expect(found?.organization_id).toBe(ORG_A);
  });

  it("org A CANNOT read org B's profile even with the exact row id", async () => {
    rows = [makeRow({ id: "tp-b", organization_id: ORG_B })];

    // Org A holds a leaked/guessed uuid belonging to org B.
    const leaked = await TasteProfileModel.findByIdForOrg("tp-b", ORG_A);

    expect(leaked).toBeUndefined();
  });

  it("scopes the read by organization_id in the WHERE clause", async () => {
    rows = [makeRow({ id: "tp-a", organization_id: ORG_A })];

    await TasteProfileModel.findByIdForOrg("tp-a", ORG_A);

    expect(lastWhereConditions).toContainEqual({
      id: "tp-a",
      organization_id: ORG_A,
    });
  });

  it("findLatestByOrgAndLocation for org A never returns org B's rows", async () => {
    rows = [
      makeRow({ id: "tp-b", organization_id: ORG_B, location_id: null }),
      makeRow({ id: "tp-a", organization_id: ORG_A, location_id: null }),
    ];

    const latest = await TasteProfileModel.findLatestByOrgAndLocation(ORG_A, null);

    expect(latest?.id).toBe("tp-a");
    expect(latest?.organization_id).toBe(ORG_A);
  });
});

describe("TasteProfileModel — cross-org isolation: mutations (§11.7/§20.2)", () => {
  it("org A CANNOT approve org B's profile", async () => {
    rows = [makeRow({ id: "tp-b", organization_id: ORG_B, status: "draft" })];

    const updated = await TasteProfileModel.markApproved("tp-b", ORG_A, "owner@org-a.test");

    expect(updated).toBe(0);
    // The victim row is untouched — still an unapproved draft.
    expect(rows[0].status).toBe("draft");
    expect(rows[0].approved_by).toBeNull();
  });

  it("markApproved DOES approve the caller's own profile", async () => {
    rows = [makeRow({ id: "tp-a", organization_id: ORG_A, status: "draft" })];

    const updated = await TasteProfileModel.markApproved("tp-a", ORG_A, "owner@org-a.test");

    expect(updated).toBe(1);
    expect(rows[0].status).toBe("approved");
    expect(rows[0].approved_by).toBe("owner@org-a.test");
    // The predicate carries the tenant scope (§11.7) AND the draft-only
    // transition guard (§5.4) — both are part of this one WHERE clause.
    expect(lastWhereConditions).toContainEqual({
      id: "tp-a",
      organization_id: ORG_A,
      status: "draft",
    });
  });

  it("org A CANNOT delete org B's profile", async () => {
    rows = [makeRow({ id: "tp-b", organization_id: ORG_B })];

    const deleted = await TasteProfileModel.deleteByIdForOrg("tp-b", ORG_A);

    expect(deleted).toBe(0);
    expect(rows).toHaveLength(1); // org B's row survives.
  });

  it("deleteByIdForOrg DOES delete the caller's own profile", async () => {
    rows = [
      makeRow({ id: "tp-a", organization_id: ORG_A }),
      makeRow({ id: "tp-b", organization_id: ORG_B }),
    ];

    const deleted = await TasteProfileModel.deleteByIdForOrg("tp-a", ORG_A);

    expect(deleted).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("tp-b"); // the other tenant is unaffected.
  });
});

describe("TasteProfileModel — the scope cannot be forgotten (§11.7)", () => {
  it("requires organizationId as a positional argument on every id-based method", () => {
    // Compile-time proof: findByIdForOrg("x") would fail to typecheck because
    // organizationId: number is required, not optional. This test documents the
    // contract; the real enforcement is `npx tsc --noEmit` passing with this
    // file present. `.length` counts params before the first optional/default.
    expect(TasteProfileModel.findByIdForOrg.length).toBeGreaterThanOrEqual(2);
    expect(TasteProfileModel.deleteByIdForOrg.length).toBeGreaterThanOrEqual(2);
    expect(TasteProfileModel.markApproved.length).toBeGreaterThanOrEqual(3);
  });

  it("seals the unscoped BaseModel entry points rather than inheriting them", async () => {
    // TypeScript rejects `TasteProfileModel.findById("tp-b")` at compile time
    // (TS2554: Expected 0 arguments, but got 1) — the seal's real value. The
    // runtime throw below is the backstop for untyped/JS callers.
    rows = [makeRow({ id: "tp-b", organization_id: ORG_B })];

    await expect(TasteProfileModel.findById()).rejects.toThrow(/unscoped/i);
    await expect(TasteProfileModel.deleteById()).rejects.toThrow(/unscoped/i);
    expect(rows).toHaveLength(1); // nothing was read or destroyed.
  });
});

/**
 * The generic `BaseModel` surface is the other half of the seal. Sealing only
 * `findById`/`deleteById` still left a caller able to read or mutate this tenant
 * table with no organization predicate via the condition-based entry points, so
 * the isolation guarantee was bypassable. Each test below asserts BOTH halves:
 * the sealed method throws, AND the other tenant's row is neither returned nor
 * modified. Compile-time (TS2554) is the primary enforcement — these prove the
 * runtime backstop and that no data escapes.
 */
describe("TasteProfileModel — sealed generic entry points (§11.7/§20.2)", () => {
  it("findOne cannot read another org's row by condition", async () => {
    rows = [makeRow({ id: "tp-b", organization_id: ORG_B })];

    // @ts-expect-error §11.7: sealed — findOne takes no arguments (TS2554).
    await expect(TasteProfileModel.findOne({ id: "tp-b" })).rejects.toThrow(
      /unscoped/i
    );
    expect(rows).toHaveLength(1); // org B's row was never read out.
  });

  it("findMany cannot list every org's rows", async () => {
    rows = [
      makeRow({ id: "tp-a", organization_id: ORG_A }),
      makeRow({ id: "tp-b", organization_id: ORG_B }),
    ];

    // @ts-expect-error §11.7: sealed — findMany takes no arguments (TS2554).
    await expect(TasteProfileModel.findMany({})).rejects.toThrow(/unscoped/i);
  });

  it("updateById cannot mutate another org's row", async () => {
    rows = [makeRow({ id: "tp-b", organization_id: ORG_B, status: "draft" })];

    await expect(
      // @ts-expect-error §11.7: sealed — updateById takes no arguments (TS2554).
      TasteProfileModel.updateById("tp-b", { business_name: "Overwritten" })
    ).rejects.toThrow(/unscoped/i);
    expect(rows[0].business_name).toBe("Cedar Park Dental"); // untouched.
  });

  it("updateById cannot forge an approval without the owner sign-off (§5.4)", async () => {
    rows = [makeRow({ id: "tp-a", organization_id: ORG_A, status: "draft" })];

    await expect(
      // @ts-expect-error §5.4: sealed — approval only via markApproved (TS2554).
      TasteProfileModel.updateById("tp-a", { status: "approved" })
    ).rejects.toThrow(/unscoped/i);
    // Still an unsigned draft — approval must carry approved_by/approved_at.
    expect(rows[0].status).toBe("draft");
    expect(rows[0].approved_by).toBeNull();
    expect(rows[0].approved_at).toBeNull();
  });

  it("count and paginate are sealed against unscoped tenant reads", async () => {
    rows = [
      makeRow({ id: "tp-a", organization_id: ORG_A }),
      makeRow({ id: "tp-b", organization_id: ORG_B }),
    ];

    // count() is callable with zero args on the base, so the seal is enforced at
    // runtime here rather than by TS2554 — hence no @ts-expect-error.
    await expect(TasteProfileModel.count()).rejects.toThrow(/unscoped/i);
    // @ts-expect-error §11.7: sealed — paginate takes no arguments (TS2554).
    await expect(TasteProfileModel.paginate((qb) => qb, {})).rejects.toThrow(
      /unscoped/i
    );
  });

  it("createReturningId cannot bypass the draft-only create contract (§5.4)", async () => {
    await expect(
      // @ts-expect-error §5.4: sealed — createReturningId takes no arguments.
      TasteProfileModel.createReturningId({
        organization_id: ORG_A,
        status: "approved",
      })
    ).rejects.toThrow(/draft-only|disabled/i);
    expect(rows).toHaveLength(0); // nothing was inserted.
  });
});

/**
 * Owner sign-off (§5.4). `approved` is a claim that a human staked their name
 * on. A row that says `approved` with no `approved_by`/`approved_at` is an
 * unsigned approval that reads, downstream, exactly like a signed one — so the
 * ONLY route to that status is markApproved(), which writes the status and the
 * signature together.
 */
describe("TasteProfileModel — create is always a draft (§5.4)", () => {
  function validCreateInput() {
    return {
      organization_id: ORG_A,
      location_id: null,
      business_name: "Cedar Park Dental",
      business_category: "Dentist",
      profile: makeProfile(),
      source_summary: makeAudit(),
    };
  }

  it("status is not part of create()'s input type at all", () => {
    // Compile-time proof, robust to excess-property-check subtleties: if
    // `status` ever re-enters the input type, this type resolves to `never` and
    // `npx tsc --noEmit` fails on the assignment below. tsc passing IS the
    // assertion; the runtime expect is just the vitest carrier.
    type CreateInput = Parameters<typeof TasteProfileModel.create>[0];
    const statusIsNotCallerSupplied: "status" extends keyof CreateInput
      ? never
      : true = true;

    expect(statusIsNotCallerSupplied).toBe(true);
  });

  it("writes status=draft with no sign-off stamp, regardless of the caller", async () => {
    const created = await TasteProfileModel.create(validCreateInput());

    expect(created.status).toBe("draft");
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("draft");
    expect(rows[0].approved_by ?? null).toBeNull();
    expect(rows[0].approved_at ?? null).toBeNull();
  });

  it("a caller smuggling status=approved still gets a draft row", async () => {
    // An untyped/JS caller (or a cast) can hand over an extra `status` key. The
    // explicit column copy in create() ignores it: what reaches the DB is a
    // draft. This is the runtime backstop behind the compile-time proof above.
    const smuggled = {
      ...validCreateInput(),
      status: "approved",
      approved_by: "attacker@example.test",
      approved_at: new Date("2026-07-16T00:00:00Z"),
    } as unknown as Parameters<typeof TasteProfileModel.create>[0];

    const created = await TasteProfileModel.create(smuggled);

    expect(created.status).toBe("draft");
    expect(rows[0].status).toBe("draft");
    // The smuggled sign-off never reached the row.
    expect(rows[0].approved_by ?? null).toBeNull();
    expect(rows[0].approved_at ?? null).toBeNull();
  });
});

/**
 * The owner signature is WRITE-ONCE (§5.4).
 *
 * `approved_by`/`approved_at` are the audit record of WHO staked a profile and
 * WHEN. If a later call can overwrite them, the sign-off gate is decorative: the
 * trail would attribute an approval to someone who never made it, and there
 * would be no way to tell from the row that it happened. A stake you can
 * overwrite is not a stake. These tests assert the transition BOTH ways — the
 * first approval records, the second cannot rewrite it.
 */
describe("TasteProfileModel — the owner signature is write-once (§5.4)", () => {
  const FIRST_OWNER = "owner@org-a.test";
  const SECOND_OWNER = "someone-else@org-a.test";
  const APPROVED_AT = new Date("2026-07-01T12:00:00Z");

  it("records the signature on the FIRST approval", async () => {
    rows = [makeRow({ id: "tp-a", organization_id: ORG_A, status: "draft" })];

    const updated = await TasteProfileModel.markApproved("tp-a", ORG_A, FIRST_OWNER);

    expect(updated).toBe(1);
    expect(rows[0].status).toBe("approved");
    expect(rows[0].approved_by).toBe(FIRST_OWNER);
    expect(rows[0].approved_at).toBeInstanceOf(Date);
  });

  it("a SECOND approver cannot rewrite the original signature", async () => {
    // The row is already signed by FIRST_OWNER.
    rows = [
      makeRow({
        id: "tp-a",
        organization_id: ORG_A,
        status: "approved",
        approved_by: FIRST_OWNER,
        approved_at: APPROVED_AT,
      }),
    ];

    // Same org, same id — this caller passes every tenant check. Only the
    // draft-only transition guard stands between them and the audit trail.
    const updated = await TasteProfileModel.markApproved("tp-a", ORG_A, SECOND_OWNER);

    expect(updated).toBe(0); // no-op: the row no longer matches the predicate.
    expect(rows[0].approved_by).toBe(FIRST_OWNER); // NOT reattributed.
    expect(rows[0].approved_at).toBe(APPROVED_AT); // NOT restamped.
    expect(rows[0].status).toBe("approved");
  });

  it("the SAME owner re-approving is an idempotent no-op, not a restamp", async () => {
    // A retried job or a double-clicked Approve button must not move the
    // recorded approval time — `approved_at` is when the owner actually staked
    // it, not when the last duplicate request arrived.
    rows = [
      makeRow({
        id: "tp-a",
        organization_id: ORG_A,
        status: "approved",
        approved_by: FIRST_OWNER,
        approved_at: APPROVED_AT,
      }),
    ];

    const updated = await TasteProfileModel.markApproved("tp-a", ORG_A, FIRST_OWNER);

    expect(updated).toBe(0);
    expect(rows[0].approved_at).toBe(APPROVED_AT); // the original instant stands.
    expect(rows[0].approved_by).toBe(FIRST_OWNER);
  });

  it("carries the draft-only guard in the WHERE clause, not in caller code", async () => {
    // The guard must live in the predicate the DB evaluates, not in a
    // read-then-write check in the model or the caller: two concurrent
    // approvals could both read 'draft' and both then write, and the second
    // write would silently reattribute the signature the first just recorded.
    //
    // HONEST LIMIT ON THE CONCURRENCY CLAIM: this test asserts only that the
    // predicate is IN the WHERE clause — that is all an in-memory table can
    // show. It does NOT execute concurrent transactions; there is no Postgres
    // here (see T18). The reason a single guarded UPDATE is the right shape is
    // Postgres's documented READ COMMITTED behaviour: a second UPDATE blocks on
    // the first transaction's row lock, and on commit re-evaluates its WHERE
    // against the UPDATED row (EvalPlanQual). The row is 'approved' by then, no
    // longer matches `status = 'draft'`, and is skipped — so it reports 0 rows.
    // Under REPEATABLE READ/SERIALIZABLE the second call instead raises a
    // serialization failure. Either way the signature is not overwritten, which
    // is the property that matters; only the observable differs. That is
    // reasoned from documented semantics, NOT observed here — the claim in this
    // suite is the predicate's presence, nothing more.
    rows = [makeRow({ id: "tp-a", organization_id: ORG_A, status: "draft" })];

    await TasteProfileModel.markApproved("tp-a", ORG_A, FIRST_OWNER);

    expect(lastWhereConditions).toContainEqual({
      id: "tp-a",
      organization_id: ORG_A,
      status: "draft",
    });
  });

  it("the guard is positive (status=draft), so it fails closed on a new status", async () => {
    // A `whereNot({ status: 'approved' })` guard would let ANY future status
    // (e.g. 'revoked', 'archived') transition straight to approved and stamp a
    // fresh signature. The positive `status = draft` predicate refuses anything
    // it was not explicitly designed for.
    rows = [
      makeRow({
        id: "tp-a",
        organization_id: ORG_A,
        status: "archived" as unknown as "draft",
        approved_by: null,
      }),
    ];

    const updated = await TasteProfileModel.markApproved("tp-a", ORG_A, SECOND_OWNER);

    expect(updated).toBe(0);
    expect(rows[0].status).toBe("archived");
    expect(rows[0].approved_by).toBeNull();
  });
});

/**
 * APPROVALS ARE APPEND-ONLY (§5.4) — the delete guard + supersession.
 *
 * The write-once guard protected the ROW. It did not protect the RECORD, because
 * a record's identity here is org+location, not row id: deleting the approved
 * row and approving a fresh one re-signed the org's profile through the public
 * typed API with no type violation at all. These are the two-call lifecycle
 * regressions for the fix.
 */
describe("TasteProfileModel — approvals are append-only (§5.4)", () => {
  const OWNER_A = "owner-a@org-a.test";
  const OWNER_B = "owner-b@org-a.test";
  const APPROVED_AT = new Date("2026-07-01T12:00:00Z");

  function seedApproved(overrides: Partial<ITasteProfile> = {}) {
    return makeRow({
      id: "tp-approved",
      organization_id: ORG_A,
      location_id: null,
      status: "approved",
      approved_by: OWNER_A,
      approved_at: APPROVED_AT,
      ...overrides,
    });
  }

  it("an approved profile cannot be deleted", async () => {
    rows = [seedApproved()];

    const deleted = await TasteProfileModel.deleteByIdForOrg("tp-approved", ORG_A);

    expect(deleted).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].approved_by).toBe(OWNER_A);
    // The block is in the DELETE's own predicate, not in caller discipline.
    expect(lastWhereConditions).toContainEqual({
      id: "tp-approved",
      organization_id: ORG_A,
      status: "draft",
    });
  });

  it("a superseded profile cannot be deleted either — history is not disposable", async () => {
    rows = [seedApproved({ status: "superseded" })];

    const deleted = await TasteProfileModel.deleteByIdForOrg("tp-approved", ORG_A);

    expect(deleted).toBe(0);
    expect(rows).toHaveLength(1);
  });

  it("a draft IS deletable — nothing was staked, so no record is destroyed", async () => {
    rows = [makeRow({ id: "tp-draft", organization_id: ORG_A, status: "draft" })];

    const deleted = await TasteProfileModel.deleteByIdForOrg("tp-draft", ORG_A);

    expect(deleted).toBe(1);
    expect(rows).toHaveLength(0);
  });

  it("approving a replacement supersedes the incumbent instead of replacing it", async () => {
    rows = [seedApproved()];
    const replacement = makeRow({
      id: "tp-new",
      organization_id: ORG_A,
      location_id: null,
      status: "draft",
    });
    rows.push(replacement);

    const updated = await TasteProfileModel.markApproved("tp-new", ORG_A, OWNER_B);

    expect(updated).toBe(1);
    const incumbent = rows.find((r) => r.id === "tp-approved");
    // Retired, NOT deleted — and it keeps its own signature. That retained stake
    // IS the approval history; there is no shadow audit table.
    expect(incumbent?.status).toBe("superseded");
    expect(incumbent?.approved_by).toBe(OWNER_A);
    expect(incumbent?.approved_at).toEqual(APPROVED_AT);
    expect(rows.find((r) => r.id === "tp-new")?.status).toBe("approved");
  });

  it("supersession does not reach across locations within the same org", async () => {
    // A location-1 approval must not retire the org-level record, and vice
    // versa: they are different records, keyed by different org+location pairs.
    rows = [
      seedApproved({ id: "tp-org-level", location_id: null }),
      makeRow({ id: "tp-loc-1", organization_id: ORG_A, location_id: 1, status: "draft" }),
    ];

    await TasteProfileModel.markApproved("tp-loc-1", ORG_A, OWNER_B);

    expect(rows.find((r) => r.id === "tp-org-level")?.status).toBe("approved");
    expect(rows.find((r) => r.id === "tp-loc-1")?.status).toBe("approved");
  });

  it("supersession does not reach across organizations", async () => {
    rows = [
      makeRow({
        id: "tp-b-approved",
        organization_id: ORG_B,
        location_id: null,
        status: "approved",
        approved_by: "owner@org-b.test",
        approved_at: APPROVED_AT,
      }),
      makeRow({ id: "tp-a-draft", organization_id: ORG_A, location_id: null, status: "draft" }),
    ];

    await TasteProfileModel.markApproved("tp-a-draft", ORG_A, OWNER_A);

    // Org B's record is untouched by org A's approval (§11.7).
    const orgB = rows.find((r) => r.id === "tp-b-approved");
    expect(orgB?.status).toBe("approved");
    expect(orgB?.approved_by).toBe("owner@org-b.test");
  });

  it("the org+location read serves the current approved profile, never a draft", async () => {
    // A newer DRAFT must not shadow the approved record — serving it would
    // publish AI output no human staked. This is why the consumer read filters
    // on status rather than taking the newest row.
    rows = [
      seedApproved(),
      makeRow({
        id: "tp-newer-draft",
        organization_id: ORG_A,
        location_id: null,
        status: "draft",
        created_at: new Date("2026-07-10T00:00:00Z"),
      }),
    ];

    const current = await TasteProfileModel.findCurrentApprovedByOrgAndLocation(ORG_A, null);

    expect(current?.id).toBe("tp-approved");
    expect(current?.approved_by).toBe(OWNER_A);
  });

  it("the org+location read stops serving a superseded profile", async () => {
    rows = [seedApproved({ status: "superseded" })];

    const current = await TasteProfileModel.findCurrentApprovedByOrgAndLocation(ORG_A, null);

    expect(current).toBeUndefined();
  });

  it("the consumer read never crosses organizations", async () => {
    rows = [
      makeRow({
        id: "tp-b",
        organization_id: ORG_B,
        location_id: null,
        status: "approved",
        approved_by: "owner@org-b.test",
        approved_at: APPROVED_AT,
      }),
    ];

    const current = await TasteProfileModel.findCurrentApprovedByOrgAndLocation(ORG_A, null);

    expect(current).toBeUndefined();
  });

  it("with two approved rows, the consumer read returns the most recent stake", async () => {
    // The documented concurrency bound (see the class docstring): two CONCURRENT
    // approvals of different drafts for one org+location can leave two approved
    // rows. That is an ambiguity, not a lost signature — both rows carry a real
    // human's stake — and the read resolves it to the LATEST real stake rather
    // than an arbitrary row. This test exists because the docstring makes that
    // claim; without it the `orderBy("approved_at", "desc")` is unproven.
    //
    // The rows are seeded in the "wrong" order on purpose: the newer stake is
    // FIRST in the store, so returning it cannot be an accident of insertion
    // order. It has to be the ordering doing the work.
    rows = [
      seedApproved({
        id: "tp-newer",
        approved_by: "later@org-a.test",
        approved_at: new Date("2026-07-09T00:00:00Z"),
      }),
      seedApproved({
        id: "tp-older",
        approved_by: "earlier@org-a.test",
        approved_at: new Date("2026-07-02T00:00:00Z"),
      }),
    ];

    const current = await TasteProfileModel.findCurrentApprovedByOrgAndLocation(ORG_A, null);

    expect(current?.id).toBe("tp-newer");
    expect(current?.approved_by).toBe("later@org-a.test");
    // Both stakes are still on the record — the ambiguity loses no signature.
    expect(rows).toHaveLength(2);
  });

  it("a full lifecycle leaves every stake on the record, in order", async () => {
    // draft -> approved -> superseded, twice over: the table is its own ledger.
    rows = [];
    const first = await TasteProfileModel.create({
      organization_id: ORG_A,
      location_id: null,
      business_name: "Cedar Park Dental",
      business_category: "Dentist",
      profile: makeProfile(),
      source_summary: makeAudit(),
    });
    expect(await TasteProfileModel.markApproved(first.id, ORG_A, OWNER_A)).toBe(1);

    const second = await TasteProfileModel.create({
      organization_id: ORG_A,
      location_id: null,
      business_name: "Cedar Park Dental",
      business_category: "Dentist",
      profile: makeProfile(),
      source_summary: makeAudit(),
    });
    expect(await TasteProfileModel.markApproved(second.id, ORG_A, OWNER_B)).toBe(1);

    // Both stakes survive; exactly one is current.
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.status === "approved")).toHaveLength(1);
    expect(rows.find((r) => r.id === first.id)?.approved_by).toBe(OWNER_A);
    expect(rows.find((r) => r.id === second.id)?.approved_by).toBe(OWNER_B);
    const current = await TasteProfileModel.findCurrentApprovedByOrgAndLocation(ORG_A, null);
    expect(current?.id).toBe(second.id);
  });
});

/**
 * THE CLASS, NOT THE INSTANCE (§5.4/§11.7).
 *
 * Guarding `markApproved` only fixes the write path we happened to look at. The
 * durable question is: can ANY entry point reachable on this model reattribute a
 * finalized signature? These tests answer it by enumerating the class's whole
 * runtime surface rather than trusting a hand-written list — so a method added
 * later, or a new static inherited from a future `BaseModel`, FAILS this suite
 * until someone audits it against the write-once rule.
 *
 * The answer is bounded, and the bound is asserted rather than hidden. What
 * holds: no TYPED caller can erase or reattribute a stake — `delete + create +
 * approve` no longer re-signs the org-level profile, because the delete is
 * draft-only (T20, pinned by its own test above). What does NOT hold: the raw
 * escape hatches (`table`, `transaction`, `beginTransaction`) hand back a knex
 * handle that writes the row directly (T21 — the table has no CHECK constraint,
 * so the model, not the DB, is the boundary). An adversary found both by
 * attacking an earlier draft of these very tests; they are recorded here so the
 * next reader inherits the limits along with the guarantee.
 */
describe("TasteProfileModel — no write path can reattribute a signature (§5.4)", () => {
  /** Every function-valued static reachable on the model, own + inherited. */
  function callableSurface(): string[] {
    const found = new Set<string>();
    for (
      let target: unknown = TasteProfileModel;
      target && target !== Function.prototype;
      target = Object.getPrototypeOf(target)
    ) {
      for (const key of Object.getOwnPropertyNames(target)) {
        if (["length", "name", "prototype"].includes(key)) continue;
        if (typeof (target as Record<string, unknown>)[key] === "function") {
          found.add(key);
        }
      }
    }
    return [...found].sort();
  }

  it("has no callable static beyond the audited set", () => {
    // Each name below is classified against the write-once rule. `protected` in
    // TypeScript is compile-time only, so the helpers are listed too: at runtime
    // they are reachable, and this test is about what CAN be called.
    const scopedReaders = [
      "findByIdForOrg",
      "findLatestByOrgAndLocation",
      "findCurrentApprovedByOrgAndLocation",
    ];
    // The paths on the TYPED API that write columns on this table:
    //  - create ............ draft-only, explicit column copy (never a signature)
    //  - markApproved ...... draft-only one-way transition (writes it once) +
    //    supersedes the incumbent for the same org+location, atomically
    //  - deleteByIdForOrg .. DRAFT-ONLY delete. An approved or superseded row
    //    cannot be removed, which is what makes approvals append-only: the
    //    delete + create + approve re-signing route is closed in this
    //    predicate, not by caller discipline (T20).
    const auditedWriters = ["create", "markApproved", "deleteByIdForOrg"];
    const sealed = [
      "count",
      "createReturningId",
      "deleteById",
      "findById",
      "findMany",
      "findOne",
      "paginate",
      "updateById",
    ];
    // RAW ESCAPE HATCHES — deliberately NOT claimed as guarded. `table()` is
    // `protected` in TypeScript only, so `(Model as any).table()` returns a live
    // knex builder at runtime; transaction()/beginTransaction() hand back a
    // handle that can write any table. A caller reaching past the model this way
    // CAN reattribute a signature, and no assertion here pretends otherwise —
    // this model is the enforcement boundary for TYPED callers, not the DB.
    // (True of every model in the repo; real enforcement against a raw writer
    // would be a DB-level CHECK/trigger, which taste_profiles does not have.)
    const rawEscapeHatches = ["table", "transaction", "beginTransaction"];
    // Pure serialization helpers — they transform values, never issue a query.
    const internals = [
      "parseJson",
      "toJson",
      "serializeJsonFields",
      "deserializeJsonFields",
    ];

    const audited = [
      ...scopedReaders,
      ...auditedWriters,
      ...sealed,
      ...rawEscapeHatches,
      ...internals,
    ].sort();

    // An unfamiliar name here means a new entry point exists that this rule has
    // never been checked against. Classify it above — do not just append it.
    expect(callableSurface()).toEqual(audited);
  });

  it("delete + create + approve CANNOT erase the original signature (T20)", async () => {
    // THE THREAT THIS BRANCH EXISTS TO CLOSE. Every call below is typed,
    // tenant-scoped and individually legitimate — this exploit needs ZERO type
    // violations, which is exactly why sealing every method did not stop it.
    // The approved ROW was never rewritten; it was DELETED, and a new row signed
    // by whoever ran the sequence. Consumers read by org+location, not by id, so
    // the record's identity is org+location — and deleting the row destroyed the
    // record while satisfying every per-row guarantee.
    //
    // Now: the delete is refused (drafts only), so the sequence degrades into
    // plain supersession. Owner B DOES become the current approver — that is a
    // real, staked, legitimate act and it is allowed. What is no longer possible
    // is doing it invisibly.
    rows = [
      makeRow({
        id: "tp-a",
        organization_id: ORG_A,
        location_id: null,
        status: "approved",
        approved_by: "original-owner@org-a.test",
        approved_at: new Date("2026-07-01T12:00:00Z"),
      }),
    ];

    // 1. The delete is refused at the model layer — not by asking the caller.
    const deleted = await TasteProfileModel.deleteByIdForOrg("tp-a", ORG_A);
    expect(deleted).toBe(0);
    expect(rows).toHaveLength(1);

    // 2. Creating + approving a replacement still works (this is the legitimate
    //    re-approval path — a record changes by supersession, not by erasure).
    const replacement = await TasteProfileModel.create({
      organization_id: ORG_A,
      location_id: null,
      business_name: "Cedar Park Dental",
      business_category: "Dentist",
      profile: makeProfile(),
      source_summary: makeAudit(),
    });
    const approved = await TasteProfileModel.markApproved(
      replacement.id,
      ORG_A,
      "second-owner@org-a.test"
    );
    expect(approved).toBe(1);

    // 3. THE GUARANTEE: the original signature survives, with its own approver
    //    and its own timestamp — retired to `superseded`, not erased.
    const original = rows.find((r) => r.id === "tp-a");
    expect(original).toBeDefined();
    expect(original?.approved_by).toBe("original-owner@org-a.test");
    expect(original?.approved_at).toEqual(new Date("2026-07-01T12:00:00Z"));
    expect(original?.status).toBe("superseded");

    // 4. The org+location read resolves to the CURRENT approved profile.
    const current = await TasteProfileModel.findCurrentApprovedByOrgAndLocation(ORG_A, null);
    expect(current?.id).toBe(replacement.id);
    expect(current?.approved_by).toBe("second-owner@org-a.test");

    // 5. The history is reconstructible from the table itself — no shadow audit
    //    table. Both stakes are present, each with the person who made it.
    const history = rows
      .filter((r) => r.approved_by !== null)
      .map((r) => r.approved_by)
      .sort();
    expect(history).toEqual(["original-owner@org-a.test", "second-owner@org-a.test"]);
  });

  it("no reachable entry point can alter an approved row's signature", async () => {
    const ORIGINAL_AT = new Date("2026-07-01T12:00:00Z");
    const seedApproved = () => {
      rows = [
        makeRow({
          id: "tp-a",
          organization_id: ORG_A,
          status: "approved",
          approved_by: "owner@org-a.test",
          approved_at: ORIGINAL_AT,
        }),
      ];
    };

    // Every candidate write on the model's own API, driven with the arguments an
    // attacker would use: the correct org, the correct id, and a forged
    // signature. Sealed paths are called untyped (a JS caller / a cast) so the
    // runtime backstop is exercised rather than assumed — tsc already blocks the
    // typed call (TS2554).
    //
    // SCOPE: this covers the model's API. It deliberately does NOT drive
    // `table()` / `transaction()` / `beginTransaction()` — those return a raw
    // knex handle that CAN write the row, and asserting otherwise would be
    // false. They are classified as raw escape hatches above, not as guarded
    // paths. delete+create+approve IS now closed, and is proved by its own test
    // directly above rather than absorbed into this loop.
    const untyped = TasteProfileModel as unknown as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;
    const forgedSignature = {
      status: "approved",
      approved_by: "attacker@example.test",
      approved_at: new Date("2026-07-16T00:00:00Z"),
    };

    const attempts: Array<[string, () => Promise<unknown>]> = [
      ["markApproved", () => TasteProfileModel.markApproved("tp-a", ORG_A, "attacker@example.test")],
      // Deleting the row is the other way to destroy a signature — it is now a
      // no-op on an approved row, so it belongs in this sweep.
      ["deleteByIdForOrg", () => TasteProfileModel.deleteByIdForOrg("tp-a", ORG_A)],
      ["updateById", () => untyped.updateById("tp-a", forgedSignature)],
      ["createReturningId", () => untyped.createReturningId({ id: "tp-a", ...forgedSignature })],
      ["findOne", () => untyped.findOne({ id: "tp-a" })],
      ["findMany", () => untyped.findMany({})],
      ["findById", () => untyped.findById("tp-a")],
      ["count", () => untyped.count()],
      ["paginate", () => untyped.paginate({}, 1, 10)],
    ];

    for (const [name, attempt] of attempts) {
      seedApproved();
      // Sealed paths reject; markApproved resolves to 0. Either is acceptable —
      // what must hold is that the signature survives, so failures are absorbed
      // and the ROW is the assertion.
      await attempt().catch(() => undefined);

      expect(rows[0].approved_by, `${name} reattributed the signature`).toBe("owner@org-a.test");
      expect(rows[0].approved_at, `${name} restamped the signature`).toBe(ORIGINAL_AT);
      expect(rows[0].status, `${name} changed the status`).toBe("approved");
    }
  });
});
