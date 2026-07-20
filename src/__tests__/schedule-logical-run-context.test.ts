import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";

const {
  findDueSchedules,
  hasActiveRun,
  add,
  recordSchedulerTick,
  infoLog,
  executeNapConsistencyAgent,
} = vi.hoisted(() => ({
  findDueSchedules: vi.fn(),
  hasActiveRun: vi.fn(),
  add: vi.fn(),
  recordSchedulerTick: vi.fn(),
  infoLog: vi.fn(),
  executeNapConsistencyAgent: vi.fn(),
}));

vi.mock("../models/ScheduleModel", () => ({
  ScheduleModel: {
    findDueSchedules: (...args: unknown[]) => findDueSchedules(...args),
  },
  ScheduleRunModel: {
    hasActiveRun: (...args: unknown[]) => hasActiveRun(...args),
  },
}));

vi.mock("../workers/queues", () => ({
  getMindsQueue: () => ({ add }),
}));

vi.mock("../workers/workerHealth", () => ({
  recordSchedulerTick: (...args: unknown[]) => recordSchedulerTick(...args),
}));

vi.mock("../lib/logger", () => ({
  default: { info: infoLog },
}));

vi.mock("../services/nap-consistency/executor", () => ({
  executeNapConsistencyAgent: (...args: unknown[]) =>
    executeNapConsistencyAgent(...args),
}));

import { getAgentHandler } from "../services/agentRegistry";
import { processSchedulerTick } from "../workers/processors/scheduler.processor";

describe("processSchedulerTick — stable logical run context (§21.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasActiveRun.mockResolvedValue(false);
    add.mockResolvedValue(undefined);
    executeNapConsistencyAgent.mockResolvedValue({ summary: { targets: 1 } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists the due UTC window/date in job data even when dispatch happens after midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T00:00:00.500Z"));
    const logicalWindow = new Date("2026-07-16T23:59:59.000Z");
    findDueSchedules.mockResolvedValue([
      {
        id: 7,
        agent_key: "nap_consistency",
        next_run_at: logicalWindow,
      },
    ]);

    await processSchedulerTick({} as Job);

    expect(add).toHaveBeenCalledWith(
      "run-schedule",
      {
        scheduleId: 7,
        logicalRunAt: "2026-07-16T23:59:59.000Z",
        logicalRunDate: "2026-07-16",
      },
      expect.objectContaining({
        jobId: `sched-7-${logicalWindow.getTime()}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 60000 },
      })
    );
  });

  it("passes the persisted logical date/window into the NAP executor", async () => {
    const handler = getAgentHandler("nap_consistency");

    await handler?.handler({
      logicalRunAt: "2026-07-16T23:59:59.000Z",
      logicalRunDate: "2026-07-16",
    });

    expect(executeNapConsistencyAgent).toHaveBeenCalledWith({
      runDate: "2026-07-16",
      observedAt: new Date("2026-07-16T23:59:59.000Z"),
    });
  });
});
