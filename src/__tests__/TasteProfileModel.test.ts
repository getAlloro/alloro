/**
 * Unit tests — TasteProfileModel tenant isolation and draft creation
 * (§5.4/§5.5/§11.7/§20.2).
 *
 * The shared harness applies every model predicate to synthetic in-memory rows.
 * Real transaction, rollback, uniqueness, and concurrency behavior is proved
 * separately by scripts/verify-taste-profile-postgres.ts against PostgreSQL 16.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeTasteProfile,
  makeTasteProfileAudit,
  makeTasteProfileRow,
  resetTasteProfileHarness,
  tasteProfileHarness,
} from "./helpers/tasteProfileModelHarness";

vi.mock("../database/connection", async () => {
  const { tasteProfileDatabaseMock } = await import(
    "./helpers/tasteProfileModelHarness"
  );
  return { db: tasteProfileDatabaseMock };
});

import { TasteProfileModel } from "../models/website-builder/TasteProfileModel";

const ORG_A = 1;
const ORG_B = 2;

beforeEach(resetTasteProfileHarness);

describe("TasteProfileModel — cross-org isolation: reads (§11.7/§20.2)", () => {
  it("findByIdForOrg returns org A's own profile", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({ id: "tp-a", organization_id: ORG_A }),
    ];

    const found = await TasteProfileModel.findByIdForOrg("tp-a", ORG_A);

    expect(found?.id).toBe("tp-a");
    expect(found?.organization_id).toBe(ORG_A);
  });

  it("org A CANNOT read org B's profile even with the exact row id", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({ id: "tp-b", organization_id: ORG_B }),
    ];

    const leaked = await TasteProfileModel.findByIdForOrg("tp-b", ORG_A);

    expect(leaked).toBeUndefined();
  });

  it("scopes the read by organization_id in the WHERE clause", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({ id: "tp-a", organization_id: ORG_A }),
    ];

    await TasteProfileModel.findByIdForOrg("tp-a", ORG_A);

    expect(tasteProfileHarness.lastWhereConditions).toContainEqual({
      id: "tp-a",
      organization_id: ORG_A,
    });
  });

  it("findLatestByOrgAndLocation for org A never returns org B's rows", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({
        id: "tp-b",
        organization_id: ORG_B,
        location_id: null,
      }),
      makeTasteProfileRow({
        id: "tp-a",
        organization_id: ORG_A,
        location_id: null,
      }),
    ];

    const latest = await TasteProfileModel.findLatestByOrgAndLocation(
      ORG_A,
      null
    );

    expect(latest?.id).toBe("tp-a");
    expect(latest?.organization_id).toBe(ORG_A);
  });
});

describe("TasteProfileModel — cross-org isolation: mutations (§11.7/§20.2)", () => {
  it("org A CANNOT approve org B's profile", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({
        id: "tp-b",
        organization_id: ORG_B,
        status: "draft",
      }),
    ];

    const updated = await TasteProfileModel.markApproved(
      "tp-b",
      ORG_A,
      "owner@org-a.test"
    );

    expect(updated).toBe(0);
    expect(tasteProfileHarness.rows[0].status).toBe("draft");
    expect(tasteProfileHarness.rows[0].approved_by).toBeNull();
  });

  it("markApproved DOES approve the caller's own profile", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({
        id: "tp-a",
        organization_id: ORG_A,
        status: "draft",
      }),
    ];

    const updated = await TasteProfileModel.markApproved(
      "tp-a",
      ORG_A,
      "owner@org-a.test"
    );

    expect(updated).toBe(1);
    expect(tasteProfileHarness.rows[0].status).toBe("approved");
    expect(tasteProfileHarness.rows[0].approved_by).toBe("owner@org-a.test");
    expect(tasteProfileHarness.lastWhereConditions).toContainEqual({
      id: "tp-a",
      organization_id: ORG_A,
      status: "draft",
    });
  });

  it("org A CANNOT delete org B's profile", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({ id: "tp-b", organization_id: ORG_B }),
    ];

    const deleted = await TasteProfileModel.deleteByIdForOrg("tp-b", ORG_A);

    expect(deleted).toBe(0);
    expect(tasteProfileHarness.rows).toHaveLength(1);
  });

  it("deleteByIdForOrg DOES delete the caller's own profile", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({ id: "tp-a", organization_id: ORG_A }),
      makeTasteProfileRow({ id: "tp-b", organization_id: ORG_B }),
    ];

    const deleted = await TasteProfileModel.deleteByIdForOrg("tp-a", ORG_A);

    expect(deleted).toBe(1);
    expect(tasteProfileHarness.rows.map((row) => row.id)).toEqual(["tp-b"]);
  });
});

describe("TasteProfileModel — the scope cannot be forgotten (§11.7)", () => {
  it("requires organizationId as a positional argument on every id-based method", () => {
    expect(TasteProfileModel.findByIdForOrg.length).toBeGreaterThanOrEqual(2);
    expect(TasteProfileModel.deleteByIdForOrg.length).toBeGreaterThanOrEqual(2);
    expect(TasteProfileModel.markApproved.length).toBeGreaterThanOrEqual(3);
  });

  it("seals the unscoped BaseModel entry points rather than inheriting them", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({ id: "tp-b", organization_id: ORG_B }),
    ];

    await expect(TasteProfileModel.findById()).rejects.toThrow(/unscoped/i);
    await expect(TasteProfileModel.deleteById()).rejects.toThrow(/unscoped/i);
    expect(tasteProfileHarness.rows).toHaveLength(1);
  });
});

describe("TasteProfileModel — sealed generic entry points (§11.7/§20.2)", () => {
  it("findOne cannot read another org's row by condition", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({ id: "tp-b", organization_id: ORG_B }),
    ];

    // @ts-expect-error §11.7: findOne is sealed with a zero-argument override.
    await expect(TasteProfileModel.findOne({ id: "tp-b" })).rejects.toThrow(
      /unscoped/i
    );
    expect(tasteProfileHarness.rows).toHaveLength(1);
  });

  it("findMany cannot list every org's rows", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({ id: "tp-a", organization_id: ORG_A }),
      makeTasteProfileRow({ id: "tp-b", organization_id: ORG_B }),
    ];

    // @ts-expect-error §11.7: findMany is sealed with a zero-argument override.
    await expect(TasteProfileModel.findMany({})).rejects.toThrow(/unscoped/i);
  });

  it("updateById cannot mutate another org's row", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({
        id: "tp-b",
        organization_id: ORG_B,
        status: "draft",
      }),
    ];

    await expect(
      // @ts-expect-error §11.7: updateById is sealed.
      TasteProfileModel.updateById("tp-b", { business_name: "Overwritten" })
    ).rejects.toThrow(/unscoped/i);
    expect(tasteProfileHarness.rows[0].business_name).toBe(
      "Cedar Park Dental"
    );
  });

  it("updateById cannot forge an approval without the owner sign-off (§5.4)", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({
        id: "tp-a",
        organization_id: ORG_A,
        status: "draft",
      }),
    ];

    await expect(
      // @ts-expect-error §5.4: approval only occurs through markApproved.
      TasteProfileModel.updateById("tp-a", { status: "approved" })
    ).rejects.toThrow(/unscoped/i);
    expect(tasteProfileHarness.rows[0].status).toBe("draft");
    expect(tasteProfileHarness.rows[0].approved_by).toBeNull();
    expect(tasteProfileHarness.rows[0].approved_at).toBeNull();
  });

  it("count and paginate are sealed against unscoped tenant reads", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({ id: "tp-a", organization_id: ORG_A }),
      makeTasteProfileRow({ id: "tp-b", organization_id: ORG_B }),
    ];

    await expect(TasteProfileModel.count()).rejects.toThrow(/unscoped/i);
    // @ts-expect-error §11.7: paginate is sealed.
    await expect(TasteProfileModel.paginate((query) => query, {})).rejects.toThrow(
      /unscoped/i
    );
  });

  it("createReturningId cannot bypass the draft-only create contract (§5.4)", async () => {
    await expect(
      // @ts-expect-error §5.4: createReturningId is sealed.
      TasteProfileModel.createReturningId({
        organization_id: ORG_A,
        status: "approved",
      })
    ).rejects.toThrow(/draft-only|disabled/i);
    expect(tasteProfileHarness.rows).toHaveLength(0);
  });
});

describe("TasteProfileModel — create is always a draft (§5.4)", () => {
  function validCreateInput() {
    return {
      organization_id: ORG_A,
      location_id: null,
      business_name: "Cedar Park Dental",
      business_category: "Dentist",
      profile: makeTasteProfile(),
      source_summary: makeTasteProfileAudit(),
    };
  }

  it("status is not part of create()'s input type at all", () => {
    type CreateInput = Parameters<typeof TasteProfileModel.create>[0];
    const statusIsNotCallerSupplied: "status" extends keyof CreateInput
      ? never
      : true = true;

    expect(statusIsNotCallerSupplied).toBe(true);
  });

  it("writes status=draft with no sign-off stamp, regardless of the caller", async () => {
    const created = await TasteProfileModel.create(validCreateInput());

    expect(created.status).toBe("draft");
    expect(tasteProfileHarness.rows).toHaveLength(1);
    expect(tasteProfileHarness.rows[0].status).toBe("draft");
    expect(tasteProfileHarness.rows[0].approved_by ?? null).toBeNull();
    expect(tasteProfileHarness.rows[0].approved_at ?? null).toBeNull();
  });

  it("a caller smuggling status=approved still gets a draft row", async () => {
    const smuggled = {
      ...validCreateInput(),
      status: "approved",
      approved_by: "attacker@example.test",
      approved_at: new Date("2026-07-16T00:00:00Z"),
    } as unknown as Parameters<typeof TasteProfileModel.create>[0];

    const created = await TasteProfileModel.create(smuggled);

    expect(created.status).toBe("draft");
    expect(tasteProfileHarness.rows[0].status).toBe("draft");
    expect(tasteProfileHarness.rows[0].approved_by ?? null).toBeNull();
    expect(tasteProfileHarness.rows[0].approved_at ?? null).toBeNull();
  });
});
