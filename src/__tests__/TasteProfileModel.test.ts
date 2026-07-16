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
  const apply = (): ITasteProfile[] => rows.filter((r) => filters.every((f) => f(r)));

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
    orderBy: vi.fn(() => builder),
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

vi.mock("../database/connection", () => ({
  db: vi.fn(() => makeQueryBuilder()),
}));

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
 * THE CLASS, NOT THE INSTANCE (§5.4/§11.7).
 *
 * Guarding `markApproved` only fixes the write path we happened to look at. The
 * durable question is: can ANY entry point reachable on this model reattribute a
 * finalized signature? These two tests answer it by enumerating the class's
 * whole runtime surface rather than trusting a hand-written list — so a method
 * added later, or a new static inherited from a future `BaseModel`, FAILS this
 * suite until someone audits it against the write-once rule.
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
    const scopedReaders = ["findByIdForOrg", "findLatestByOrgAndLocation"];
    // The only paths that write columns on this table:
    //  - create ............ draft-only, explicit column copy (never a signature)
    //  - markApproved ...... draft-only one-way transition (writes it once)
    //  - deleteByIdForOrg .. removes the row; deletion is not reattribution
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
    // Delegate to db.transaction() and hand back a handle; they never query
    // this table, so there is no predicate to enforce on them.
    const nonTable = ["beginTransaction", "transaction"];
    const internals = [
      "table",
      "parseJson",
      "toJson",
      "serializeJsonFields",
      "deserializeJsonFields",
    ];

    const audited = [
      ...scopedReaders,
      ...auditedWriters,
      ...sealed,
      ...nonTable,
      ...internals,
    ].sort();

    // An unfamiliar name here means a new entry point exists that this rule has
    // never been checked against. Classify it above — do not just append it.
    expect(callableSurface()).toEqual(audited);
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

    // Every candidate write, driven with the arguments an attacker would use:
    // the correct org, the correct id, and a forged signature. Sealed paths are
    // called untyped (a JS caller / a cast) so the runtime backstop is exercised
    // rather than assumed — tsc already blocks the typed call (TS2554).
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
