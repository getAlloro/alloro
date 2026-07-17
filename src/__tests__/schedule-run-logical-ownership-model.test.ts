import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IScheduleRun,
  ScheduleModel,
  ScheduleRunModel,
} from "../models/ScheduleModel";

const RUN: IScheduleRun = {
  id: 99,
  schedule_id: 7,
  logical_run_key: "sched-7-1752537600000",
  status: "running",
  started_at: new Date("2026-07-16T23:59:59.000Z"),
  completed_at: null,
  duration_ms: null,
  summary: null,
  error: null,
  created_at: new Date("2026-07-16T23:59:59.000Z"),
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ScheduleRunModel logical job ownership", () => {
  it("locks the parent schedule row with FOR UPDATE", async () => {
    const first = vi.fn().mockResolvedValue({ id: 7 });
    const forUpdate = vi.fn(() => ({ first }));
    const where = vi.fn(() => ({ forUpdate }));
    const testSurface = ScheduleModel as unknown as {
      table: (trx?: unknown) => unknown;
    };
    vi.spyOn(testSurface, "table").mockReturnValue({ where });

    await expect(
      ScheduleModel.findByIdForUpdate(7, {} as never)
    ).resolves.toEqual({ id: 7 });

    expect(where).toHaveBeenCalledWith({ id: 7 });
    expect(forUpdate).toHaveBeenCalledOnce();
  });

  it("serializes two different logical jobs so only one acquires the schedule", async () => {
    let transactionTail = Promise.resolve();
    vi.spyOn(ScheduleModel, "transaction").mockImplementation(
      async (callback) => {
        const previous = transactionTail;
        let release = () => {};
        transactionTail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        try {
          return await callback({} as never);
        } finally {
          release();
        }
      },
    );
    vi.spyOn(ScheduleModel, "findByIdForUpdate").mockResolvedValue({
      id: 7,
    } as never);

    let activeRun: IScheduleRun | undefined;
    vi.spyOn(ScheduleRunModel, "findRunByLogicalKey").mockImplementation(
      async (_scheduleId, logicalRunKey) =>
        activeRun?.logical_run_key === logicalRunKey ? activeRun : undefined,
    );
    vi.spyOn(ScheduleRunModel, "hasActiveRun").mockImplementation(
      async () => activeRun?.status === "running",
    );
    vi.spyOn(
      ScheduleRunModel,
      "createOrFindRunForLogicalJob",
    ).mockImplementation(async (scheduleId, logicalRunKey) => {
      activeRun = {
        ...RUN,
        schedule_id: scheduleId,
        logical_run_key: logicalRunKey,
      };
      return activeRun;
    });

    const [firstRun, secondRun] = await Promise.all([
      ScheduleRunModel.acquireRunForLogicalJob(7, "window-a"),
      ScheduleRunModel.acquireRunForLogicalJob(7, "window-b"),
    ]);

    expect([firstRun, secondRun].filter(Boolean)).toHaveLength(1);
    expect(firstRun?.logical_run_key).toBe("window-a");
    expect(secondRun).toBeUndefined();
  });

  it("inserts against the composite logical-run conflict target", async () => {
    const returning = vi.fn().mockResolvedValue([RUN]);
    const ignore = vi.fn(() => ({ returning }));
    const onConflict = vi.fn(() => ({ ignore }));
    const insert = vi.fn(() => ({ onConflict }));
    vi.spyOn(ScheduleRunModel, "table").mockReturnValue({
      insert,
    } as never);

    const result = await ScheduleRunModel.createOrFindRunForLogicalJob(
      7,
      RUN.logical_run_key!
    );

    expect(onConflict).toHaveBeenCalledWith([
      "schedule_id",
      "logical_run_key",
    ]);
    expect(ignore).toHaveBeenCalledOnce();
    expect(result).toBe(RUN);
  });

  it("finds the committed row after a uniqueness conflict", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const ignore = vi.fn(() => ({ returning }));
    const onConflict = vi.fn(() => ({ ignore }));
    const insert = vi.fn(() => ({ onConflict }));
    vi.spyOn(ScheduleRunModel, "table").mockReturnValue({
      insert,
    } as never);
    const find = vi
      .spyOn(ScheduleRunModel, "findRunByLogicalKey")
      .mockResolvedValue(RUN);

    const result = await ScheduleRunModel.createOrFindRunForLogicalJob(
      7,
      RUN.logical_run_key!
    );

    expect(find).toHaveBeenCalledWith(7, RUN.logical_run_key, undefined);
    expect(result).toBe(RUN);
  });

  it("finds ownership only by schedule and logical key together", async () => {
    const first = vi.fn().mockResolvedValue(RUN);
    const where = vi.fn(() => ({ first }));
    vi.spyOn(ScheduleRunModel, "table").mockReturnValue({
      where,
    } as never);

    await expect(
      ScheduleRunModel.findRunByLogicalKey(7, RUN.logical_run_key!)
    ).resolves.toBe(RUN);

    expect(where).toHaveBeenCalledWith({
      schedule_id: 7,
      logical_run_key: RUN.logical_run_key,
    });
  });
});
