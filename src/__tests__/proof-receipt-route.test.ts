/**
 * Tenant scope for GET /api/proof-receipt (§5.5, §11.7, §20.2).
 *
 * These run the REAL middleware chain — default-deny guard, authenticateToken
 * with a real JWT, rbacMiddleware, the route schema, and the location-scope
 * middleware — and mock only at the models/ seam, so what is proven here is the
 * behavior of the wiring rather than of a stub.
 *
 * The fixture is deliberately a multi-location organization whose caller is a
 * manager granted ONE of its two locations:
 *
 *   organization 39 owns locations 100 and 200
 *   the caller is a manager of organization 39, granted location 100 only
 *
 * That shape is what makes the scope assertions meaningful. An organization-only
 * filter would still return location 200's rows to this caller, so a test that
 * checks the organization alone would pass while the read stayed too wide.
 *
 * Each assertion below fails against the pre-remediation controller, which took
 * the organization from `req.query.organization_id`, applied no location scope
 * at all, and passed no accessible-location set to the service.
 *
 * §20.4 — all data synthetic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

import { mockDb, resetTableResults } from "./helpers/db";

vi.mock("../database/connection", () => mockDb());

import { app } from "./helpers/app";
import { authHeader } from "./helpers/auth";
import { OrganizationUserModel } from "../models/OrganizationUserModel";
import { LocationModel } from "../models/LocationModel";
import { UserLocationModel } from "../models/UserLocationModel";
import { ProofReceiptService } from "../controllers/proof-receipt/feature-services/ProofReceiptService";
import type { ProofReceipt } from "../controllers/proof-receipt/ProofReceiptTypes";

const CALLER_USER_ID = 1;
const CALLER_ORG = 39;
const FOREIGN_ORG = 41;
/** Granted to the caller. */
const CALLER_LOCATION = 100;
/** Same organization, NOT granted to the caller. */
const SIBLING_LOCATION = 200;

const EMPTY_RECEIPT: ProofReceipt = {
  organizationId: CALLER_ORG,
  since: new Date("2026-07-01T00:00:00.000Z"),
  until: new Date("2026-07-20T00:00:00.000Z"),
  items: [],
  summary: { reviewReplies: 0, localPosts: 0, businessInfo: 0, total: 0 },
  pagination: { page: 1, limit: 50, total: 0, totalPages: 1 },
};

beforeEach(() => {
  vi.restoreAllMocks();
  resetTableResults();

  // rbacMiddleware — the caller's own membership, the only tenant key trusted.
  vi.spyOn(OrganizationUserModel, "findHighestPrivilegeByUserId").mockResolvedValue({
    user_id: CALLER_USER_ID,
    organization_id: CALLER_ORG,
    role: "manager",
  } as Awaited<ReturnType<typeof OrganizationUserModel.findHighestPrivilegeByUserId>>);

  // locationScopeMiddleware — the organization owns two locations...
  vi.spyOn(LocationModel, "findByOrganizationId").mockResolvedValue([
    { id: CALLER_LOCATION },
    { id: SIBLING_LOCATION },
  ] as Awaited<ReturnType<typeof LocationModel.findByOrganizationId>>);

  // ...but this manager is granted only one of them.
  vi.spyOn(UserLocationModel, "getLocationIdsForUser").mockResolvedValue([
    CALLER_LOCATION,
  ]);

  vi.spyOn(ProofReceiptService, "getReceipt").mockResolvedValue(EMPTY_RECEIPT);
});

describe("GET /api/proof-receipt — tenant scope", () => {
  it("returns 401 without a token and never reaches the service", async () => {
    const res = await request(app).get("/api/proof-receipt");

    expect(res.status).toBe(401);
    expect(ProofReceiptService.getReceipt).not.toHaveBeenCalled();
  });

  it("§5.5 rejects a client-supplied organization_id outright", async () => {
    const res = await request(app)
      .get("/api/proof-receipt")
      .query({ organization_id: FOREIGN_ORG })
      .set(authHeader({ userId: CALLER_USER_ID }));

    // The schema is .strict() and has no organization_id key, so naming a
    // tenant in the request is a validation failure rather than something
    // quietly ignored.
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      data: null,
      error: expect.objectContaining({ code: "VALIDATION_ERROR" }),
    });
    expect(ProofReceiptService.getReceipt).not.toHaveBeenCalled();
  });

  it("§5.5 serves only the caller's own organization", async () => {
    const res = await request(app)
      .get("/api/proof-receipt")
      .set(authHeader({ userId: CALLER_USER_ID }));

    expect(res.status).toBe(200);
    expect(ProofReceiptService.getReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: CALLER_ORG })
    );
  });

  it("§11.7 passes the caller's accessible locations into the read", async () => {
    await request(app)
      .get("/api/proof-receipt")
      .set(authHeader({ userId: CALLER_USER_ID }));

    expect(ProofReceiptService.getReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ accessibleLocationIds: [CALLER_LOCATION] })
    );
  });

  it("§5.5 bounds the whole-organization read to granted locations only", async () => {
    // No locationId — the "whole org" mode. The sibling location belongs to the
    // same organization, so an organization-only filter would include it.
    await request(app)
      .get("/api/proof-receipt")
      .set(authHeader({ userId: CALLER_USER_ID }));

    const input = vi.mocked(ProofReceiptService.getReceipt).mock.calls[0][0];
    expect(input.locationId).toBeUndefined();
    expect(input.accessibleLocationIds).not.toContain(SIBLING_LOCATION);
  });

  it("§5.5 refuses a location the caller was not granted", async () => {
    const res = await request(app)
      .get("/api/proof-receipt")
      .query({ locationId: SIBLING_LOCATION })
      .set(authHeader({ userId: CALLER_USER_ID }));

    expect(res.status).toBe(403);
    expect(ProofReceiptService.getReceipt).not.toHaveBeenCalled();
  });

  it("narrows to a granted location when one is requested", async () => {
    await request(app)
      .get("/api/proof-receipt")
      .query({ locationId: CALLER_LOCATION })
      .set(authHeader({ userId: CALLER_USER_ID }));

    expect(ProofReceiptService.getReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: CALLER_ORG,
        locationId: CALLER_LOCATION,
        accessibleLocationIds: [CALLER_LOCATION],
      })
    );
  });

  it("§11.2 rejects an unparseable locationId instead of widening the read", async () => {
    // The scope middleware parses this value itself, and an older revision of
    // it treated an unparseable location as "no location requested" — which
    // reads downstream as the whole organization. The schema runs first so the
    // request fails instead.
    const res = await request(app)
      .get("/api/proof-receipt")
      .query({ locationId: "abc" })
      .set(authHeader({ userId: CALLER_USER_ID }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(ProofReceiptService.getReceipt).not.toHaveBeenCalled();
  });

  it("§11.2 rejects a numeric-prefixed locationId that parseInt would have accepted", async () => {
    // parseInt("100abc", 10) === 100; Number("100abc") is NaN and fails the schema.
    const res = await request(app)
      .get("/api/proof-receipt")
      .query({ locationId: `${CALLER_LOCATION}abc` })
      .set(authHeader({ userId: CALLER_USER_ID }));

    expect(res.status).toBe(400);
    expect(ProofReceiptService.getReceipt).not.toHaveBeenCalled();
  });

  it("§5.5 fails closed when no organization context resolves", async () => {
    vi.spyOn(
      OrganizationUserModel,
      "findHighestPrivilegeByUserId"
    ).mockResolvedValue(undefined);

    const res = await request(app)
      .get("/api/proof-receipt")
      .set(authHeader({ userId: CALLER_USER_ID }));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      success: false,
      data: null,
      error: expect.objectContaining({
        code: "PROOF_RECEIPT_CONTEXT_MISSING",
      }),
    });
    expect(ProofReceiptService.getReceipt).not.toHaveBeenCalled();
  });
});
