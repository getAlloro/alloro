/**
 * Unit tests — complete TasteProfileModel callable surface
 * (§5.4/§11.7/§20.2).
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

beforeEach(resetTasteProfileHarness);

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

describe("TasteProfileModel — no write path can reattribute a signature (§5.4)", () => {
  it("has no callable static beyond the audited set", () => {
    const scopedReaders = [
      "findByIdForOrg",
      "findLatestByOrgAndLocation",
      "findCurrentApprovedByOrgAndLocation",
      "findApprovalHistoryByOrgAndLocation",
    ];
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
    const rawEscapeHatches = ["table", "transaction", "beginTransaction"];
    const internals = [
      "parseJson",
      "toJson",
      "serializeJsonFields",
      "deserializeJsonFields",
    ];

    expect(callableSurface()).toEqual(
      [
        ...scopedReaders,
        ...auditedWriters,
        ...sealed,
        ...rawEscapeHatches,
        ...internals,
      ].sort()
    );
  });

  it("delete + create + approve CANNOT erase the original signature (T20)", async () => {
    tasteProfileHarness.rows = [
      makeTasteProfileRow({
        id: "tp-a",
        organization_id: ORG_A,
        location_id: null,
        status: "approved",
        approved_by: "original-owner@org-a.test",
        approved_at: new Date("2026-07-01T12:00:00Z"),
      }),
    ];

    expect(
      await TasteProfileModel.deleteByIdForOrg("tp-a", ORG_A)
    ).toBe(0);
    expect(tasteProfileHarness.rows).toHaveLength(1);

    const replacement = await TasteProfileModel.create({
      organization_id: ORG_A,
      location_id: null,
      business_name: "Cedar Park Dental",
      business_category: "Dentist",
      profile: makeTasteProfile(),
      source_summary: makeTasteProfileAudit(),
    });
    expect(
      await TasteProfileModel.markApproved(
        replacement.id,
        ORG_A,
        "second-owner@org-a.test"
      )
    ).toBe(1);

    const original = tasteProfileHarness.rows.find(
      (row) => row.id === "tp-a"
    );
    expect(original?.approved_by).toBe("original-owner@org-a.test");
    expect(original?.approved_at).toEqual(
      new Date("2026-07-01T12:00:00Z")
    );
    expect(original?.status).toBe("superseded");

    const current =
      await TasteProfileModel.findCurrentApprovedByOrgAndLocation(ORG_A, null);
    expect(current?.id).toBe(replacement.id);
    expect(current?.approved_by).toBe("second-owner@org-a.test");

    const history =
      await TasteProfileModel.findApprovalHistoryByOrgAndLocation(ORG_A, null);
    expect(history.map((row) => row.approved_by)).toEqual([
      "second-owner@org-a.test",
      "original-owner@org-a.test",
    ]);
    expect(history.map((row) => row.status)).toEqual([
      "approved",
      "superseded",
    ]);
  });

  it("no reachable entry point can alter an approved row's signature", async () => {
    const originalApprovedAt = new Date("2026-07-01T12:00:00Z");
    const seedApproved = () => {
      tasteProfileHarness.rows = [
        makeTasteProfileRow({
          id: "tp-a",
          organization_id: ORG_A,
          status: "approved",
          approved_by: "owner@org-a.test",
          approved_at: originalApprovedAt,
        }),
      ];
    };
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
      [
        "markApproved",
        () =>
          TasteProfileModel.markApproved(
            "tp-a",
            ORG_A,
            "attacker@example.test"
          ),
      ],
      [
        "deleteByIdForOrg",
        () => TasteProfileModel.deleteByIdForOrg("tp-a", ORG_A),
      ],
      ["updateById", () => untyped.updateById("tp-a", forgedSignature)],
      [
        "createReturningId",
        () => untyped.createReturningId({ id: "tp-a", ...forgedSignature }),
      ],
      ["findOne", () => untyped.findOne({ id: "tp-a" })],
      ["findMany", () => untyped.findMany({})],
      ["findById", () => untyped.findById("tp-a")],
      ["count", () => untyped.count()],
      ["paginate", () => untyped.paginate({}, 1, 10)],
    ];

    for (const [name, attempt] of attempts) {
      seedApproved();
      await attempt().catch(() => undefined);

      expect(
        tasteProfileHarness.rows[0].approved_by,
        `${name} reattributed the signature`
      ).toBe("owner@org-a.test");
      expect(
        tasteProfileHarness.rows[0].approved_at,
        `${name} restamped the signature`
      ).toBe(originalApprovedAt);
      expect(
        tasteProfileHarness.rows[0].status,
        `${name} changed the status`
      ).toBe("approved");
    }
  });
});
