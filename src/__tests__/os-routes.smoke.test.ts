/**
 * Smoke tests — Admin OS domain, P1 foundation
 * (plans/07042026-alloro-os-admin-port; analog: admin-reads.smoke.test.ts).
 *
 * Proves the /api/admin/os gate matrix end-to-end through the REAL middleware
 * stack (app-level default-deny → authenticateToken → superAdminMiddleware,
 * §11.1) and the §8.1 envelope on both P1 endpoints. Hermetic (Option B):
 * OsAdminUserModel is mocked at the model seam; ping touches no DB at all.
 */

import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { z } from "zod";

// ── Mock the model seam (hoisted; factory only) ──────────────────────────────
vi.mock("../models/OsAdminUserModel", () => ({
  OsAdminUserModel: {
    listInternalUsers: vi.fn(async () => [
      {
        id: 7,
        email: "team@test.alloro",
        name: null,
        first_name: "Team",
        last_name: "Member",
      },
    ]),
  },
}));

import { app } from "./helpers/app";
import { authHeader, superAdminAuthHeader } from "./helpers/auth";

const pingShape = z.object({
  success: z.literal(true),
  data: z.object({ pong: z.literal(true), timestamp: z.string() }),
  error: z.null(),
});

const usersShape = z.object({
  success: z.literal(true),
  data: z.object({
    users: z.array(
      z.object({ id: z.number(), email: z.string(), name: z.string() })
    ),
  }),
  error: z.null(),
});

// Guard-chain rejections (default-deny / superAdminMiddleware) use { error: string }.
const guardErrorShape = z.object({ error: z.string() });

describe("GET /api/admin/os/ping", () => {
  it("returns 401 without a token (default-deny guard)", async () => {
    const res = await request(app).get("/api/admin/os/ping");

    expect(res.status).toBe(401);
    expect(() => guardErrorShape.parse(res.body)).not.toThrow();
  });

  it("returns 403 for an authenticated non-super-admin token", async () => {
    const res = await request(app)
      .get("/api/admin/os/ping")
      .set(authHeader({ email: "not-an-admin@test.alloro" }));

    expect(res.status).toBe(403);
    expect(() => guardErrorShape.parse(res.body)).not.toThrow();
  });

  it("returns 200 + the §8.1 envelope for a super-admin token", async () => {
    const res = await request(app)
      .get("/api/admin/os/ping")
      .set(superAdminAuthHeader());

    expect(res.status).toBe(200);
    expect(() => pingShape.parse(res.body)).not.toThrow();
  });
});

describe("GET /api/admin/os/users", () => {
  it("returns 401 without a token (default-deny guard)", async () => {
    const res = await request(app).get("/api/admin/os/users");

    expect(res.status).toBe(401);
    expect(() => guardErrorShape.parse(res.body)).not.toThrow();
  });

  it("returns 403 for an authenticated non-super-admin token", async () => {
    const res = await request(app)
      .get("/api/admin/os/users")
      .set(authHeader({ email: "not-an-admin@test.alloro" }));

    expect(res.status).toBe(403);
    expect(() => guardErrorShape.parse(res.body)).not.toThrow();
  });

  it("returns 200 + picker users (name composed from first/last) for a super-admin", async () => {
    const res = await request(app)
      .get("/api/admin/os/users")
      .set(superAdminAuthHeader());

    expect(res.status).toBe(200);
    expect(() => usersShape.parse(res.body)).not.toThrow();
    expect(res.body.data.users).toEqual([
      { id: 7, email: "team@test.alloro", name: "Team Member" },
    ]);
  });
});
