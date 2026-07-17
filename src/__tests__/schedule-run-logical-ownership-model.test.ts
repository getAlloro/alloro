import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IScheduleRun,
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
