/**
 * Smoke tests — auth (email/password login + token validate).
 *
 * The OTP login flow was retired (plans/07052026-google-sso-admin-and-user-login,
 * T7); admin sign-in now runs through Google SSO (covered by auth-sso tests).
 * What remains here: the password login happy/failure paths and the /validate
 * endpoint.
 *
 * These endpoints route cleanly through models/, so they are mocked at the
 * MODEL seam (Option B) rather than the raw `db` seam:
 *   • UserModel / OrganizationUserModel / InvitationModel / GoogleConnectionModel
 *   • bcrypt (password compare) — no real hashing
 *   • emails/emailService.sendEmail — never sends a real email
 *
 * Asserted per endpoint: one happy path (success status + token-bearing shape)
 * and one+ failure path (bad creds / missing body). No live DB, no outbound
 * network. /api/auth is on the public allowlist, so no JWT is required to reach
 * these handlers.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { z } from "zod";

// ── Mock the model + side-effect seams (hoisted; factories only) ──────────────
vi.mock("../models/UserModel", () => ({
  UserModel: {
    findByEmail: vi.fn(),
    findById: vi.fn(),
  },
}));
vi.mock("../models/OrganizationUserModel", () => ({
  OrganizationUserModel: {
    findByUserId: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock("../models/InvitationModel", () => ({
  InvitationModel: {
    findPendingByEmail: vi.fn(async () => null),
    updateStatus: vi.fn(),
  },
}));
vi.mock("../models/GoogleConnectionModel", () => ({
  GoogleConnectionModel: {
    findOne: vi.fn(async () => null),
  },
}));
vi.mock("bcrypt", () => ({
  default: { compare: vi.fn(), hash: vi.fn(async () => "hashed") },
  compare: vi.fn(),
  hash: vi.fn(async () => "hashed"),
}));
vi.mock("../emails/emailService", () => ({
  sendEmail: vi.fn(async () => ({ success: true })),
}));
// linkAccountCreation is fire-and-forget; stub so nothing escapes.
vi.mock(
  "../controllers/leadgen-tracking/feature-services/service.account-linking",
  () => ({ linkAccountCreation: vi.fn(async () => undefined) }),
);

import { app } from "./helpers/app";
import { UserModel } from "../models/UserModel";
import { OrganizationUserModel } from "../models/OrganizationUserModel";
import bcrypt from "bcrypt";

const loginSuccessShape = z.object({
  success: z.literal(true),
  token: z.string().min(1),
  user: z.object({
    id: z.number(),
    email: z.string(),
    role: z.string(),
  }),
});

const errorShape = z.object({ error: z.string() });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/login", () => {
  it("returns 200 + token-bearing shape for valid credentials", async () => {
    (UserModel.findByEmail as any).mockResolvedValue({
      id: 42,
      email: "user@test.alloro",
      name: "Test User",
      password_hash: "stored-hash",
      email_verified: true,
    });
    (OrganizationUserModel.findByUserId as any).mockResolvedValue({
      organization_id: 7,
      role: "admin",
    });
    (bcrypt.compare as any).mockResolvedValue(true);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@test.alloro", password: "correct-horse" });

    expect(res.status).toBe(200);
    expect(() => loginSuccessShape.parse(res.body)).not.toThrow();
  });

  it("returns 401 + error shape for a bad password", async () => {
    (UserModel.findByEmail as any).mockResolvedValue({
      id: 42,
      email: "user@test.alloro",
      password_hash: "stored-hash",
      email_verified: true,
    });
    (bcrypt.compare as any).mockResolvedValue(false);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@test.alloro", password: "wrong" });

    expect(res.status).toBe(401);
    expect(() => errorShape.parse(res.body)).not.toThrow();
  });

  it("returns 400 + error shape when the body is missing fields", async () => {
    const res = await request(app).post("/api/auth/login").send({});

    expect(res.status).toBe(400);
    expect(() => errorShape.parse(res.body)).not.toThrow();
  });
});

describe("POST /api/auth/otp/validate", () => {
  it("returns 401 + invalid shape when no token is provided", async () => {
    const res = await request(app).post("/api/auth/otp/validate").send({});

    expect(res.status).toBe(401);
    expect(res.body.valid).toBe(false);
    expect(typeof res.body.error).toBe("string");
  });
});

describe("SSO routing (GBP /google/callback collision regression)", () => {
  it("routes /api/auth/google/callback to auth-sso, not the GBP controller", async () => {
    // The GBP router also defines /google/callback; auth-sso must be mounted
    // first so THIS handles the login callback. A bad state → auth-sso redirects
    // (302) to the finish page with an error. The GBP controller would instead
    // return a JSON 401 unauthorized_client — that's the bug this guards.
    const res = await request(app).get(
      "/api/auth/google/callback?state=bogus&code=bogus"
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/auth/google/finish");
    expect(res.headers.location).toContain("error=");
  });
});
