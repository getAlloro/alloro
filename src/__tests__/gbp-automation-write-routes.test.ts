/**
 * Route-boundary tests for the GBP automation mutating endpoints.
 *
 * Proves two server-side guarantees on the real Express app (no live DB, no
 * network — the shared knex `db` is mocked via helpers/db, and the feature
 * services are spied so no handler logic runs):
 *
 *   §5.4 — every mutating work-item route requires a write-capable role
 *          (admin | manager). A `viewer` gets 403 on each one, and the
 *          handler's service is never invoked. Reads stay viewer-accessible.
 *
 *   §11.2 — POST /business-info/draft validates its body at the route via
 *          validation/gbpBusinessInfo.schemas.ts in ENFORCE mode: malformed
 *          nested shapes (category, phone, hours) are rejected with 400
 *          before the controller runs, and non-writable keys are stripped.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { mockDb, setTableResult, resetTableResults } from "./helpers/db";

vi.mock("../database/connection", () => mockDb());

import { app } from "./helpers/app";
import { authHeader } from "./helpers/auth";
import { GbpWorkItemActionService } from "../controllers/gbp-automation/feature-services/GbpWorkItemActionService";
import { GbpBusinessInfoDraftService } from "../controllers/gbp-automation/feature-services/GbpBusinessInfoDraftService";
import { GbpWorkItemService } from "../controllers/gbp-automation/feature-services/GbpWorkItemService";
import { GbpLocalPostDraftService } from "../controllers/gbp-automation/feature-services/GbpLocalPostDraftService";
import type { IGbpWorkItem } from "../models/GbpWorkItemModel";

const BASE = "/api/gbp-automation";

const WORK_ITEM = { id: "wi-1", status: "approved" } as unknown as IGbpWorkItem;

/** Every mutating route in the router, with the service method it must reach. */
const MUTATING_ROUTES: Array<{
  method: "post" | "patch";
  path: string;
  body?: Record<string, unknown>;
  spy: () => ReturnType<typeof vi.spyOn>;
}> = [
  {
    method: "post",
    path: `${BASE}/business-info/draft`,
    body: { fields: { title: "Bright Smile Dental" } },
    spy: () =>
      vi.spyOn(GbpBusinessInfoDraftService, "createDraft").mockResolvedValue(WORK_ITEM),
  },
  {
    method: "patch",
    path: `${BASE}/work-items/wi-1`,
    body: { draftContent: "updated" },
    spy: () =>
      vi.spyOn(GbpWorkItemActionService, "updateDraft").mockResolvedValue(WORK_ITEM),
  },
  {
    method: "post",
    path: `${BASE}/work-items/wi-1/regenerate-post`,
    spy: () =>
      vi
        .spyOn(GbpLocalPostDraftService, "regenerateDraft")
        .mockResolvedValue(WORK_ITEM),
  },
  {
    method: "post",
    path: `${BASE}/work-items/wi-1/approve`,
    spy: () =>
      vi.spyOn(GbpWorkItemActionService, "approve").mockResolvedValue(WORK_ITEM),
  },
  {
    method: "post",
    path: `${BASE}/work-items/wi-1/reject`,
    spy: () =>
      vi.spyOn(GbpWorkItemActionService, "reject").mockResolvedValue(WORK_ITEM),
  },
  {
    method: "post",
    path: `${BASE}/work-items/wi-1/deploy`,
    spy: () =>
      vi
        .spyOn(GbpWorkItemActionService, "enqueueDeployment")
        .mockResolvedValue(WORK_ITEM),
  },
  {
    method: "post",
    path: `${BASE}/work-items/wi-1/retry`,
    spy: () =>
      vi
        .spyOn(GbpWorkItemActionService, "retryDeployment")
        .mockResolvedValue(WORK_ITEM),
  },
  {
    method: "post",
    path: `${BASE}/work-items/wi-1/revert-business-info`,
    spy: () =>
      vi
        .spyOn(GbpWorkItemActionService, "revertBusinessInfo")
        .mockResolvedValue(WORK_ITEM),
  },
];

function setRole(role: "admin" | "manager" | "viewer") {
  setTableResult("organization_users", {
    user_id: 1,
    organization_id: 7,
    role,
  });
  // One org location; no explicit user_locations grants → access to all.
  setTableResult("locations", [{ id: 2, organization_id: 7 }]);
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetTableResults();
});

describe("§5.4 — mutating GBP automation routes require a write-capable role", () => {
  for (const route of MUTATING_ROUTES) {
    it(`${route.method.toUpperCase()} ${route.path} rejects a viewer with 403 and never reaches the service`, async () => {
      setRole("viewer");
      const spy = route.spy();

      const res = await request(app)
        [route.method](route.path)
        .send(route.body ?? {})
        .set(authHeader());

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: "Insufficient permissions" });
      expect(spy).not.toHaveBeenCalled();
    });
  }

  it("a manager passes the role gate on a mutating route (approve reaches the service)", async () => {
    setRole("manager");
    const spy = vi
      .spyOn(GbpWorkItemActionService, "approve")
      .mockResolvedValue(WORK_ITEM);

    const res = await request(app)
      .post(`${BASE}/work-items/wi-1/approve`)
      .send({})
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("a viewer can still READ work items (the gate is write-scoped, not a lockout)", async () => {
    setRole("viewer");
    const spy = vi
      .spyOn(GbpWorkItemService, "listForLocation")
      .mockResolvedValue({ workItems: [] } as never);

    const res = await request(app).get(`${BASE}/work-items`).set(authHeader());

    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("§11.2 — business-info draft body is validated at the route (enforce mode)", () => {
  const INVALID_BODIES: Array<{ title: string; body: Record<string, unknown> }> = [
    { title: "an empty body", body: {} },
    { title: "an empty fields object", body: { fields: {} } },
    {
      title: "a numeric phone value",
      body: { fields: { phoneNumbers: { primaryPhone: 5551002000 } } },
    },
    {
      title: "a phone slot that is not an object",
      body: { fields: { phoneNumbers: "+1 555 100 2000" } },
    },
    {
      title: "an unknown weekday in hours",
      body: {
        fields: {
          regularHours: {
            periods: [
              {
                openDay: "FUNDAY",
                closeDay: "MONDAY",
                openTime: { hours: 9 },
                closeTime: { hours: 17 },
              },
            ],
          },
        },
      },
    },
    {
      title: "an out-of-range hour",
      body: {
        fields: {
          regularHours: {
            periods: [
              {
                openDay: "MONDAY",
                closeDay: "MONDAY",
                openTime: { hours: 25 },
                closeTime: { hours: 17 },
              },
            ],
          },
        },
      },
    },
    {
      title: "a category without its resource name",
      body: { fields: { categories: { primaryCategory: { displayName: "Dentist" } } } },
    },
    { title: "an empty title", body: { fields: { title: "" } } },
    {
      title: "a non-http website",
      body: { fields: { websiteUri: "javascript:alert(1)" } },
    },
    {
      title: "only a non-writable field (stripped, leaving nothing to update)",
      body: { fields: { storefrontAddress: { addressLines: ["1 Main St"] } } },
    },
  ];

  for (const { title, body } of INVALID_BODIES) {
    it(`rejects ${title} with 400 before the controller runs`, async () => {
      setRole("admin");
      const spy = vi
        .spyOn(GbpBusinessInfoDraftService, "createDraft")
        .mockResolvedValue(WORK_ITEM);

      const res = await request(app)
        .post(`${BASE}/business-info/draft`)
        .send(body)
        .set(authHeader());

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        success: false,
        data: null,
        error: { code: "VALIDATION_ERROR" },
      });
      expect(spy).not.toHaveBeenCalled();
    });
  }

  it("accepts a well-formed body (nested phone + hours + category) and stages the draft", async () => {
    setRole("admin");
    const spy = vi
      .spyOn(GbpBusinessInfoDraftService, "createDraft")
      .mockResolvedValue(WORK_ITEM);

    const res = await request(app)
      .post(`${BASE}/business-info/draft`)
      .send({
        fields: {
          title: "Bright Smile Dental",
          phoneNumbers: { primaryPhone: "+1 555 100 2000" },
          categories: { primaryCategory: { name: "categories/gcid:dentist" } },
          regularHours: {
            periods: [
              {
                openDay: "MONDAY",
                closeDay: "MONDAY",
                openTime: { hours: 9 },
                closeTime: { hours: 17 },
              },
            ],
          },
        },
      })
      .set(authHeader());

    expect(res.status).toBe(201);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("strips a non-writable key so it never reaches the staged patch", async () => {
    setRole("admin");
    const spy = vi
      .spyOn(GbpBusinessInfoDraftService, "createDraft")
      .mockResolvedValue(WORK_ITEM);

    const res = await request(app)
      .post(`${BASE}/business-info/draft`)
      .send({
        fields: {
          title: "Bright Smile Dental",
          storefrontAddress: { addressLines: ["1 Main St"] },
        },
      })
      .set(authHeader());

    expect(res.status).toBe(201);
    const staged = spy.mock.calls[0][0] as { patch: Record<string, unknown> };
    expect(Object.keys(staged.patch)).toEqual(["title"]);
  });
});
