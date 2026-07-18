/**
 * Route-boundary tests for the GBP automation mutating endpoints.
 *
 * Proves two server-side guarantees on the real Express app (no live DB, no
 * network — the shared knex `db` is mocked via helpers/db, and the feature
 * services are spied so no handler logic runs):
 *
 *   §5.4 — EVERY mutating route on the router requires a write-capable role
 *          (admin | manager). A `viewer` gets 403 on each one, and the
 *          handler's service is never invoked. Reads stay viewer-accessible.
 *          The claim is kept honest by introspecting the real router: the
 *          coverage test below fails if a mutating route exists that this
 *          file's table does not exercise, so the table can never silently
 *          fall behind the router again.
 *
 *   §11.2 — POST /business-info/draft validates its body at the route via
 *          validation/gbpBusinessInfo.schemas.ts in ENFORCE mode: malformed
 *          nested shapes (category, phone, hours) are rejected with 400
 *          before the controller runs, and non-writable keys are stripped.
 */

import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import request from "supertest";

import { mockDb, setTableResult, resetTableResults } from "./helpers/db";

vi.mock("../database/connection", () => mockDb());

/** POST /reviews/sync enqueues directly instead of calling a feature service. */
const queueAdd = vi.hoisted(() => vi.fn(async () => ({ id: "job-1" })));
vi.mock("../workers/queues", () => ({
  getMindsQueue: vi.fn(() => ({ add: queueAdd })),
  getGbpAutomationQueue: vi.fn(() => ({ add: queueAdd })),
}));

import { app } from "./helpers/app";
import { authHeader } from "./helpers/auth";
import gbpAutomationRouter from "../routes/gbpAutomation";
import { GbpWorkItemActionService } from "../controllers/gbp-automation/feature-services/GbpWorkItemActionService";
import { GbpBusinessInfoDraftService } from "../controllers/gbp-automation/feature-services/GbpBusinessInfoDraftService";
import { GbpCompletenessDraftService } from "../controllers/gbp-automation/feature-services/GbpCompletenessDraftService";
import { GbpWorkItemService } from "../controllers/gbp-automation/feature-services/GbpWorkItemService";
import { GbpLocalPostDraftService } from "../controllers/gbp-automation/feature-services/GbpLocalPostDraftService";
import { GbpCustomizationService } from "../controllers/gbp-automation/feature-services/GbpCustomizationService";
import { GbpPublishedLocalPostService } from "../controllers/gbp-automation/feature-services/GbpPublishedLocalPostService";
import { GbpPostMediaService } from "../controllers/gbp-automation/feature-services/GbpPostMediaService";
import { GbpLocalPostScheduleService } from "../controllers/gbp-automation/feature-services/GbpLocalPostScheduleService";
import { GbpReviewReplyService } from "../controllers/gbp-automation/feature-services/GbpReviewReplyService";
import { GbpReviewDraftSlotService } from "../controllers/gbp-automation/feature-services/GbpReviewDraftSlotService";
import { GbpReviewEscalationService } from "../controllers/gbp-automation/feature-services/GbpReviewEscalationService";
import { GbpPublishedReplyService } from "../controllers/gbp-automation/feature-services/GbpPublishedReplyService";
import type { IGbpWorkItem } from "../models/GbpWorkItemModel";
import { businessInfoDraftSchema } from "../validation/gbpBusinessInfo.schemas";

const BASE = "/api/gbp-automation";

const WORK_ITEM = { id: "wi-1", status: "approved" } as unknown as IGbpWorkItem;

interface MutatingRoute {
  method: "post" | "patch" | "put" | "delete";
  /** The router-level pattern, used to prove coverage against the real router. */
  routerPath: string;
  /** The concrete URL the test calls. */
  path: string;
  body?: Record<string, unknown>;
  /** The service (or queue) the handler would reach if the gate let it through. */
  spy: () => MockInstance;
}

/**
 * Every mutating route in the router, with the service method it must reach.
 * The coverage test below proves this list is complete — do not trust the
 * comment, it is checked.
 */
const MUTATING_ROUTES: MutatingRoute[] = [
  {
    method: "put",
    routerPath: "/settings",
    path: `${BASE}/settings`,
    body: { reviewReplyEnabled: true },
    spy: () =>
      vi.spyOn(GbpCustomizationService, "updateSettings").mockResolvedValue({} as never),
  },
  {
    method: "post",
    routerPath: "/reviews/sync",
    path: `${BASE}/reviews/sync`,
    spy: () => queueAdd,
  },
  {
    method: "post",
    routerPath: "/posts/published/sync",
    path: `${BASE}/posts/published/sync`,
    spy: () => vi.spyOn(GbpPublishedLocalPostService, "sync").mockResolvedValue({} as never),
  },
  {
    method: "patch",
    routerPath: "/posts/published",
    path: `${BASE}/posts/published`,
    body: { postId: "p-1", summary: "updated" },
    spy: () =>
      vi.spyOn(GbpPublishedLocalPostService, "update").mockResolvedValue({} as never),
  },
  {
    method: "delete",
    routerPath: "/posts/published",
    path: `${BASE}/posts/published`,
    body: { postId: "p-1" },
    spy: () =>
      vi.spyOn(GbpPublishedLocalPostService, "delete").mockResolvedValue({} as never),
  },
  {
    method: "post",
    routerPath: "/posts/media",
    path: `${BASE}/posts/media`,
    spy: () => vi.spyOn(GbpPostMediaService, "upload").mockResolvedValue({} as never),
  },
  {
    method: "post",
    routerPath: "/posts/generate",
    path: `${BASE}/posts/generate`,
    spy: () =>
      vi.spyOn(GbpLocalPostScheduleService, "generateNow").mockResolvedValue({} as never),
  },
  {
    method: "post",
    routerPath: "/business-info/draft",
    path: `${BASE}/business-info/draft`,
    body: { fields: { title: "Bright Smile Dental" } },
    spy: () =>
      vi.spyOn(GbpBusinessInfoDraftService, "createDraft").mockResolvedValue(WORK_ITEM),
  },
  {
    method: "post",
    routerPath: "/business-info/completeness-fill",
    path: `${BASE}/business-info/completeness-fill`,
    spy: () =>
      vi
        .spyOn(GbpCompletenessDraftService, "stageFillForLocation")
        .mockResolvedValue({
          workItem: WORK_ITEM,
          filled: [],
          unfillable: [],
          hasGbpData: true,
          completeness: 1,
          missingFields: [],
        }),
  },
  {
    method: "post",
    routerPath: "/reviews/:reviewId/draft",
    path: `${BASE}/reviews/rev-1/draft`,
    spy: () => vi.spyOn(GbpReviewReplyService, "generateDraft").mockResolvedValue(WORK_ITEM),
  },
  {
    method: "post",
    routerPath: "/reviews/:reviewId/post-draft",
    path: `${BASE}/reviews/rev-1/post-draft`,
    spy: () =>
      vi.spyOn(GbpLocalPostDraftService, "createFromReview").mockResolvedValue(WORK_ITEM),
  },
  {
    method: "patch",
    routerPath: "/reviews/:reviewId/draft-slot",
    path: `${BASE}/reviews/rev-1/draft-slot`,
    body: { draftContent: "thanks!" },
    spy: () =>
      vi
        .spyOn(GbpReviewDraftSlotService, "saveDraftForReview")
        .mockResolvedValue(WORK_ITEM as never),
  },
  {
    method: "put",
    routerPath: "/reviews/:reviewId/escalation",
    path: `${BASE}/reviews/rev-1/escalation`,
    body: { escalated: true },
    spy: () => vi.spyOn(GbpReviewEscalationService, "update").mockResolvedValue({} as never),
  },
  {
    method: "patch",
    routerPath: "/reviews/:reviewId/published-reply",
    path: `${BASE}/reviews/rev-1/published-reply`,
    body: { comment: "updated reply" },
    spy: () =>
      vi.spyOn(GbpPublishedReplyService, "updateReply").mockResolvedValue({} as never),
  },
  {
    method: "delete",
    routerPath: "/reviews/:reviewId/published-reply",
    path: `${BASE}/reviews/rev-1/published-reply`,
    spy: () =>
      vi.spyOn(GbpPublishedReplyService, "deleteReply").mockResolvedValue({} as never),
  },
  {
    method: "patch",
    routerPath: "/work-items/:id",
    path: `${BASE}/work-items/wi-1`,
    body: { draftContent: "updated" },
    spy: () =>
      vi.spyOn(GbpWorkItemActionService, "updateDraft").mockResolvedValue(WORK_ITEM),
  },
  {
    method: "post",
    routerPath: "/work-items/:id/regenerate-post",
    path: `${BASE}/work-items/wi-1/regenerate-post`,
    spy: () =>
      vi
        .spyOn(GbpLocalPostDraftService, "regenerateDraft")
        .mockResolvedValue(WORK_ITEM),
  },
  {
    method: "post",
    routerPath: "/work-items/:id/approve",
    path: `${BASE}/work-items/wi-1/approve`,
    spy: () =>
      vi.spyOn(GbpWorkItemActionService, "approve").mockResolvedValue(WORK_ITEM),
  },
  {
    method: "post",
    routerPath: "/work-items/:id/reject",
    path: `${BASE}/work-items/wi-1/reject`,
    spy: () =>
      vi.spyOn(GbpWorkItemActionService, "reject").mockResolvedValue(WORK_ITEM),
  },
  {
    method: "post",
    routerPath: "/work-items/:id/deploy",
    path: `${BASE}/work-items/wi-1/deploy`,
    spy: () =>
      vi
        .spyOn(GbpWorkItemActionService, "enqueueDeployment")
        .mockResolvedValue(WORK_ITEM),
  },
  {
    method: "post",
    routerPath: "/work-items/:id/retry",
    path: `${BASE}/work-items/wi-1/retry`,
    spy: () =>
      vi
        .spyOn(GbpWorkItemActionService, "retryDeployment")
        .mockResolvedValue(WORK_ITEM),
  },
  {
    method: "post",
    routerPath: "/work-items/:id/revert-business-info",
    path: `${BASE}/work-items/wi-1/revert-business-info`,
    spy: () =>
      vi
        .spyOn(GbpWorkItemActionService, "revertBusinessInfo")
        .mockResolvedValue(WORK_ITEM),
  },
];

/** Express layers that carry a route, narrowed for introspection. */
interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

/** Reads the real router's mutating routes — the source of truth for coverage. */
function readMutatingRoutesFromRouter(): string[] {
  const readOnly = new Set(["get", "head", "options", "_all"]);
  const stack = (gbpAutomationRouter as unknown as { stack: RouteLayer[] }).stack;
  const found: string[] = [];
  for (const layer of stack) {
    if (!layer.route) continue;
    for (const [method, enabled] of Object.entries(layer.route.methods)) {
      if (enabled && !readOnly.has(method)) {
        found.push(`${method.toUpperCase()} ${layer.route.path}`);
      }
    }
  }
  return found.sort();
}

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
  queueAdd.mockClear();
  resetTableResults();
});

describe("§5.4 — mutating GBP automation routes require a write-capable role", () => {
  it("the table below covers EVERY mutating route on the real router (no route escapes the gate untested)", () => {
    const onRouter = readMutatingRoutesFromRouter();
    const inTable = MUTATING_ROUTES.map(
      (route) => `${route.method.toUpperCase()} ${route.routerPath}`
    ).sort();

    // If this fails, a mutating route was added without a role-gate test.
    // Add it to MUTATING_ROUTES — do not weaken this assertion.
    expect(inTable).toEqual(onRouter);
  });

  for (const route of MUTATING_ROUTES) {
    it(`${route.method.toUpperCase()} ${route.routerPath} rejects a viewer with 403 and never reaches the service`, async () => {
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
  const INVALID_BODIES: Array<{
    title: string;
    body: Record<string, unknown>;
    accessibleLocationIds?: number[];
  }> = [
    { title: "an empty body", body: {} },
    { title: "an empty fields object", body: { fields: {} } },
    {
      title: "a non-numeric locationId",
      body: { locationId: "abc", fields: { title: "Bright Smile Dental" } },
    },
    {
      title: "a partially numeric locationId",
      body: { locationId: "42junk", fields: { title: "Bright Smile Dental" } },
      // The location-scope middleware runs before route-specific validation.
      // Make 42 accessible so this reaches the schema and proves the suffix is
      // rejected instead of being interpreted as location 42.
      accessibleLocationIds: [42],
    },
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
      title: "nanos above the google.type.TimeOfDay maximum (999,999,999)",
      body: {
        fields: {
          regularHours: {
            periods: [
              {
                openDay: "MONDAY",
                closeDay: "MONDAY",
                openTime: { hours: 9, nanos: 1_000_000_000 },
                closeTime: { hours: 17 },
              },
            ],
          },
        },
      },
    },
    {
      title: "hour 24 with minutes (24:59 is not a real time; 24:00 is end-of-day)",
      body: {
        fields: {
          regularHours: {
            periods: [
              {
                openDay: "MONDAY",
                closeDay: "MONDAY",
                openTime: { hours: 9 },
                closeTime: { hours: 24, minutes: 59 },
              },
            ],
          },
        },
      },
    },
    {
      title: "a same-day window that closes before it opens",
      body: {
        fields: {
          regularHours: {
            periods: [
              {
                openDay: "MONDAY",
                closeDay: "MONDAY",
                openTime: { hours: 17 },
                closeTime: { hours: 9 },
              },
            ],
          },
        },
      },
    },
    {
      title: "a zero-length same-day window (close equals open)",
      body: {
        fields: {
          regularHours: {
            periods: [
              {
                openDay: "MONDAY",
                closeDay: "MONDAY",
                openTime: { hours: 9, minutes: 30 },
                closeTime: { hours: 9, minutes: 30 },
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

  for (const { title, body, accessibleLocationIds } of INVALID_BODIES) {
    it(`rejects ${title} with 400 before the controller runs`, async () => {
      setRole("admin");
      if (accessibleLocationIds) {
        setTableResult(
          "locations",
          accessibleLocationIds.map((id) => ({ id, organization_id: 7 }))
        );
      }
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

  it("normalizes a positive integer string locationId to a number", () => {
    const parsed = businessInfoDraftSchema.parse({
      locationId: " 002 ",
      fields: { title: "Bright Smile Dental" },
    });

    expect(parsed.locationId).toBe(2);
    expect(typeof parsed.locationId).toBe("number");
  });

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

  /**
   * The time rules must reject what Google rejects WITHOUT rejecting the real
   * shapes a practice actually files. A window crossing midnight legitimately
   * closes "before" it opens — that is Google's own encoding, not a typo — and
   * 24:00 is its documented end-of-day close. Tightening validation must not
   * make these unsubmittable.
   */
  const VALID_HOURS: Array<{ title: string; periods: Record<string, unknown>[] }> = [
    {
      title: "an overnight window that crosses midnight (close < open, different days)",
      periods: [
        {
          openDay: "FRIDAY",
          closeDay: "SATURDAY",
          openTime: { hours: 18 },
          closeTime: { hours: 2 },
        },
      ],
    },
    {
      title: "a 24:00 end-of-day close",
      periods: [
        {
          openDay: "MONDAY",
          closeDay: "MONDAY",
          openTime: { hours: 9 },
          closeTime: { hours: 24 },
        },
      ],
    },
    {
      title: "an open-all-day window (00:00 to 24:00)",
      periods: [
        {
          openDay: "TUESDAY",
          closeDay: "TUESDAY",
          openTime: { hours: 0 },
          closeTime: { hours: 24 },
        },
      ],
    },
    {
      title: "an empty openTime meaning midnight (Google's absent-field convention)",
      periods: [
        {
          openDay: "WEDNESDAY",
          closeDay: "WEDNESDAY",
          openTime: {},
          closeTime: { hours: 17 },
        },
      ],
    },
    {
      title: "nanos at exactly the maximum (999,999,999)",
      periods: [
        {
          openDay: "THURSDAY",
          closeDay: "THURSDAY",
          openTime: { hours: 9, minutes: 0, seconds: 0, nanos: 999_999_999 },
          closeTime: { hours: 17 },
        },
      ],
    },
    {
      title: "two split same-day windows (lunch break)",
      periods: [
        {
          openDay: "MONDAY",
          closeDay: "MONDAY",
          openTime: { hours: 9 },
          closeTime: { hours: 12 },
        },
        {
          openDay: "MONDAY",
          closeDay: "MONDAY",
          openTime: { hours: 13 },
          closeTime: { hours: 17 },
        },
      ],
    },
  ];

  for (const { title, periods } of VALID_HOURS) {
    it(`accepts ${title}`, async () => {
      setRole("admin");
      const spy = vi
        .spyOn(GbpBusinessInfoDraftService, "createDraft")
        .mockResolvedValue(WORK_ITEM);

      const res = await request(app)
        .post(`${BASE}/business-info/draft`)
        .send({ fields: { regularHours: { periods } } })
        .set(authHeader());

      expect(res.status).toBe(201);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  }

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
