/**
 * Email interceptor — the property that keeps a dev run from reaching an owner.
 *
 * The interceptor allows a live send only when this machine's own public IP is
 * one of the DNS A records of app.getalloro.com. It deliberately ignores
 * NODE_ENV, which `ecosystem.config.js` forces to "production" on the dev box
 * too — so an env-based gate would fail OPEN on dev. Any failure to establish
 * identity (DNS error, IP lookup timeout) fails CLOSED into interception.
 *
 * These tests pin that property so a future refactor cannot quietly swap the
 * identity check for a config check. §20.4 — DNS and the IP service are mocked;
 * no network call and no email leaves this suite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const resolve4 = vi.fn();
const axiosGet = vi.fn();

vi.mock("dns", () => ({
  promises: { resolve4 },
  default: { promises: { resolve4 } },
}));

vi.mock("axios", () => ({
  default: { get: axiosGet },
}));

const LIVE_IP = "203.0.113.10";
const DEV_IP = "198.51.100.7";

/**
 * The module caches its verdict for 10 minutes and primes it at import time, so
 * each case needs a fresh module registry.
 */
async function loadInterceptor() {
  vi.resetModules();
  return import("../emails/emailInterceptor");
}

function payload() {
  return {
    recipients: ["owner@practice.test", "second@practice.test"],
    cc: ["cc@practice.test"],
    bcc: ["bcc@practice.test"],
    subject: "Your week with Alloro — One Endodontics",
  };
}

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  resolve4.mockReset();
  axiosGet.mockReset();
});

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

describe("emailInterceptor — identity, not configuration", () => {
  it("intercepts on a non-live machine even when NODE_ENV is 'production'", async () => {
    // This is exactly the dev box: ecosystem.config.js forces NODE_ENV to
    // "production" there. An env-based gate would send real email.
    process.env.NODE_ENV = "production";
    resolve4.mockResolvedValue([LIVE_IP]);
    axiosGet.mockResolvedValue({ data: `${DEV_IP}\n` });

    const { interceptEmailPayload } = await loadInterceptor();
    const result = await interceptEmailPayload(payload());

    expect(result.intercepted).toBe(true);
    expect(result.payload.recipients).toEqual(["dave@getalloro.com"]);
    expect(result.payload.cc).toEqual([]);
    expect(result.payload.bcc).toEqual([]);
    expect(result.payload.subject.startsWith("[Intercepted] ")).toBe(true);
    // Nothing addressed to a practice survives.
    expect(result.payload.recipients).not.toContain("owner@practice.test");
  });

  it("sends live only when this machine's IP is an A record of the live host", async () => {
    process.env.NODE_ENV = "development";
    resolve4.mockResolvedValue(["192.0.2.1", LIVE_IP]);
    axiosGet.mockResolvedValue({ data: `${LIVE_IP}\n` });

    const { interceptEmailPayload } = await loadInterceptor();
    const result = await interceptEmailPayload(payload());

    // NODE_ENV says development; identity says live. Identity wins.
    expect(result.intercepted).toBe(false);
    expect(result.payload.recipients).toEqual([
      "owner@practice.test",
      "second@practice.test",
    ]);
  });

  it("fails closed into interception when DNS cannot be resolved", async () => {
    resolve4.mockRejectedValue(new Error("ENOTFOUND"));
    axiosGet.mockResolvedValue({ data: `${LIVE_IP}\n` });

    const { interceptEmailPayload } = await loadInterceptor();
    const result = await interceptEmailPayload(payload());

    expect(result.intercepted).toBe(true);
    expect(result.payload.recipients).toEqual(["dave@getalloro.com"]);
  });

  it("fails closed into interception when the public IP lookup fails", async () => {
    resolve4.mockResolvedValue([LIVE_IP]);
    axiosGet.mockRejectedValue(new Error("timeout"));

    const { interceptEmailPayload } = await loadInterceptor();
    const result = await interceptEmailPayload(payload());

    expect(result.intercepted).toBe(true);
  });

  it("fails closed when the IP service returns an empty body", async () => {
    resolve4.mockResolvedValue([LIVE_IP]);
    axiosGet.mockResolvedValue({ data: "   " });

    const { interceptEmailPayload } = await loadInterceptor();
    const result = await interceptEmailPayload(payload());

    expect(result.intercepted).toBe(true);
  });

  it("reports every address the email would have reached", async () => {
    resolve4.mockResolvedValue([LIVE_IP]);
    axiosGet.mockResolvedValue({ data: `${DEV_IP}\n` });

    const { interceptEmailPayload } = await loadInterceptor();
    const result = await interceptEmailPayload(payload());

    expect(result.originalRecipients).toEqual([
      "owner@practice.test",
      "second@practice.test",
      "cc@practice.test",
      "bcc@practice.test",
    ]);
  });
});
