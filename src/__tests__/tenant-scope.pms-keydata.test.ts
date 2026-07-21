/**
 * Tenant-isolation test — PMS key data.
 *
 * Target: GET /api/pms/keyData
 *
 * Proves §5.5 (tenant data is isolated; scope derived from server context, never
 * client input) and its §20.2 obligation that one tenant cannot read another's
 * rows. Written BEFORE the fix — both cases fail against the pre-fix code:
 *
 *   • the org case fails because getKeyData reads req.query.organization_id and
 *     ignores req.organizationId, which rbacMiddleware derived from real
 *     membership (PmsController.ts:173).
 *   • the location case fails because the route carries no
 *     locationScopeMiddleware, and even once added the middleware reads only the
 *     camelCase `locationId` while this endpoint sends `location_id` — so the
 *     403 branch cannot fire (rbac.ts:172-175).
 *
 * MOCK-BLOCKED at the models/ seam: rbacMiddleware and locationScopeMiddleware
 * resolve membership and location access through the shared knex `db`, so this
 * mocks helpers/db.ts rather than a model. With no approved jobs registered,
 * aggregateKeyData returns early and echoes the organizationId it was given —
 * that echo is the assertion surface.
 *
 * Asserts:
 *   • a foreign organization_id is ignored; the response is scoped to the JWT's org
 *   • a location_id the caller cannot access is rejected with 403
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

import { mockDb, setTableResult, resetTableResults } from "./helpers/db";

vi.mock("../database/connection", () => mockDb());

import { app } from "./helpers/app";
import { authHeader } from "./helpers/auth";

/** The organization the caller actually belongs to, per organization_users. */
const CALLER_ORG = 7;
/** An organization the caller has no membership in. */
const FOREIGN_ORG = 999;
/** The only location inside CALLER_ORG. */
const CALLER_LOCATION = 10;
/** A location outside the caller's accessible set. */
const FOREIGN_LOCATION = 888;

beforeEach(() => {
  vi.clearAllMocks();
  resetTableResults();

  // rbacMiddleware → OrganizationUserModel.findHighestPrivilegeByUserId
  setTableResult("organization_users", {
    id: 1,
    user_id: 1,
    organization_id: CALLER_ORG,
    role: "admin",
  });
});

describe("GET /api/pms/keyData — tenant isolation", () => {
  it("ignores a foreign organization_id and scopes to the caller's organization", async () => {
    const res = await request(app)
      .get("/api/pms/keyData")
      .query({ organization_id: FOREIGN_ORG })
      .set(authHeader());

    expect(res.status).toBe(200);
    // Pre-fix this echoes FOREIGN_ORG — the caller chose the tenant.
    expect(res.body.data.organizationId).toBe(CALLER_ORG);
  });

  it("rejects a malformed location_id instead of widening to the whole org", async () => {
    setTableResult("locations", [
      { id: CALLER_LOCATION, organization_id: CALLER_ORG },
    ]);
    setTableResult("user_locations", []);

    const res = await request(app)
      .get("/api/pms/keyData")
      .query({ location_id: "not-a-number" })
      .set(authHeader());

    // Pre-fix, parseInt gives NaN, req.locationId is set to null, and the
    // request silently succeeds across every location in the organization.
    expect(res.status).toBe(400);
  });

  it("rejects a location_id the caller has no access to", async () => {
    // Org owns exactly one location; no explicit user grants → all org locations.
    setTableResult("locations", [
      { id: CALLER_LOCATION, organization_id: CALLER_ORG },
    ]);
    setTableResult("user_locations", []);

    const res = await request(app)
      .get("/api/pms/keyData")
      .query({ organization_id: CALLER_ORG, location_id: FOREIGN_LOCATION })
      .set(authHeader());

    expect(res.status).toBe(403);
  });
});
