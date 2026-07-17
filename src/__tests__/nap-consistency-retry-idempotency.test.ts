import { afterEach, describe, expect, it, vi } from "vitest";
import {
  executeNapConsistencyAgent,
  NapPersistenceError,
} from "../services/nap-consistency/executor";
import { NapConsistencyObservationModel } from "../models/NapConsistencyObservationModel";

describe("NAP retry idempotency across UTC midnight (§21.1)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("a bookkeeping retry skips already-landed paid work under the original logical date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T23:59:59.500Z"));
    const persistedKeys = new Set<string>();
    const runner = vi.fn().mockResolvedValue({ status: "ok", sources: [] });
    const runDate = "2026-07-16";
    const deps = {
      targetProvider: async () => [
        { organizationId: 7, locationId: 42, domain: "example.com" },
      ],
      hasObservationForLogicalRun: async (
        _organizationId: number,
        locationId: number,
        logicalRunDate: string
      ) => persistedKeys.has(`${locationId}|${logicalRunDate}`),
      runner,
      record: async (input: { locationId: number; runDate: string }) => {
        persistedKeys.add(`${input.locationId}|${input.runDate}`);
        return true;
      },
      runDate,
      observedAt: new Date("2026-07-16T23:59:59.000Z"),
    };

    const firstAttempt = await executeNapConsistencyAgent(deps);
    vi.setSystemTime(new Date("2026-07-17T00:00:00.500Z"));
    const retry = await executeNapConsistencyAgent(deps);

    expect(firstAttempt.summary.locationsRecorded).toBe(1);
    expect(retry.summary.locationsRecorded).toBe(0);
    expect(retry.summary.locationsAlreadyRecorded).toBe(1);
    expect(runner).toHaveBeenCalledOnce();
    expect(persistedKeys).toEqual(new Set(["42|2026-07-16"]));
  });

  it("fails before paid measurement when the logical-key preflight cannot be read", async () => {
    const runner = vi.fn();

    await expect(
      executeNapConsistencyAgent({
        targetProvider: async () => [
          { organizationId: 7, locationId: 42, domain: "example.com" },
        ],
        hasObservationForLogicalRun: async () => {
          throw new Error("database unavailable");
        },
        runner,
        record: async () => true,
        runDate: "2026-07-16",
        observedAt: new Date("2026-07-16T23:59:59.000Z"),
      })
    ).rejects.toThrow(NapPersistenceError);

    expect(runner).not.toHaveBeenCalled();
  });
});

describe("NapConsistencyObservationModel logical-run preflight (§11.7/§20.1)", () => {
  it("requires tenant, location, and logical date in the lookup", async () => {
    const captured: { where?: Record<string, unknown>; selected?: string } = {};
    const chain = {
      where(conditions: Record<string, unknown>) {
        captured.where = conditions;
        return chain;
      },
      first(column: string) {
        captured.selected = column;
        return Promise.resolve({ id: "row-1" });
      },
    };
    const table = vi
      .spyOn(
        NapConsistencyObservationModel as unknown as {
          table: (trx?: unknown) => unknown;
        },
        "table"
      )
      .mockReturnValue(chain);

    await expect(
      NapConsistencyObservationModel.hasObservationForLogicalRun(
        7,
        42,
        "2026-07-16"
      )
    ).resolves.toBe(true);

    expect(captured.where).toEqual({
      organization_id: 7,
      location_id: 42,
      run_date: "2026-07-16",
    });
    expect(captured.selected).toBe("id");
    table.mockRestore();
  });
});
