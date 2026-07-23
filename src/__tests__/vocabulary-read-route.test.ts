/**
 * Route-boundary tests for GET /api/vocabulary on the real Express app.
 *
 * Proves the read endpoint that unblocks the frontend vocabulary consumer:
 *   - §8.1 — returns the { success, data, error } contract.
 *   - Serves the org's resolved preset when vocabulary_configs has a row,
 *     scoped to the caller's tenant from server-side auth context (§5.5/§11.7).
 *   - Reports { configured: false } when nothing is configured yet.
 *   - Default-deny: no token → 401 (the auth guard stays in the tested path).
 *
 * No live DB/network — the shared knex `db` is mocked via helpers/db.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { mockDb, setTableResult, resetTableResults } from "./helpers/db";

vi.mock("../database/connection", () => mockDb());

import { app } from "./helpers/app";
import { authHeader } from "./helpers/auth";

const BASE = "/api/vocabulary";

/** rbacMiddleware reads organization_users to attach org 7 to the request. */
function setOrg(role: "admin" | "manager" | "viewer" = "admin") {
  setTableResult("organization_users", {
    user_id: 1,
    organization_id: 7,
    role,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetTableResults();
});

describe("GET /api/vocabulary", () => {
  it("returns the org's resolved preset in the { success, data, error } shape", async () => {
    setOrg();
    setTableResult("vocabulary_configs", {
      id: 1,
      org_id: 7,
      vertical: "legal",
      overrides: { vertical: "legal", patientTerm: "client", providerTerm: "attorney" },
    });

    const res = await request(app).get(BASE).set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.error).toBeNull();
    expect(res.body.data.configured).toBe(true);
    expect(res.body.data.vertical).toBe("legal");
    expect(res.body.data.preset.patientTerm).toBe("client");
  });

  it("reports configured:false when the org has no vocabulary config", async () => {
    setOrg();
    // vocabulary_configs intentionally unregistered → .first() resolves undefined.

    const res = await request(app).get(BASE).set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.configured).toBe(false);
    expect(res.body.data.preset).toBeNull();
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
  });
});
