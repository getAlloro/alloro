/**
 * Service-token middleware — both rollout stages.
 *
 * Unit test against the middleware directly rather than through the app, so the
 * two stages can be exercised by flipping env without rebuilding the router
 * stack. The stage-1 behaviour is the one that matters most: it must NOT reject,
 * because the PMS→agents pipeline and the Clarity / ranking webhooks are live
 * and un-tokened today.
 *
 * Covers §11.1 (auth on protected routes) and §5.6 (config validated at
 * startup, not discovered at request time).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Response } from "express";

import { serviceTokenMiddleware } from "../middleware/serviceToken";
import type { ServiceTokenRequest } from "../middleware/serviceToken";
import {
  SERVICE_TOKEN_HEADER,
  assertServiceTokenConfig,
  serviceTokenHeader,
} from "../config/serviceToken";

const TOKEN = "test-service-token-value";

function makeReq(headerValue?: string): ServiceTokenRequest {
  return {
    headers: headerValue ? { [SERVICE_TOKEN_HEADER]: headerValue } : {},
    path: "/monthly-agents-run",
    method: "POST",
    ip: "127.0.0.1",
  } as unknown as ServiceTokenRequest;
}

function makeRes(): Response & { statusCode?: number; payload?: unknown } {
  const res = {
    status: vi.fn(function (this: any, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(function (this: any, body: unknown) {
      this.payload = body;
      return this;
    }),
  };
  return res as unknown as Response & { statusCode?: number; payload?: unknown };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("serviceTokenMiddleware — stage 1 (observation)", () => {
  it("lets an un-tokened call through so the live pipeline keeps working", () => {
    vi.stubEnv("ALLORO_SERVICE_TOKEN", TOKEN);
    const next = vi.fn();
    const res = makeRes();

    serviceTokenMiddleware(makeReq(), res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("marks a caller presenting a valid token", () => {
    vi.stubEnv("ALLORO_SERVICE_TOKEN", TOKEN);
    const next = vi.fn();
    const req = makeReq(TOKEN);

    serviceTokenMiddleware(req, makeRes(), next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.isServiceCaller).toBe(true);
  });
});

describe("serviceTokenMiddleware — stage 2 (enforcing)", () => {
  beforeEach(() => {
    vi.stubEnv("ALLORO_SERVICE_TOKEN", TOKEN);
    vi.stubEnv("ALLORO_SERVICE_TOKEN_ENFORCE", "true");
  });

  it("rejects an un-tokened call with 401", () => {
    const next = vi.fn();
    const res = makeRes();

    serviceTokenMiddleware(makeReq(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.payload).toMatchObject({
      success: false,
      data: null,
      error: { code: "SERVICE_TOKEN_REQUIRED" },
    });
  });

  it("rejects a wrong token", () => {
    const next = vi.fn();
    const res = makeRes();

    serviceTokenMiddleware(makeReq("not-the-token"), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("admits a valid token", () => {
    const next = vi.fn();

    serviceTokenMiddleware(makeReq(TOKEN), makeRes(), next);

    expect(next).toHaveBeenCalledOnce();
  });
});

describe("service-token configuration", () => {
  it("refuses to start when enforcing without a configured token", () => {
    vi.stubEnv("ALLORO_SERVICE_TOKEN", "");
    vi.stubEnv("ALLORO_SERVICE_TOKEN_ENFORCE", "true");

    expect(() => assertServiceTokenConfig()).toThrow(/ALLORO_SERVICE_TOKEN/);
  });

  it("starts cleanly in stage 1 with no token configured", () => {
    vi.stubEnv("ALLORO_SERVICE_TOKEN", "");

    expect(() => assertServiceTokenConfig()).not.toThrow();
  });

  it("omits the outbound header when no token is configured", () => {
    vi.stubEnv("ALLORO_SERVICE_TOKEN", "");

    expect(serviceTokenHeader()).toEqual({});
  });

  it("supplies the outbound header when a token is configured", () => {
    vi.stubEnv("ALLORO_SERVICE_TOKEN", TOKEN);

    expect(serviceTokenHeader()).toEqual({ [SERVICE_TOKEN_HEADER]: TOKEN });
  });
});
