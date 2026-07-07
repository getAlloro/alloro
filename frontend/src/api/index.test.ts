import { describe, it, expect, beforeEach } from "vitest";
import { storeRefreshedToken } from "./index";

// A JWT is header.payload.signature; only the payload matters here. The nonce
// lets two tokens for the same user differ, so "was it written" is observable.
const makeToken = (userId: number, nonce: string): string =>
  `h.${btoa(JSON.stringify({ userId, n: nonce }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")}.s`;

describe("storeRefreshedToken — identity-safe sliding refresh", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("persists a same-identity refresh (extends the session)", () => {
    const current = makeToken(76, "old");
    const refreshed = makeToken(76, "new");
    window.localStorage.setItem("auth_token", current);
    storeRefreshedToken({ "x-session-refresh": refreshed });
    expect(window.localStorage.getItem("auth_token")).toBe(refreshed);
  });

  it("drops a different-identity refresh (no clobber)", () => {
    const current = makeToken(76, "old");
    window.localStorage.setItem("auth_token", current);
    storeRefreshedToken({ "x-session-refresh": makeToken(72, "new") });
    expect(window.localStorage.getItem("auth_token")).toBe(current);
  });

  it("drops a refresh when no session is present", () => {
    storeRefreshedToken({ "x-session-refresh": makeToken(72, "new") });
    expect(window.localStorage.getItem("auth_token")).toBeNull();
  });

  it("ignores a response with no refresh header", () => {
    const current = makeToken(76, "old");
    window.localStorage.setItem("auth_token", current);
    storeRefreshedToken({});
    expect(window.localStorage.getItem("auth_token")).toBe(current);
  });

  it("pilot mode: writes sessionStorage on a same-identity refresh", () => {
    const current = makeToken(50, "old");
    const refreshed = makeToken(50, "new");
    window.sessionStorage.setItem("token", current);
    storeRefreshedToken({ "x-session-refresh": refreshed });
    expect(window.sessionStorage.getItem("token")).toBe(refreshed);
    expect(window.localStorage.getItem("auth_token")).toBeNull();
  });

  it("pilot mode: drops a different-identity refresh", () => {
    const current = makeToken(50, "old");
    window.sessionStorage.setItem("token", current);
    storeRefreshedToken({ "x-session-refresh": makeToken(99, "new") });
    expect(window.sessionStorage.getItem("token")).toBe(current);
  });
});
