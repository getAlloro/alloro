import { describe, it, expect, vi, afterEach } from "vitest";
import {
  NapConsistencyReadService,
} from "../controllers/nap-consistency/feature-services/NapConsistencyReadService";
import { NapConsistencyController } from "../controllers/nap-consistency/NapConsistencyController";
import { clientContext } from "../controllers/nap-consistency/NapConsistencyController";
import { NapConsistencyError } from "../controllers/nap-consistency/feature-utils/NapConsistencyError";
import {
  INapConsistencyObservation,
  NapConsistencyObservationModel,
} from "../models/NapConsistencyObservationModel";
import type { Request, Response } from "express";

/**
 * Reader proofs for Alloro Funnel Engine A4. The monitor wrote observations that
 * NOTHING read; this covers the read surface that closes that seam. Bar (§20.2):
 * the {success,data,error} contract, the error/throw path, the tenant scope
 * being forwarded, and the honesty invariant — a never-measured location is
 * absent, never zero-filled.
 */

afterEach(() => vi.restoreAllMocks());

function row(over: Partial<INapConsistencyObservation>): INapConsistencyObservation {
  return {
    id: "obs-1",
    organization_id: 7,
    location_id: 42,
    run_date: "2026-07-16",
    sources_checked: 3,
    consistent_count: 2,
    conflict_count: 1,
    conflicts: [
      { source: "https://yelp.com/biz/x", sourceHost: "yelp.com", matchState: "conflicting" },
    ],
    observed_at: new Date("2026-07-16T00:00:00Z"),
    created_at: new Date("2026-07-16T00:00:00Z"),
    updated_at: new Date("2026-07-16T00:00:00Z"),
    ...over,
  };
}

describe("NapConsistencyReadService.getForLocation", () => {
  it("surfaces the latest observation, real conflicts, and history (§8.1 shape via controller)", async () => {
    const newer = row({ id: "b", run_date: "2026-07-16", observed_at: new Date("2026-07-16T00:00:00Z") });
    const older = row({
      id: "a",
      run_date: "2026-07-02",
      conflict_count: 0,
      consistent_count: 3,
      conflicts: [],
      observed_at: new Date("2026-07-02T00:00:00Z"),
    });
    // listForLocation returns newest-first (ORDER BY observed_at desc).
    vi.spyOn(NapConsistencyObservationModel, "listForLocation").mockResolvedValue([
      newer,
      older,
    ]);

    const result = await NapConsistencyReadService.getForLocation(7, 42, null);

    expect(result.latest?.runDate).toBe("2026-07-16");
    expect(result.latest?.conflictCount).toBe(1);
    expect(result.latest?.conflicts).toEqual([
      { source: "https://yelp.com/biz/x", sourceHost: "yelp.com", matchState: "conflicting" },
    ]);
    expect(result.hasConflicts).toBe(true);
    expect(result.history).toHaveLength(2);
  });

  it("HONESTY: a never-measured location is absent, not a manufactured all-clear", async () => {
    vi.spyOn(NapConsistencyObservationModel, "listForLocation").mockResolvedValue([]);

    const result = await NapConsistencyReadService.getForLocation(7, 999, null);

    // No zero-fill. latest is null; hasConflicts is false BECAUSE there is no
    // data, not because a fabricated "0 conflicts" row said so.
    expect(result.latest).toBeNull();
    expect(result.hasConflicts).toBe(false);
    expect(result.history).toEqual([]);
  });

  it("latest with conflict_count 0 reports hasConflicts false (a real clean measurement)", async () => {
    vi.spyOn(NapConsistencyObservationModel, "listForLocation").mockResolvedValue([
      row({ conflict_count: 0, conflicts: [] }),
    ]);

    const result = await NapConsistencyReadService.getForLocation(7, 42, null);

    expect(result.latest).not.toBeNull();
    expect(result.hasConflicts).toBe(false);
  });

  it("drops a malformed stored conflict rather than coercing it (§4.5 narrow)", async () => {
    vi.spyOn(NapConsistencyObservationModel, "listForLocation").mockResolvedValue([
      row({
        conflict_count: 2,
        conflicts: [
          { source: "https://ok.com", sourceHost: "ok.com", matchState: "conflicting" },
          { source: 123, sourceHost: null }, // malformed
        ] as unknown[],
      }),
    ]);

    const result = await NapConsistencyReadService.getForLocation(7, 42, null);

    // Only the well-formed conflict survives; the garbage row is not invented
    // into a fake conflict. conflict_count stays as the monitor recorded it.
    expect(result.latest?.conflicts).toEqual([
      { source: "https://ok.com", sourceHost: "ok.com", matchState: "conflicting" },
    ]);
    expect(result.latest?.conflictCount).toBe(2);
  });

  it("forwards the tenant scope straight to the model (§11.7)", async () => {
    const spy = vi
      .spyOn(NapConsistencyObservationModel, "listForLocation")
      .mockResolvedValue([]);

    await NapConsistencyReadService.getForLocation(7, 42, null);

    expect(spy).toHaveBeenCalledWith(7, 42, 30);
  });

  it("clamps an oversized limit to the maximum (§11.6 bounded read)", async () => {
    const spy = vi
      .spyOn(NapConsistencyObservationModel, "listForLocation")
      .mockResolvedValue([]);

    await NapConsistencyReadService.getForLocation(7, 42, 5000);

    expect(spy).toHaveBeenCalledWith(7, 42, 100);
  });

  it("a model read failure becomes a typed domain error, not a leaked stack (§3.2/§8.3)", async () => {
    vi.spyOn(NapConsistencyObservationModel, "listForLocation").mockRejectedValue(
      new Error("connection reset")
    );

    await expect(NapConsistencyReadService.getForLocation(7, 42, null)).rejects.toMatchObject({
      code: "NAP_CONSISTENCY_READ_FAILED",
    });
  });
});

describe("NapConsistencyController.clientContext — server-derived scope (§5.5/§11.7)", () => {
  it("uses the middleware-validated location, ignoring the DB/id shape", () => {
    const req = {
      query: {},
      body: {},
      organizationId: 7,
      locationId: 42,
      accessibleLocationIds: [42, 43],
    } as unknown as Request;

    expect(clientContext(req)).toEqual({ organizationId: 7, locationId: 42 });
  });

  it("rejects a requested locationId that the caller does not have scoped access to", () => {
    const req = {
      query: { locationId: "99" }, // not the middleware-resolved location
      body: {},
      organizationId: 7,
      locationId: 42,
      accessibleLocationIds: [42],
    } as unknown as Request;

    expect(() => clientContext(req)).toThrow(NapConsistencyError);
    try {
      clientContext(req);
    } catch (e) {
      expect((e as NapConsistencyError).code).toBe("LOCATION_ACCESS_DENIED");
    }
  });

  it("throws when location scope was never established (§5.5 — no silent unscoped read)", () => {
    const req = { query: {}, body: {}, organizationId: 7 } as unknown as Request;
    expect(() => clientContext(req)).toThrow("Location access could not be verified.");
  });
});

describe("NapConsistencyController.getForLocation — {success,data,error} contract (§8.1)", () => {
  function mockRes(): Response & { _status: number; _json: unknown } {
    const res = {
      _status: 200,
      _json: null as unknown,
      status(code: number) {
        this._status = code;
        return this;
      },
      json(body: unknown) {
        this._json = body;
        return this;
      },
    };
    return res as unknown as Response & { _status: number; _json: unknown };
  }

  it("returns success envelope on a good read", async () => {
    vi.spyOn(NapConsistencyObservationModel, "listForLocation").mockResolvedValue([]);
    const req = {
      query: {},
      body: {},
      organizationId: 7,
      locationId: 42,
      accessibleLocationIds: [42],
    } as unknown as Request;
    const res = mockRes();

    await NapConsistencyController.getForLocation(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toMatchObject({ success: true, error: null });
  });

  it("returns the error envelope (not a throw) when scope is missing", async () => {
    const req = { query: {}, body: {}, organizationId: 7 } as unknown as Request;
    const res = mockRes();

    await NapConsistencyController.getForLocation(req, res);

    expect(res._json).toMatchObject({
      success: false,
      data: null,
      error: { code: "LOCATION_SCOPE_UNAVAILABLE" },
    });
  });
});
