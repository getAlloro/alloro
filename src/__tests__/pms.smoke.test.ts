/**
 * Smoke test — PMS file manager list.
 *
 * Target: GET /api/pms/file-manager (guard chain:
 *   default-deny → authenticateToken → rbacMiddleware → locationScopeMiddleware).
 *
 * MOCK-BLOCKED at the models/ seam: rbacMiddleware runs `db("organization_users")`
 * directly, so the authed happy-path needs the shared `db` mocked (helpers/db.ts)
 * in addition to the model the service calls (PmsJobModel) and LocationModel
 * (used by locationScopeMiddleware). Recorded in the mock-blocked list in
 * vitest.config.ts for the db-into-models plan.
 *
 * Asserts:
 *   • valid admin token + ?locationId → 200 + { success, data:{ files, monthSlots } }
 *   • no token → 401 (default-deny guard; needs no DB)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { z } from "zod";

import { mockDb, setTableResult, resetTableResults } from "./helpers/db";

// rbacMiddleware + the shared connection used across middleware.
vi.mock("../database/connection", () => mockDb());
// locationScopeMiddleware (admin → all org locations).
vi.mock("../models/LocationModel", () => ({
  LocationModel: {
    findByOrganizationId: vi.fn(async () => [{ id: 11 }, { id: 12 }]),
  },
}));
// The model the file-manager service reads through.
vi.mock("../models/PmsJobModel", () => ({
  PmsJobModel: {
    listForFileManager: vi.fn(async () => []),
  },
}));

import { app } from "./helpers/app";
import { authHeader } from "./helpers/auth";

const listShape = z.object({
  success: z.literal(true),
  data: z.object({
    files: z.array(z.unknown()),
    monthSlots: z.unknown(),
  }),
});

const errorShape = z.object({ error: z.string() });

beforeEach(() => {
  vi.clearAllMocks();
  resetTableResults();
});

describe("GET /api/pms/file-manager", () => {
  it("returns 200 + list shape for an authed admin with a locationId", async () => {
    // rbacMiddleware: db("organization_users").first() → admin in org 7
    setTableResult("organization_users", {
      user_id: 1,
      organization_id: 7,
      role: "admin",
    });

    const res = await request(app)
      .get("/api/pms/file-manager")
      .query({ locationId: 11 })
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(() => listShape.parse(res.body)).not.toThrow();
  });

  it("returns 401 without a token (default-deny guard, no DB needed)", async () => {
    const res = await request(app).get("/api/pms/file-manager");

    expect(res.status).toBe(401);
    expect(() => errorShape.parse(res.body)).not.toThrow();
  });
});
