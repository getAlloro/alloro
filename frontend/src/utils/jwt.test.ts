import { describe, it, expect } from "vitest";
import { decodeJwtUserId } from "./jwt";

const b64url = (obj: Record<string, unknown>): string =>
  btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_");

const makeToken = (claims: Record<string, unknown>): string =>
  `h.${b64url(claims)}.s`;

describe("decodeJwtUserId", () => {
  it("reads the userId claim", () => {
    expect(decodeJwtUserId(makeToken({ userId: 76 }))).toBe(76);
  });

  it("falls back to id then user_id", () => {
    expect(decodeJwtUserId(makeToken({ id: 5 }))).toBe(5);
    expect(decodeJwtUserId(makeToken({ user_id: 9 }))).toBe(9);
  });

  it("decodes a real (unpadded) base64url payload", () => {
    const unpadded = `h.${b64url({ userId: 4210 }).replace(/=+$/, "")}.s`;
    expect(decodeJwtUserId(unpadded)).toBe(4210);
  });

  it("returns null for a non-numeric or missing id", () => {
    expect(decodeJwtUserId(makeToken({ email: "x@y.com" }))).toBeNull();
    expect(decodeJwtUserId(makeToken({ userId: "76" }))).toBeNull();
  });

  it("returns null for malformed or empty tokens", () => {
    expect(decodeJwtUserId("garbage")).toBeNull();
    expect(decodeJwtUserId("")).toBeNull();
    expect(decodeJwtUserId(null)).toBeNull();
    expect(decodeJwtUserId(undefined)).toBeNull();
  });
});
