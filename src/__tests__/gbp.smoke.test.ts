/**
 * Smoke test — GBP diagnostic read.
 *
 * Target: GET /api/gbp/diag/accounts (guard chain:
 *   default-deny → authenticateToken → rbacMiddleware → tokenRefreshMiddleware).
 *
 * MOCK-BLOCKED at the models/ seam: rbacMiddleware and tokenRefreshMiddleware
 * both run raw `db("...")` (organization_users / google_connections). The authed
 * path mocks the shared `db` plus the OAuth helpers, and — critically — mocks the
 * Google SDK so NO outbound Google call escapes during the test. Recorded in
 * vitest.config.ts's mock-blocked list.
 *
 * Asserts:
 *   • no token → 401 (default-deny guard; no DB, no network)
 *   • valid token + mocked OAuth + mocked Google SDK → 200 + accounts array,
 *     with the Google SDK stub proving the run made no real network request.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { z } from "zod";

import { mockDb, setTableResult, resetTableResults } from "./helpers/db";

vi.mock("../database/connection", () => mockDb());

// tokenRefreshMiddleware deps — keep OAuth + lifecycle inert (no Google calls).
vi.mock("../auth/oauth2Helper", () => ({
  createOAuth2ClientForConnection: vi.fn(async () => ({
    setCredentials: vi.fn(),
    refreshAccessToken: vi.fn(async () => ({
      credentials: { access_token: "stub", expiry_date: Date.now() + 3_600_000 },
    })),
  })),
}));
vi.mock("../services/OrganizationLifecycleService", () => ({
  OrganizationLifecycleService: { assertActive: vi.fn(async () => undefined) },
  getOrganizationLifecycleErrorStatus: vi.fn(() => null),
}));

// Google SDK — stub accounts.list so the controller gets data WITHOUT a network
// call. The spy lets us assert no real Google request was attempted.
const accountsListSpy = vi.fn(async () => ({
  data: { accounts: [{ name: "accounts/123", accountName: "Test GBP" }] },
}));
vi.mock("@googleapis/mybusinessaccountmanagement", () => ({
  mybusinessaccountmanagement_v1: {
    Mybusinessaccountmanagement: class {
      accounts = { list: accountsListSpy };
    },
  },
}));

import { app } from "./helpers/app";
import { authHeader } from "./helpers/auth";

const accountsShape = z.array(
  z.object({ name: z.string() }).passthrough(),
);

const errorShape = z.object({ error: z.string() });

beforeEach(() => {
  vi.clearAllMocks();
  resetTableResults();
});

describe("GET /api/gbp/diag/accounts", () => {
  it("returns 401 without a token (default-deny guard, no DB/network)", async () => {
    const res = await request(app).get("/api/gbp/diag/accounts");

    expect(res.status).toBe(401);
    expect(() => errorShape.parse(res.body)).not.toThrow();
  });

  it("returns 200 + accounts array for an authed user (no Google network)", async () => {
    // rbac: org membership; tokenRefresh: a google connection for that org.
    setTableResult("organization_users", {
      user_id: 1,
      organization_id: 7,
      role: "admin",
    });
    setTableResult("google_connections", {
      id: 31,
      organization_id: 7,
      access_token: "stub",
      refresh_token: "stub",
      expiry_date: new Date(Date.now() + 3_600_000),
    });

    const res = await request(app)
      .get("/api/gbp/diag/accounts")
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(() => accountsShape.parse(res.body)).not.toThrow();
    // The SDK stub was used — proving no real Google network request escaped.
    expect(accountsListSpy).toHaveBeenCalledTimes(1);
  });
});
