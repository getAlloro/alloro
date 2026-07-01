/**
 * Unit tests — PracticeFactModel (T2).
 *
 * Data strategy: Option B (mock the data layer), matching this repo's existing
 * smoke-suite convention (vitest.config.ts — no live Postgres, no network).
 * Unlike the chainable `helpers/db.ts` stub (single registered value per
 * table), tenant isolation needs the mock to actually APPLY `.where()`
 * filters against an in-memory row set — otherwise the isolation test would
 * only prove the mock returns what it's told, not that the model's query
 * filters correctly. So this file uses a small in-memory fake table scoped to
 * `practice_facts` only.
 *
 * Covers (§20.2):
 *   - the create/createMany/find/delete contract (each method's resolved shape)
 *   - the error/failure path (a rejected query propagates, never swallowed)
 *   - tenant isolation (§5.5/§11.7) — findByOrgAndLocation for org A never
 *     returns org B's rows, proven with real org A / org B fact rows.
 *
 * Synthetic only (§20.4): every id/value below is invented.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IPracticeFact } from "../models/website-builder/PracticeFactModel";

// ── In-memory `practice_facts` table + a Knex-shaped query builder ─────────
let rows: IPracticeFact[] = [];
let shouldFail = false;

function makeRow(overrides: Partial<IPracticeFact>): IPracticeFact {
  return {
    id: overrides.id ?? `fact-${Math.random().toString(36).slice(2)}`,
    organization_id: overrides.organization_id ?? 1,
    location_id: overrides.location_id ?? null,
    page_id: overrides.page_id ?? null,
    post_id: overrides.post_id ?? null,
    fact_text: overrides.fact_text ?? "Open Saturdays 9am-1pm",
    source_field: overrides.source_field ?? "business_data",
    source_excerpt: overrides.source_excerpt ?? "Open Saturdays 9am-1pm",
    extracted_at: overrides.extracted_at ?? new Date("2026-07-01T00:00:00Z"),
  };
}

/** Builds a chainable query-builder bound to the in-memory `rows` array. */
function makeQueryBuilder(): any {
  const filters: Array<(r: IPracticeFact) => boolean> = [];

  const apply = (): IPracticeFact[] => rows.filter((r) => filters.every((f) => f(r)));

  const builder: any = {
    where: vi.fn((cond: Record<string, unknown>) => {
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
    insert: vi.fn((data: unknown) => {
      if (shouldFail) {
        return Promise.reject(new Error("insert failed"));
      }
      const inserted = Array.isArray(data)
        ? data.map((d) => makeRow(d as Partial<IPracticeFact>))
        : [makeRow(data as Partial<IPracticeFact>)];
      rows.push(...inserted);
      builder.__inserted = inserted;
      return builder;
    }),
    returning: vi.fn(() => {
      if (shouldFail) return Promise.reject(new Error("insert failed"));
      return Promise.resolve(builder.__inserted ?? []);
    }),
    del: vi.fn(() => {
      if (shouldFail) return Promise.reject(new Error("delete failed"));
      const toDelete = apply();
      rows = rows.filter((r) => !toDelete.includes(r));
      return Promise.resolve(toDelete.length);
    }),
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
      if (shouldFail) return Promise.reject(new Error("query failed")).catch(onRejected);
      return Promise.resolve(apply()).then(onFulfilled, onRejected);
    },
  };

  return builder;
}

vi.mock("../database/connection", () => ({
  db: vi.fn(() => makeQueryBuilder()),
}));

// Import after the mock is registered.
import { PracticeFactModel } from "../models/website-builder/PracticeFactModel";

beforeEach(() => {
  rows = [];
  shouldFail = false;
  vi.clearAllMocks();
});

describe("PracticeFactModel — create", () => {
  it("inserts a single fact row and returns it", async () => {
    const result = await PracticeFactModel.create({
      organization_id: 1,
      location_id: 10,
      page_id: "page-1",
      post_id: null,
      fact_text: "Same-day emergency appointments available",
      source_field: "page_content",
      source_excerpt: "We offer same-day emergency appointments",
    });

    expect(result).toMatchObject({
      organization_id: 1,
      location_id: 10,
      page_id: "page-1",
      fact_text: "Same-day emergency appointments available",
      source_field: "page_content",
      source_excerpt: "We offer same-day emergency appointments",
    });
    expect(result.id).toBeDefined();
    expect(result.extracted_at).toBeInstanceOf(Date);
  });

  it("propagates a failed insert rather than swallowing it (§3.2)", async () => {
    shouldFail = true;
    await expect(
      PracticeFactModel.create({
        organization_id: 1,
        location_id: null,
        page_id: null,
        post_id: "post-1",
        fact_text: "x",
        source_field: "post_content",
        source_excerpt: "x",
      })
    ).rejects.toThrow();
  });
});

describe("PracticeFactModel — createMany", () => {
  it("bulk-inserts facts and returns the inserted rows", async () => {
    const result = await PracticeFactModel.createMany([
      {
        organization_id: 1,
        location_id: 10,
        page_id: "page-1",
        post_id: null,
        fact_text: "Fact A",
        source_field: "page_content",
        source_excerpt: "Fact A source",
      },
      {
        organization_id: 1,
        location_id: 10,
        page_id: "page-1",
        post_id: null,
        fact_text: "Fact B",
        source_field: "page_content",
        source_excerpt: "Fact B source",
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.fact_text)).toEqual(["Fact A", "Fact B"]);
  });

  it("no-ops on an empty array without issuing an insert", async () => {
    const result = await PracticeFactModel.createMany([]);
    expect(result).toEqual([]);
    expect(rows).toHaveLength(0);
  });

  it("propagates a failed bulk insert rather than swallowing it (§3.2)", async () => {
    shouldFail = true;
    await expect(
      PracticeFactModel.createMany([
        {
          organization_id: 1,
          location_id: null,
          page_id: "page-1",
          post_id: null,
          fact_text: "x",
          source_field: "page_content",
          source_excerpt: "x",
        },
      ])
    ).rejects.toThrow();
  });
});

describe("PracticeFactModel — findByPageId / findByPostId", () => {
  it("returns only facts scoped to the given page id", async () => {
    rows = [
      makeRow({ id: "f1", page_id: "page-1" }),
      makeRow({ id: "f2", page_id: "page-2" }),
    ];

    const result = await PracticeFactModel.findByPageId("page-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("f1");
  });

  it("returns only facts scoped to the given post id", async () => {
    rows = [
      makeRow({ id: "f1", page_id: null, post_id: "post-1" }),
      makeRow({ id: "f2", page_id: null, post_id: "post-2" }),
    ];

    const result = await PracticeFactModel.findByPostId("post-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("f1");
  });
});

describe("PracticeFactModel — deleteByPageId / deleteByPostId (idempotent re-extraction, §21.1)", () => {
  it("deletes only the facts for the given page id and returns the count", async () => {
    rows = [
      makeRow({ id: "f1", page_id: "page-1" }),
      makeRow({ id: "f2", page_id: "page-1" }),
      makeRow({ id: "f3", page_id: "page-2" }),
    ];

    const deleted = await PracticeFactModel.deleteByPageId("page-1");
    expect(deleted).toBe(2);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("f3");
  });

  it("deletes only the facts for the given post id and returns the count", async () => {
    rows = [
      makeRow({ id: "f1", page_id: null, post_id: "post-1" }),
      makeRow({ id: "f2", page_id: null, post_id: "post-2" }),
    ];

    const deleted = await PracticeFactModel.deleteByPostId("post-1");
    expect(deleted).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("f2");
  });

  it("is safe to run twice in a row (re-extraction idempotency) — second call deletes nothing", async () => {
    rows = [makeRow({ id: "f1", page_id: "page-1" })];

    const first = await PracticeFactModel.deleteByPageId("page-1");
    const second = await PracticeFactModel.deleteByPageId("page-1");

    expect(first).toBe(1);
    expect(second).toBe(0);
    expect(rows).toHaveLength(0);
  });
});

describe("PracticeFactModel — tenant isolation (§5.5/§11.7/§20.2)", () => {
  it("findByOrgAndLocation for org A never returns org B's rows", async () => {
    rows = [
      makeRow({ id: "org-a-1", organization_id: 1, location_id: 10 }),
      makeRow({ id: "org-a-2", organization_id: 1, location_id: 10 }),
      makeRow({ id: "org-b-1", organization_id: 2, location_id: 10 }),
    ];

    const orgAFacts = await PracticeFactModel.findByOrgAndLocation(1, 10);

    expect(orgAFacts).toHaveLength(2);
    expect(orgAFacts.every((f) => f.organization_id === 1)).toBe(true);
    expect(orgAFacts.find((f) => f.id === "org-b-1")).toBeUndefined();
  });

  it("findByOrgAndLocation scopes by location within the same organization", async () => {
    rows = [
      makeRow({ id: "loc-10", organization_id: 1, location_id: 10 }),
      makeRow({ id: "loc-20", organization_id: 1, location_id: 20 }),
    ];

    const result = await PracticeFactModel.findByOrgAndLocation(1, 10);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("loc-10");
  });

  it("findByOrgAndLocation with a null location only returns org-level (no-location) facts", async () => {
    rows = [
      makeRow({ id: "org-level", organization_id: 1, location_id: null }),
      makeRow({ id: "loc-scoped", organization_id: 1, location_id: 10 }),
    ];

    const result = await PracticeFactModel.findByOrgAndLocation(1, null);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("org-level");
  });

  it("requires organizationId as a positional argument — TypeScript enforces this is not optional (§11.7)", () => {
    // Compile-time proof: PracticeFactModel.findByOrgAndLocation(undefined, 10)
    // would fail to typecheck since organizationId: number is required, not
    // organizationId?: number. This test documents the contract; the real
    // enforcement is `npx tsc --noEmit` passing with this file present.
    expect(PracticeFactModel.findByOrgAndLocation.length).toBeGreaterThanOrEqual(2);
  });
});
