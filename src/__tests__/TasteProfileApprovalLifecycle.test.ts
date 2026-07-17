/**
 * Unit tests — TasteProfileModel transaction and approval lifecycle
 * (§5.4/§10.5/§20.2).
 *
 * These tests prove the typed transaction contract, lock request, guarded
 * statements, supersession, and append-only history. Real PostgreSQL rollback,
 * partial uniqueness, and concurrent blocking are covered by the PG16 verifier.
 */

import type { Knex } from "knex";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeTasteProfile,
  makeTasteProfileAudit,
  makeTasteProfileRow,
  nonTransactionContext,
  resetTasteProfileHarness,
  tasteProfileDatabaseMock,
  tasteProfileHarness,
  tasteProfileTransaction,
} from "./helpers/tasteProfileModelHarness";

vi.mock("../database/connection", async () => {
  const { tasteProfileDatabaseMock } = await import(
    "./helpers/tasteProfileModelHarness"
  );
  return { db: tasteProfileDatabaseMock };
});

import type { ITasteProfile } from "../models/website-builder/TasteProfileModel";
import { TasteProfileModel } from "../models/website-builder/TasteProfileModel";

const ORG_A = 1;
const ORG_B = 2;
const LOCK_NAMESPACE = 0x54505246;
const OWNER_A = "owner-a@org-a.test";
const OWNER_B = "owner-b@org-a.test";
const APPROVED_AT = new Date("2026-07-01T12:00:00Z");

beforeEach(resetTasteProfileHarness);

function seedApproved(
  overrides: Partial<ITasteProfile> = {}
): ITasteProfile {
  return makeTasteProfileRow({
    id: "tp-approved",
    organization_id: ORG_A,
    location_id: null,
    status: "approved",
    approved_by: OWNER_A,
    approved_at: APPROVED_AT,
    ...overrides,
  });
}

describe("TasteProfileModel — transaction boundary and scope lock (§10.5/§20.2)", () => {
  it("opens its own transaction when no context is supplied", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({
        id: "tp-a",
        organization_id: ORG_A,
        status: "draft",
      }),
    ];

    expect(
      await TasteProfileModel.markApproved("tp-a", ORG_A, OWNER_A)
    ).toBe(1);
    expect(tasteProfileHarness.transactionCallCount).toBe(1);
  });

  it("uses a supplied Knex.Transaction without opening another transaction", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({
        id: "tp-a",
        organization_id: ORG_A,
        status: "draft",
      }),
    ];

    expect(
      await TasteProfileModel.markApproved(
        "tp-a",
        ORG_A,
        OWNER_A,
        tasteProfileTransaction
      )
    ).toBe(1);
    expect(tasteProfileHarness.transactionCallCount).toBe(0);
  });

  it("rejects root Knex at compile time and at the runtime backstop", async () => {
    const rootKnex = tasteProfileDatabaseMock as unknown as Knex;
    if (false) {
      // @ts-expect-error §10.5: markApproved accepts Knex.Transaction, not root Knex.
      await TasteProfileModel.markApproved("tp-a", ORG_A, OWNER_A, rootKnex);
    }

    tasteProfileHarness.rows = [
      makeTasteProfileRow({
        id: "tp-a",
        organization_id: ORG_A,
        status: "draft",
      }),
    ];

    await expect(
      TasteProfileModel.markApproved(
        "tp-a",
        ORG_A,
        OWNER_A,
        nonTransactionContext
      )
    ).rejects.toThrow(/requires a Knex\.Transaction/i);
    expect(tasteProfileHarness.rows[0].status).toBe("draft");
    expect(tasteProfileHarness.transactionCallCount).toBe(0);
  });

  it("locks nullable and location-specific approval scopes separately", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({
        id: "tp-org",
        organization_id: ORG_A,
        location_id: null,
        status: "draft",
      }),
      makeTasteProfileRow({
        id: "tp-location",
        organization_id: ORG_A,
        location_id: 7,
        status: "draft",
      }),
    ];

    await TasteProfileModel.markApproved("tp-org", ORG_A, OWNER_A);
    await TasteProfileModel.markApproved("tp-location", ORG_A, OWNER_B);

    expect(
      tasteProfileHarness.advisoryLockCalls.map((call) => call.bindings)
    ).toEqual([
      [LOCK_NAMESPACE, `${ORG_A}:organization`],
      [LOCK_NAMESPACE, `${ORG_A}:location:7`],
    ]);
    expect(
      tasteProfileHarness.advisoryLockCalls.every((call) =>
        call.sql.includes("pg_advisory_xact_lock")
      )
    ).toBe(true);
  });
});

describe("TasteProfileModel — the owner signature is write-once (§5.4)", () => {
  const FIRST_OWNER = "owner@org-a.test";
  const SECOND_OWNER = "someone-else@org-a.test";

  it("records the signature on the FIRST approval", async () => {
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
      FIRST_OWNER
    );

    expect(updated).toBe(1);
    expect(tasteProfileHarness.rows[0].status).toBe("approved");
    expect(tasteProfileHarness.rows[0].approved_by).toBe(FIRST_OWNER);
    expect(tasteProfileHarness.rows[0].approved_at).toBeInstanceOf(Date);
  });

  it("a SECOND approver cannot rewrite the original signature", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({
        id: "tp-a",
        organization_id: ORG_A,
        status: "approved",
        approved_by: FIRST_OWNER,
        approved_at: APPROVED_AT,
      }),
    ];

    const updated = await TasteProfileModel.markApproved(
      "tp-a",
      ORG_A,
      SECOND_OWNER
    );

    expect(updated).toBe(0);
    expect(tasteProfileHarness.rows[0].approved_by).toBe(FIRST_OWNER);
    expect(tasteProfileHarness.rows[0].approved_at).toBe(APPROVED_AT);
    expect(tasteProfileHarness.rows[0].status).toBe("approved");
  });

  it("the SAME owner re-approving is an idempotent no-op, not a restamp", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({
        id: "tp-a",
        organization_id: ORG_A,
        status: "approved",
        approved_by: FIRST_OWNER,
        approved_at: APPROVED_AT,
      }),
    ];

    const updated = await TasteProfileModel.markApproved(
      "tp-a",
      ORG_A,
      FIRST_OWNER
    );

    expect(updated).toBe(0);
    expect(tasteProfileHarness.rows[0].approved_at).toBe(APPROVED_AT);
    expect(tasteProfileHarness.rows[0].approved_by).toBe(FIRST_OWNER);
  });

  it("carries the draft-only guard in the WHERE clause, not in caller code", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({
        id: "tp-a",
        organization_id: ORG_A,
        status: "draft",
      }),
    ];

    await TasteProfileModel.markApproved("tp-a", ORG_A, FIRST_OWNER);

    const approvalUpdate = tasteProfileHarness.updateWheres.find(
      (where) => where.id === "tp-a"
    );
    expect(approvalUpdate).toEqual({
      id: "tp-a",
      organization_id: ORG_A,
      status: "draft",
    });
  });

  it("the supersede UPDATE targets the incumbent only — org, location, approved", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({
        id: "tp-old",
        organization_id: ORG_A,
        location_id: null,
        status: "approved",
        approved_by: FIRST_OWNER,
        approved_at: APPROVED_AT,
      }),
      makeTasteProfileRow({
        id: "tp-new",
        organization_id: ORG_A,
        location_id: null,
        status: "draft",
      }),
    ];

    await TasteProfileModel.markApproved("tp-new", ORG_A, SECOND_OWNER);

    const supersedeUpdate = tasteProfileHarness.updateWheres.find(
      (where) => where.id === undefined
    );
    expect(supersedeUpdate).toEqual({
      organization_id: ORG_A,
      status: "approved",
    });
  });

  it("the guard is positive (status=draft), so it fails closed on a new status", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({
        id: "tp-a",
        organization_id: ORG_A,
        status: "archived" as unknown as "draft",
        approved_by: null,
      }),
    ];

    const updated = await TasteProfileModel.markApproved(
      "tp-a",
      ORG_A,
      SECOND_OWNER
    );

    expect(updated).toBe(0);
    expect(tasteProfileHarness.rows[0].status).toBe("archived");
    expect(tasteProfileHarness.rows[0].approved_by).toBeNull();
  });
});

describe("TasteProfileModel — approvals are append-only (§5.4)", () => {
  it("an approved profile cannot be deleted", async () => {
    tasteProfileHarness.rows = [seedApproved()];

    const deleted = await TasteProfileModel.deleteByIdForOrg(
      "tp-approved",
      ORG_A
    );

    expect(deleted).toBe(0);
    expect(tasteProfileHarness.rows).toHaveLength(1);
    expect(tasteProfileHarness.rows[0].approved_by).toBe(OWNER_A);
    expect(tasteProfileHarness.deleteWheres).toEqual([
      { id: "tp-approved", organization_id: ORG_A, status: "draft" },
    ]);
  });

  it("a superseded profile cannot be deleted either — history is not disposable", async () => {
    tasteProfileHarness.rows = [seedApproved({ status: "superseded" })];

    const deleted = await TasteProfileModel.deleteByIdForOrg(
      "tp-approved",
      ORG_A
    );

    expect(deleted).toBe(0);
    expect(tasteProfileHarness.rows).toHaveLength(1);
  });

  it("a draft IS deletable — nothing was staked, so no record is destroyed", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({
        id: "tp-draft",
        organization_id: ORG_A,
        status: "draft",
      }),
    ];

    const deleted = await TasteProfileModel.deleteByIdForOrg(
      "tp-draft",
      ORG_A
    );

    expect(deleted).toBe(1);
    expect(tasteProfileHarness.rows).toHaveLength(0);
  });

  it("approving a replacement supersedes the incumbent instead of replacing it", async () => {
    tasteProfileHarness.rows = [
      seedApproved(),
      makeTasteProfileRow({
        id: "tp-new",
        organization_id: ORG_A,
        location_id: null,
        status: "draft",
      }),
    ];

    const updated = await TasteProfileModel.markApproved(
      "tp-new",
      ORG_A,
      OWNER_B
    );

    expect(updated).toBe(1);
    const incumbent = tasteProfileHarness.rows.find(
      (row) => row.id === "tp-approved"
    );
    expect(incumbent?.status).toBe("superseded");
    expect(incumbent?.approved_by).toBe(OWNER_A);
    expect(incumbent?.approved_at).toEqual(APPROVED_AT);
    expect(
      tasteProfileHarness.rows.find((row) => row.id === "tp-new")?.status
    ).toBe("approved");
  });

  it("supersession does not reach across locations within the same org", async () => {
    tasteProfileHarness.rows = [
      seedApproved({ id: "tp-org-level", location_id: null }),
      makeTasteProfileRow({
        id: "tp-loc-1",
        organization_id: ORG_A,
        location_id: 1,
        status: "draft",
      }),
    ];

    await TasteProfileModel.markApproved("tp-loc-1", ORG_A, OWNER_B);

    expect(
      tasteProfileHarness.rows.find((row) => row.id === "tp-org-level")?.status
    ).toBe("approved");
    expect(
      tasteProfileHarness.rows.find((row) => row.id === "tp-loc-1")?.status
    ).toBe("approved");
  });

  it("supersession does not reach across organizations", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({
        id: "tp-b-approved",
        organization_id: ORG_B,
        location_id: null,
        status: "approved",
        approved_by: "owner@org-b.test",
        approved_at: APPROVED_AT,
      }),
      makeTasteProfileRow({
        id: "tp-a-draft",
        organization_id: ORG_A,
        location_id: null,
        status: "draft",
      }),
    ];

    await TasteProfileModel.markApproved("tp-a-draft", ORG_A, OWNER_A);

    const orgB = tasteProfileHarness.rows.find(
      (row) => row.id === "tp-b-approved"
    );
    expect(orgB?.status).toBe("approved");
    expect(orgB?.approved_by).toBe("owner@org-b.test");
  });

  it("the org+location read serves the current approved profile, never a draft", async () => {
    tasteProfileHarness.rows = [
      seedApproved(),
      makeTasteProfileRow({
        id: "tp-newer-draft",
        organization_id: ORG_A,
        location_id: null,
        status: "draft",
        created_at: new Date("2026-07-10T00:00:00Z"),
      }),
    ];

    const current =
      await TasteProfileModel.findCurrentApprovedByOrgAndLocation(ORG_A, null);

    expect(current?.id).toBe("tp-approved");
    expect(current?.approved_by).toBe(OWNER_A);
  });

  it("the org+location read stops serving a superseded profile", async () => {
    tasteProfileHarness.rows = [seedApproved({ status: "superseded" })];

    const current =
      await TasteProfileModel.findCurrentApprovedByOrgAndLocation(ORG_A, null);

    expect(current).toBeUndefined();
  });

  it("the consumer read never crosses organizations", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({
        id: "tp-b",
        organization_id: ORG_B,
        location_id: null,
        status: "approved",
        approved_by: "owner@org-b.test",
        approved_at: APPROVED_AT,
      }),
    ];

    const current =
      await TasteProfileModel.findCurrentApprovedByOrgAndLocation(ORG_A, null);

    expect(current).toBeUndefined();
  });

  it("with two approved rows, the consumer read returns the most recent stake", async () => {
    tasteProfileHarness.rows = [
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

    const current =
      await TasteProfileModel.findCurrentApprovedByOrgAndLocation(ORG_A, null);

    expect(current?.id).toBe("tp-newer");
    expect(current?.approved_by).toBe("later@org-a.test");
    expect(tasteProfileHarness.rows).toHaveLength(2);
  });

  it("the approval history is readable through the typed API, newest stake first", async () => {
    tasteProfileHarness.rows = [
      seedApproved({
        id: "tp-1",
        status: "superseded",
        approved_by: "first@org-a.test",
        approved_at: new Date("2026-07-01T00:00:00Z"),
      }),
      seedApproved({
        id: "tp-2",
        status: "approved",
        approved_by: "second@org-a.test",
        approved_at: new Date("2026-07-08T00:00:00Z"),
      }),
      makeTasteProfileRow({
        id: "tp-draft",
        organization_id: ORG_A,
        location_id: null,
        status: "draft",
      }),
    ];

    const history =
      await TasteProfileModel.findApprovalHistoryByOrgAndLocation(ORG_A, null);

    expect(history.map((row) => row.id)).toEqual(["tp-2", "tp-1"]);
    expect(history.map((row) => row.approved_by)).toEqual([
      "second@org-a.test",
      "first@org-a.test",
    ]);
  });

  it("the approval history never crosses organizations", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({
        id: "tp-b",
        organization_id: ORG_B,
        location_id: null,
        status: "approved",
        approved_by: "owner@org-b.test",
        approved_at: APPROVED_AT,
      }),
    ];

    const history =
      await TasteProfileModel.findApprovalHistoryByOrgAndLocation(ORG_A, null);

    expect(history).toEqual([]);
  });

  it("a full lifecycle leaves every stake on the record, in order", async () => {
    const first = await TasteProfileModel.create({
      organization_id: ORG_A,
      location_id: null,
      business_name: "Cedar Park Dental",
      business_category: "Dentist",
      profile: makeTasteProfile(),
      source_summary: makeTasteProfileAudit(),
    });
    expect(
      await TasteProfileModel.markApproved(first.id, ORG_A, OWNER_A)
    ).toBe(1);

    const second = await TasteProfileModel.create({
      organization_id: ORG_A,
      location_id: null,
      business_name: "Cedar Park Dental",
      business_category: "Dentist",
      profile: makeTasteProfile(),
      source_summary: makeTasteProfileAudit(),
    });
    expect(
      await TasteProfileModel.markApproved(second.id, ORG_A, OWNER_B)
    ).toBe(1);

    expect(tasteProfileHarness.rows).toHaveLength(2);
    expect(
      tasteProfileHarness.rows.filter((row) => row.status === "approved")
    ).toHaveLength(1);
    expect(
      tasteProfileHarness.rows.find((row) => row.id === first.id)?.approved_by
    ).toBe(OWNER_A);
    expect(
      tasteProfileHarness.rows.find((row) => row.id === second.id)?.approved_by
    ).toBe(OWNER_B);
    const current =
      await TasteProfileModel.findCurrentApprovedByOrgAndLocation(ORG_A, null);
    expect(current?.id).toBe(second.id);
  });
});
