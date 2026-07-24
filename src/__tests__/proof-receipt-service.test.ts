/**
 * Response contract, pagination and failure paths for GET /api/proof-receipt
 * (§8.1, §3.4, §9.3, §11.6, §20.2).
 *
 * Mocks at the models/ seam, so the REAL service, controller and response
 * builders run. What is asserted here is the shape the endpoint actually
 * returns, not a stub of it.
 *
 * §20.4 — all data synthetic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

import { mockDb, resetTableResults } from "./helpers/db";

vi.mock("../database/connection", () => mockDb());

import { app } from "./helpers/app";
import { authHeader } from "./helpers/auth";
import logger from "../lib/logger";
import { OrganizationUserModel } from "../models/OrganizationUserModel";
import { LocationModel } from "../models/LocationModel";
import { UserLocationModel } from "../models/UserLocationModel";
import {
  GbpWorkItemModel,
  type GbpContentType,
  type IGbpWorkItem,
} from "../models/GbpWorkItemModel";

const CALLER_USER_ID = 1;
const CALLER_ORG = 39;
const CALLER_LOCATION = 100;
/** Same organization as the caller, but never granted to them. */
const SIBLING_LOCATION = 200;

/** Totals over the whole range — deliberately larger than one page. */
const TOTAL_REVIEW_REPLIES = 70;
const TOTAL_LOCAL_POSTS = 50;
const TOTAL_PUBLISHED = TOTAL_REVIEW_REPLIES + TOTAL_LOCAL_POSTS;
const PAGE_SIZE = 50;

/** Minimal synthetic row — only the fields the receipt actually reads. */
function makeWorkItem(index: number, contentType: GbpContentType): IGbpWorkItem {
  return {
    id: `work-item-${index}`,
    organization_id: CALLER_ORG,
    location_id: CALLER_LOCATION,
    content_type: contentType,
    status: "published",
    published_at: new Date(Date.UTC(2026, 6, 2, 12, 0, index)),
  } as IGbpWorkItem;
}

function makePage(size: number): IGbpWorkItem[] {
  return Array.from({ length: size }, (_, i) =>
    makeWorkItem(i, i % 2 === 0 ? "review_reply" : "local_post")
  );
}

/** Grants the caller every location in the organization. */
function grantAllLocations(): void {
  vi.spyOn(UserLocationModel, "getLocationIdsForUser").mockResolvedValue([
    CALLER_LOCATION,
    SIBLING_LOCATION,
  ]);
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetTableResults();

  vi.spyOn(OrganizationUserModel, "findHighestPrivilegeByUserId").mockResolvedValue({
    user_id: CALLER_USER_ID,
    organization_id: CALLER_ORG,
    role: "manager",
  } as Awaited<ReturnType<typeof OrganizationUserModel.findHighestPrivilegeByUserId>>);

  vi.spyOn(LocationModel, "findByOrganizationId").mockResolvedValue([
    { id: CALLER_LOCATION },
    { id: SIBLING_LOCATION },
  ] as Awaited<ReturnType<typeof LocationModel.findByOrganizationId>>);

  grantAllLocations();

  vi.spyOn(GbpWorkItemModel, "listPublishedForOrgInRange").mockResolvedValue(
    makePage(PAGE_SIZE)
  );
  vi.spyOn(GbpWorkItemModel, "countPublishedForOrgInRange").mockResolvedValue(
    TOTAL_PUBLISHED
  );
  vi.spyOn(GbpWorkItemModel, "summarizePublishedForOrgInRange").mockResolvedValue([
    { content_type: "review_reply", count: TOTAL_REVIEW_REPLIES },
    { content_type: "local_post", count: TOTAL_LOCAL_POSTS },
  ]);
});

describe("GET /api/proof-receipt — response contract", () => {
  it("§8.1 returns the success envelope with an explicit null error", async () => {
    const res = await request(app)
      .get("/api/proof-receipt")
      .set(authHeader({ userId: CALLER_USER_ID }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // `error` must be PRESENT and null, not omitted.
    expect(res.body).toHaveProperty("error", null);
    expect(res.body.data).toEqual(
      expect.objectContaining({ organizationId: CALLER_ORG })
    );
  });

  it("§11.6 reports pagination over the whole range, not the page", async () => {
    const res = await request(app)
      .get("/api/proof-receipt")
      .query({ page: 2, limit: PAGE_SIZE })
      .set(authHeader({ userId: CALLER_USER_ID }));

    expect(res.body.data.pagination).toEqual({
      page: 2,
      limit: PAGE_SIZE,
      total: TOTAL_PUBLISHED,
      totalPages: 3,
    });
    expect(res.body.data.items.length).toBeLessThanOrEqual(PAGE_SIZE);
  });

  it("derives summary counts from the grouped query, not from the current page", async () => {
    const res = await request(app)
      .get("/api/proof-receipt")
      .query({ limit: PAGE_SIZE })
      .set(authHeader({ userId: CALLER_USER_ID }));

    // The page carries 50 rows; the summary must still describe all 120.
    expect(res.body.data.items).toHaveLength(PAGE_SIZE);
    expect(res.body.data.summary).toEqual({
      reviewReplies: TOTAL_REVIEW_REPLIES,
      localPosts: TOTAL_LOCAL_POSTS,
      // Measured from the same grouped query, not `total` minus the other two.
      businessInfo: 0,
      total: TOTAL_PUBLISHED,
    });
  });

  it("honors a limit that arrives as a raw string (Express 5 read-only query)", async () => {
    await request(app)
      .get("/api/proof-receipt")
      .query({ limit: "25" })
      .set(authHeader({ userId: CALLER_USER_ID }));

    expect(GbpWorkItemModel.listPublishedForOrgInRange).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25, offset: 0 })
    );
  });

  it("computes the offset from page and limit", async () => {
    await request(app)
      .get("/api/proof-receipt")
      .query({ page: "3", limit: "20" })
      .set(authHeader({ userId: CALLER_USER_ID }));

    expect(GbpWorkItemModel.listPublishedForOrgInRange).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, offset: 40 })
    );
  });

  it("returns an empty receipt when the caller's grants intersect nothing", async () => {
    // Grants exist but none belong to the organization: the accessible set is
    // empty, so every read must come back empty rather than unscoped.
    vi.spyOn(UserLocationModel, "getLocationIdsForUser").mockResolvedValue([999]);
    vi.spyOn(GbpWorkItemModel, "listPublishedForOrgInRange").mockResolvedValue([]);
    vi.spyOn(GbpWorkItemModel, "countPublishedForOrgInRange").mockResolvedValue(0);
    vi.spyOn(GbpWorkItemModel, "summarizePublishedForOrgInRange").mockResolvedValue([]);

    const res = await request(app)
      .get("/api/proof-receipt")
      .set(authHeader({ userId: CALLER_USER_ID }));

    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.summary.total).toBe(0);
    expect(res.body.data.pagination.totalPages).toBe(1);
    expect(GbpWorkItemModel.listPublishedForOrgInRange).toHaveBeenCalledWith(
      expect.objectContaining({ accessibleLocationIds: [] })
    );
  });
});

describe("GET /api/proof-receipt — failure paths", () => {
  const INTERNAL_MESSAGE = 'relation "gbp_work_items" does not exist';

  beforeEach(() => {
    vi.spyOn(GbpWorkItemModel, "countPublishedForOrgInRange").mockRejectedValue(
      new Error(INTERNAL_MESSAGE)
    );
  });

  it("§8.1 returns the error envelope with data null and a machine code", async () => {
    const res = await request(app)
      .get("/api/proof-receipt")
      .set(authHeader({ userId: CALLER_USER_ID }));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      data: null,
      error: {
        code: "PROOF_RECEIPT_ERROR",
        message: expect.any(String),
        details: null,
      },
    });
  });

  it("§3.4 never returns the caught error's own message to the client", async () => {
    const res = await request(app)
      .get("/api/proof-receipt")
      .set(authHeader({ userId: CALLER_USER_ID }));

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain("relation");
    expect(serialized).not.toContain("gbp_work_items");
    expect(res.body.error.message).toBe(
      "Proof receipt is temporarily unavailable."
    );
  });

  it("§9.3 logs the error object with route and identity context", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(
      (() => logger) as unknown as typeof logger.error
    );

    await request(app)
      .get("/api/proof-receipt")
      .set(authHeader({ userId: CALLER_USER_ID }));

    expect(errorSpy).toHaveBeenCalled();
    const [mergeObject] = errorSpy.mock.calls[errorSpy.mock.calls.length - 1] as [
      Record<string, unknown>,
    ];

    expect(mergeObject).toEqual(
      expect.objectContaining({
        route: "GET /api/proof-receipt",
        userId: CALLER_USER_ID,
        organizationId: CALLER_ORG,
      })
    );
    // Pino's error serializer needs the Error itself to record a stack; a
    // pre-stringified message gives it nothing to work with.
    expect(mergeObject.err).toBeInstanceOf(Error);
    expect((mergeObject.err as Error).message).toBe(INTERNAL_MESSAGE);
  });
});
