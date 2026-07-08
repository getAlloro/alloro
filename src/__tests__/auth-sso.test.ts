/**
 * Unit tests — Google SSO admin login
 * (plans/07052026-google-sso-admin-and-user-login).
 *
 * Covers the security-critical seams without a live DB or network:
 *  • identity gating (verified email, subject present)
 *  • the admin domain gate
 *  • the domain-OR-allowlist super-admin rule
 *  • the find-or-create session service (UserModel + JWT mint mocked)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TokenPayload } from "google-auth-library";

vi.mock("../models/UserModel", () => ({
  UserModel: {
    findByGoogleSub: vi.fn(),
    findByEmail: vi.fn(),
    createFromGoogle: vi.fn(),
    attachGoogleIdentity: vi.fn(),
    markInternal: vi.fn(),
  },
}));
vi.mock(
  "../controllers/auth-otp/feature-services/service.jwt-management",
  () => ({ generateToken: vi.fn(() => "jwt-token") })
);

import {
  assertGoogleIdentity,
  assertAdminDomain,
} from "../controllers/auth-sso/feature-services/service.google-identity";
import { loginAdminFromGoogle } from "../controllers/auth-sso/feature-services/service.sso-session";
import { isSuperAdmin } from "../controllers/auth-otp/feature-services/service.super-admin";
import { AuthSsoError } from "../controllers/auth-sso/feature-utils/AuthSsoError";
import { UserModel } from "../models/UserModel";

const payload = (over: Partial<TokenPayload>): TokenPayload =>
  ({
    sub: "g-1",
    email: "Admin@Getalloro.com",
    email_verified: true,
    name: "Admin",
    picture: "https://x/p.png",
    ...over,
  }) as TokenPayload;

describe("assertGoogleIdentity", () => {
  it("normalizes a verified payload into an identity", () => {
    const id = assertGoogleIdentity(payload({}));
    expect(id).toEqual({
      googleSub: "g-1",
      email: "admin@getalloro.com",
      name: "Admin",
      avatarUrl: "https://x/p.png",
    });
  });

  it("rejects an unverified email", () => {
    expect(() => assertGoogleIdentity(payload({ email_verified: false }))).toThrow(
      AuthSsoError
    );
  });

  it("rejects a missing subject", () => {
    expect(() => assertGoogleIdentity(payload({ sub: undefined }))).toThrow(
      AuthSsoError
    );
  });
});

describe("assertAdminDomain", () => {
  it("passes an @getalloro.com email", () => {
    expect(() => assertAdminDomain("a@getalloro.com")).not.toThrow();
  });
  it("rejects any other domain", () => {
    expect(() => assertAdminDomain("a@gmail.com")).toThrow(AuthSsoError);
  });
});

describe("isSuperAdmin (domain-only, no SUPER_ADMIN_EMAILS)", () => {
  it("grants any @getalloro.com account by domain", () => {
    expect(isSuperAdmin("anyone@getalloro.com")).toBe(true);
  });
  it("denies a non-domain email even if it was formerly allowlisted", () => {
    process.env.SUPER_ADMIN_EMAILS = "laggy80@gmail.com";
    expect(isSuperAdmin("laggy80@gmail.com")).toBe(false);
  });
  it("denies a random external email", () => {
    expect(isSuperAdmin("random@example.com")).toBe(false);
  });
});

describe("loginAdminFromGoogle", () => {
  const identity = {
    googleSub: "g-1",
    email: "admin@getalloro.com",
    name: "Admin",
    avatarUrl: null,
  };

  beforeEach(() => vi.clearAllMocks());

  it("mints a token for an existing google_sub match", async () => {
    (UserModel.findByGoogleSub as any).mockResolvedValue({
      id: 5,
      email: "admin@getalloro.com",
      name: "Admin",
      is_internal: true,
    });
    const r = await loginAdminFromGoogle(identity);
    expect(r).toEqual({
      token: "jwt-token",
      user: { id: 5, email: "admin@getalloro.com", name: "Admin" },
    });
    expect(UserModel.createFromGoogle).not.toHaveBeenCalled();
    expect(UserModel.markInternal).not.toHaveBeenCalled();
  });

  it("links google_sub onto an existing email match", async () => {
    (UserModel.findByGoogleSub as any).mockResolvedValue(undefined);
    (UserModel.findByEmail as any).mockResolvedValue({
      id: 7,
      email: "admin@getalloro.com",
      name: "Admin",
      is_internal: true,
    });
    (UserModel.attachGoogleIdentity as any).mockResolvedValue({
      id: 7,
      email: "admin@getalloro.com",
      name: "Admin",
      is_internal: true,
    });
    const r = await loginAdminFromGoogle(identity);
    expect(UserModel.attachGoogleIdentity).toHaveBeenCalledWith(7, "g-1", null);
    expect(r.user.id).toBe(7);
  });

  it("creates a fresh admin user when neither match exists", async () => {
    (UserModel.findByGoogleSub as any).mockResolvedValue(undefined);
    (UserModel.findByEmail as any).mockResolvedValue(undefined);
    (UserModel.createFromGoogle as any).mockResolvedValue({
      id: 9,
      email: "admin@getalloro.com",
      name: "Admin",
      is_internal: true,
    });
    const r = await loginAdminFromGoogle(identity);
    expect(UserModel.createFromGoogle).toHaveBeenCalledOnce();
    expect(r.user.id).toBe(9);
  });

  it("heals is_internal for an existing @getalloro row that missed the seed", async () => {
    (UserModel.findByGoogleSub as any).mockResolvedValue({
      id: 12,
      email: "late@getalloro.com",
      name: "Late Admin",
      is_internal: false,
    });
    (UserModel.markInternal as any).mockResolvedValue({
      id: 12,
      email: "late@getalloro.com",
      name: "Late Admin",
      is_internal: true,
    });
    const r = await loginAdminFromGoogle(identity);
    expect(UserModel.markInternal).toHaveBeenCalledWith(12);
    expect(r.user.id).toBe(12);
  });

  it("rejects a non-@getalloro identity before any DB call", async () => {
    await expect(
      loginAdminFromGoogle({ ...identity, email: "x@gmail.com" })
    ).rejects.toThrow(AuthSsoError);
    expect(UserModel.findByGoogleSub).not.toHaveBeenCalled();
  });
});
