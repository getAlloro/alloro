/**
 * Smoke tests — admin reads (auth-boundary + happy path).
 *
 * Target: GET /api/admin/app-logs (super-admin-gated).
 *
 * Why this endpoint is the clean authed-200 case: getLogFile reads a log file
 * via a service — it touches NO database. With a super-admin JWT (email seeded
 * into SUPER_ADMIN_EMAILS by setup.ts) the full guard chain
 * (default-deny → authenticateToken → superAdminMiddleware) is exercised and the
 * controller returns 200 even when the log file does not exist. No mocks needed.
 *
 * Auth-boundary cases prove the app-level default-deny guard:
 *   • no token            → 401
 *   • valid non-admin JWT → 403 (authenticated but not super-admin)
 */

import { describe, it, expect } from "vitest";
import request from "supertest";
import { z } from "zod";

import { app } from "./helpers/app";
import { authHeader, superAdminAuthHeader } from "./helpers/auth";

const appLogsShape = z.object({
  success: z.literal(true),
  data: z.object({
    logs: z.unknown(),
    total_lines: z.number(),
    timestamp: z.string(),
    log_type: z.string(),
  }),
  // present only when the file does not exist yet — optional either way
  message: z.string().optional(),
});

const errorShape = z.object({ error: z.string() });

describe("GET /api/admin/app-logs", () => {
  it("returns 200 + log payload shape for a super-admin token", async () => {
    const res = await request(app)
      .get("/api/admin/app-logs")
      .set(superAdminAuthHeader());

    expect(res.status).toBe(200);
    expect(() => appLogsShape.parse(res.body)).not.toThrow();
  });

  it("returns 401 without a token (default-deny guard)", async () => {
    const res = await request(app).get("/api/admin/app-logs");

    expect(res.status).toBe(401);
    expect(() => errorShape.parse(res.body)).not.toThrow();
  });

  it("returns 403 for an authenticated non-super-admin token", async () => {
    const res = await request(app)
      .get("/api/admin/app-logs")
      .set(authHeader({ email: "not-an-admin@test.alloro" }));

    expect(res.status).toBe(403);
    expect(() => errorShape.parse(res.body)).not.toThrow();
  });
});
