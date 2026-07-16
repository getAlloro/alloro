import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthToken } from "../api";
import { getCurrentUserId } from "./currentUser";

vi.mock("../api", () => ({
  getAuthToken: vi.fn(),
}));

const b64url = (obj: Record<string, unknown>): string =>
  btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_");

const makeToken = (claims: Record<string, unknown>): string =>
  `h.${b64url(claims)}.s`;

describe("getCurrentUserId", () => {
  beforeEach(() => {
    vi.mocked(getAuthToken).mockReturnValue(null);
  });

  it("decodes the shared auth token", () => {
    vi.mocked(getAuthToken).mockReturnValue(makeToken({ userId: 76 }));

    expect(getCurrentUserId()).toBe(76);
  });

  it("returns null when the shared resolver has no token", () => {
    expect(getCurrentUserId()).toBeNull();
  });
});
