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
    expect(lastWhereConditions).toContainEqual({
      id: "tp-a",
      organization_id: ORG_A,
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
