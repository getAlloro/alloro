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

describe("GET /api/vocabulary — tenant scope comes from auth, never the request", () => {
  it("ignores an organizationId supplied in the query string and body", async () => {
    setOrg(); // rbacMiddleware attaches org 7
    setTableResult("vocabulary_configs", {
      id: 1,
      org_id: 7,
      vertical: "legal",
      overrides: { vertical: "legal", patientTerm: "client" },
    });

    // A caller trying to read another org's vocabulary by asking for it.
    const res = await request(app)
      .get(`${BASE}?organizationId=999`)
      .send({ organizationId: 999 })
      .set(authHeader());

    expect(res.status).toBe(200);
    // Still the caller's own org (§5.5) — the request-supplied id is ignored.
    expect(res.body.data.vertical).toBe("legal");
    expect(res.body.data.configured).toBe(true);
  });

  it("reports unconfigured — never an unscoped read — when the session carries no org", async () => {
    // No organization_users row → rbacMiddleware attaches no organizationId.
    resetTableResults();
    setTableResult("vocabulary_configs", {
      id: 99,
      org_id: 123,
      vertical: "legal",
      overrides: { vertical: "legal" },
    });

    const res = await request(app).get(BASE).set(authHeader());

    // If the controller queried without a tenant it would return the legal row.
    expect(res.body.data.configured).toBe(false);
    expect(res.body.data.vertical).toBeNull();
    expect(res.body.data.preset).toBeNull();
  });

  it("returns the full { success, data, error } contract on success (§8.1)", async () => {
    setOrg();
    setTableResult("vocabulary_configs", {
      id: 1,
      org_id: 7,
      vertical: "legal",
      overrides: { vertical: "legal", patientTerm: "client" },
    });

    const res = await request(app).get(BASE).set(authHeader());

    expect(Object.keys(res.body).sort()).toEqual(["data", "error", "success"]);
    expect(res.body.success).toBe(true);
    expect(res.body.error).toBeNull();
  });

  it("degrades to configured:false — not a 500 — when the stored overrides are corrupt", async () => {
    setOrg();
    setTableResult("vocabulary_configs", {
      id: 1,
      org_id: 7,
      vertical: "legal",
      overrides: "{not valid json",
    });

    const res = await request(app).get(BASE).set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.configured).toBe(false);
  });
});
