/**
 * Authorization test — PMS jobs surface.
 *
 * Target: GET /pms/jobs and the mutating job routes.
 *
 * Proves §11.1 (auth middleware on every protected route) and §5.5 (tenant
 * isolation). Written BEFORE the fix — the two denial cases fail against
 * 4cdb0eafa because src/routes/pms.ts:116 guards this block with
 * `authenticateToken` ALONE, despite the block being labelled "ADMIN ENDPOINTS".
 * Any authenticated user can therefore list any organization's jobs by passing
 * organization_id, and can delete, approve, retry or restart any job by id.
 *
 * These routes have no client callers — frontend usage is confined to
 * components/Admin/pms-pipeline/ and hooks/queries/useAdminOrgTabQueries.ts —
 * so the fix moves the whole block behind superAdminMiddleware rather than
 * scoping it per-tenant. Clients approve their own jobs through the separate,
 * already-RBAC-guarded /jobs/:id/client-approval route.
 *
 * The third case is the guard against over-correction: a super admin must still
 * be able to read cross-org, because that is what the admin dashboard does.
 *
 * Asserts:
 *   • a non-super-admin listing another org's jobs is refused
 *   • a non-super-admin deleting a job is refused
 *   • a super admin can still list jobs cross-org
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

import { mockDb, setTableResult, resetTableResults } from "./helpers/db";

vi.mock("../database/connection", () => mockDb());

import { app } from "./helpers/app";
import { authHeader, superAdminAuthHeader } from "./helpers/auth";

/** The organization the ordinary caller belongs to. */
const CALLER_ORG = 7;
/** An organization the ordinary caller has no membership in. */
const FOREIGN_ORG = 999;
/** A synthetic job id owned by FOREIGN_ORG. */
const FOREIGN_JOB_ID = 4242;

beforeEach(() => {
  vi.clearAllMocks();
  resetTableResults();

  setTableResult("organization_users", {
    id: 1,
    user_id: 1,
    organization_id: CALLER_ORG,
    role: "admin",
  });
});

describe("PMS jobs — authorization boundary", () => {
  it("refuses a non-super-admin listing another organization's jobs", async () => {
    const res = await request(app)
      .get("/api/pms/jobs")
      .query({ organization_id: FOREIGN_ORG })
      .set(authHeader());

    // Pre-fix this returns 200 with FOREIGN_ORG's jobs.
    expect(res.status).toBe(403);
  });

  it("refuses a non-super-admin deleting a job", async () => {
    const res = await request(app)
      .delete(`/api/pms/jobs/${FOREIGN_JOB_ID}`)
      .set(authHeader());

    // Pre-fix this deletes another organization's job.
    expect(res.status).toBe(403);
  });

  it("still allows a super admin to list jobs cross-organization", async () => {
    setTableResult("pms_jobs", []);

    const res = await request(app)
      .get("/api/pms/jobs")
      .query({ organization_id: FOREIGN_ORG })
      .set(superAdminAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
