/**
 * Unit tests — `getOwnerReceipt` (the HTTP boundary).
 *
 * Proves the two things the boundary owns and nothing downstream can recover
 * from: (1) tenant scope — the org comes from server context, and a location
 * outside the caller's access is a 403, not a filtered read; and (2) window
 * COMPARABILITY — a pair of windows that cannot yield an honest before/after is
 * refused with a 400 rather than measured and caveated. Both response shapes
 * are asserted against the `{ success, data, error }` contract (§20.2).
 *
 * Only the service seam is mocked; the real parsing, validation and error
 * mapping run.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

const serviceGetReceipt = vi.fn();

vi.mock(
  "../controllers/owner-receipt/feature-services/OwnerReceiptService",
  () => ({
    OwnerReceiptService: {
      getReceipt: (...a: unknown[]) => serviceGetReceipt(...a),
    },
  })
);
vi.mock("../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getOwnerReceipt } from "../controllers/owner-receipt/OwnerReceiptController";

interface CapturedResponse {
  status: number;
  body: {
    success: boolean;
    data: unknown;
    error: { code: string; message: string; details: unknown } | null;
  };
}

/** A minimal Express response that records what the handler wrote. */
function makeRes(): { res: Response; captured: CapturedResponse } {
  const captured: CapturedResponse = {
    status: 0,
    body: { success: false, data: null, error: null },
  };
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: CapturedResponse["body"]) {
      captured.body = body;
      return this;
    },
  } as unknown as Response;
  return { res, captured };
}

/** A request carrying the server-derived tenant context rbacMiddleware sets. */
function makeReq(
  query: Record<string, string>,
  scope: {
    organizationId?: number;
    accessibleLocationIds?: number[];
    locationId?: number;
  } = {}
): Request {
  return {
    query,
    userId: 1,
    organizationId: scope.organizationId ?? 8,
    accessibleLocationIds: scope.accessibleLocationIds ?? [80, 81],
    locationId: scope.locationId,
  } as unknown as Request;
}

/** Two equal-length, non-overlapping 14-day windows — the honest default. */
const VALID_QUERY = {
  preStart: "2026-05-04",
  preEnd: "2026-05-17",
  postStart: "2026-05-18",
  postEnd: "2026-05-31",
};

beforeEach(() => {
  vi.clearAllMocks();
  serviceGetReceipt.mockResolvedValue({ organizationId: 8, metrics: [] });
});

describe("getOwnerReceipt — success contract", () => {
  it("returns { success, data, error } with the org from server context", async () => {
    const { res, captured } = makeRes();

    await getOwnerReceipt(makeReq(VALID_QUERY), res);

    expect(captured.status).toBe(200);
    expect(captured.body.success).toBe(true);
    expect(captured.body.error).toBeNull();
    expect(serviceGetReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 8, accessibleLocationIds: [80, 81] })
    );
  });

  it("ignores a client-supplied organization_id — scope is server-derived (§11.7)", async () => {
    const { res } = makeRes();

    await getOwnerReceipt(
      makeReq({ ...VALID_QUERY, organization_id: "999" }),
      res
    );

    // The injected value reaches nothing: the service is called with the org
    // the middleware resolved, never the one in the query string.
    expect(serviceGetReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 8 })
    );
    const call = serviceGetReceipt.mock.calls[0][0] as Record<string, unknown>;
    expect(call.organization_id).toBeUndefined();
  });
});

describe("getOwnerReceipt — tenant scope", () => {
  it("403s when the requested location is outside the caller's access", async () => {
    const { res, captured } = makeRes();

    await getOwnerReceipt(
      makeReq(VALID_QUERY, { accessibleLocationIds: [80], locationId: 999 }),
      res
    );

    expect(captured.status).toBe(403);
    expect(captured.body.success).toBe(false);
    expect(captured.body.data).toBeNull();
    expect(captured.body.error?.code).toBe("OWNER_RECEIPT_LOCATION_ACCESS_DENIED");
    expect(serviceGetReceipt).not.toHaveBeenCalled();
  });
});

describe("getOwnerReceipt — refuses windows it cannot honestly compare", () => {
  /** Assert a 400 with the window code, and that nothing was read. */
  const expectWindowRefusal = (captured: CapturedResponse): void => {
    expect(captured.status).toBe(400);
    expect(captured.body.success).toBe(false);
    expect(captured.body.data).toBeNull();
    expect(captured.body.error?.code).toBe("OWNER_RECEIPT_WINDOW_INVALID");
    expect(serviceGetReceipt).not.toHaveBeenCalled();
  };

  it("400s on unequal window lengths", async () => {
    const { res, captured } = makeRes();

    // 14-day pre against a 28-day post: every day stored in both, and still a
    // "+100% lift" that is pure calendar.
    await getOwnerReceipt(
      makeReq({
        preStart: "2026-05-04",
        preEnd: "2026-05-17",
        postStart: "2026-05-18",
        postEnd: "2026-06-14",
      }),
      res
    );

    expectWindowRefusal(captured);
    expect(captured.body.error?.message).toMatch(/different lengths/);
  });

  it("400s on overlapping windows", async () => {
    const { res, captured } = makeRes();

    await getOwnerReceipt(
      makeReq({
        preStart: "2026-05-01",
        preEnd: "2026-05-10",
        postStart: "2026-05-05",
        postEnd: "2026-05-14",
      }),
      res
    );

    expectWindowRefusal(captured);
    expect(captured.body.error?.message).toMatch(/overlap/);
  });

  it("400s on a window longer than the cap", async () => {
    const { res, captured } = makeRes();

    await getOwnerReceipt(
      makeReq({
        preStart: "2000-01-01",
        preEnd: "2013-01-01",
        postStart: "2013-01-02",
        postEnd: "2026-01-01",
      }),
      res
    );

    expectWindowRefusal(captured);
  });

  it("400s on a malformed date rather than guessing one", async () => {
    const { res, captured } = makeRes();

    await getOwnerReceipt(makeReq({ ...VALID_QUERY, preStart: "yesterday" }), res);

    expectWindowRefusal(captured);
  });

  it("400s when a window's start is after its end", async () => {
    const { res, captured } = makeRes();

    await getOwnerReceipt(
      makeReq({ ...VALID_QUERY, preStart: "2026-05-17", preEnd: "2026-05-04" }),
      res
    );

    expectWindowRefusal(captured);
  });
});
