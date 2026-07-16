import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";

/**
 * Scheduler failure contract (Dave review #166 round 3 item 2 — §21.2, §21.4).
 *
 * The defect: `scheduleExec.processor.ts` marked the run failed, advanced
 * `next_run_at`, and swallowed the error. BullMQ therefore saw the job RESOLVE
 * — so bounded retry/backoff never engaged, the failure never reached the
 * failed set for inspection, and the schedule silently jumped to its next
 * window. A 14-day agent could fail every cycle and read as healthy.
 *
 * These tests drive the REAL `processScheduleExec` and assert on the actual
 * promise it returns. Only its collaborators (models, registry, logger) are
 * mocked — the catch block under test is genuinely executed. The rejection
 * assertions fail if the `throw` is removed; the `next_run_at` assertions fail
 * if terminal handling is removed. Both were verified by reverting the fix.
 */

// vi.hoisted: vi.mock factories are hoisted above const initializers, so the
// doubles must be created in the hoisted scope or the factory reads a TDZ.
const {
  findById,
  updateById,
  hasActiveRun,
  createRun,
  completeRun,
  failRun,
  getAgentHandler,
  errorLog,
  infoLog,
  warnLog,
} = vi.hoisted(() => ({
  findById: vi.fn(),
  updateById: vi.fn(),
  hasActiveRun: vi.fn(),
  createRun: vi.fn(),
  completeRun: vi.fn(),
  failRun: vi.fn(),
  getAgentHandler: vi.fn(),
  errorLog: vi.fn(),
  infoLog: vi.fn(),
  warnLog: vi.fn(),
}));

vi.mock("../models/ScheduleModel", () => ({
  ScheduleModel: {
    findById: (...a: unknown[]) => findById(...a),
    updateById: (...a: unknown[]) => updateById(...a),
  },
  ScheduleRunModel: {
    hasActiveRun: (...a: unknown[]) => hasActiveRun(...a),
    createRun: (...a: unknown[]) => createRun(...a),
    completeRun: (...a: unknown[]) => completeRun(...a),
    failRun: (...a: unknown[]) => failRun(...a),
  },
}));

vi.mock("../services/agentRegistry", () => ({
  getAgentHandler: (...a: unknown[]) => getAgentHandler(...a),
}));

vi.mock("../lib/logger", () => ({
  default: { error: errorLog, info: infoLog, warn: warnLog },
}));

import { processScheduleExec } from "../workers/processors/scheduleExec.processor";

const SCHEDULE = {
  id: 7,
  agent_key: "nap_consistency",
  display_name: "Citations & NAP Consistency Monitor",
  schedule_type: "interval_days",
  interval_days: 14,
  timezone: "UTC",
  enabled: true,
  next_run_at: new Date("2026-07-15T00:00:00Z"),
};

/** A BullMQ job double carrying only what the processor reads. */
function makeJob(attemptsMade: number, attempts?: number): Job<{ scheduleId: number }> {
  return {
    name: "run-schedule",
    id: "sched-7-1752537600000",
    data: { scheduleId: 7 },
    attemptsMade,
    opts: attempts === undefined ? {} : { attempts },
  } as unknown as Job<{ scheduleId: number }>;
}

beforeEach(() => {
  vi.clearAllMocks();
  findById.mockResolvedValue({ ...SCHEDULE });
  hasActiveRun.mockResolvedValue(false);
  createRun.mockResolvedValue({ id: 99 });
  getAgentHandler.mockReturnValue({
    displayName: "Citations & NAP Consistency Monitor",
    handler: vi.fn(),
  });
});

describe("processScheduleExec — a failing agent must not resolve (§21.2/§3.2)", () => {
  it("REJECTS when the agent throws, so BullMQ's retry machinery engages", async () => {
    const boom = new Error("NAP consistency run failed to persist 2 of 3 observation writes");
    getAgentHandler.mockReturnValue({ displayName: "x", handler: vi.fn().mockRejectedValue(boom) });

    // The whole defect in one assertion: this used to RESOLVE.
    await expect(processScheduleExec(makeJob(0, 3))).rejects.toThrow(boom);
  });

  it("propagates the original error object — not a re-wrapped or flattened one", async () => {
    class NapPersistenceError extends Error {
      readonly code = "NAP_PERSISTENCE_FAILED";
      constructor(msg: string, readonly failedLocationIds: number[]) {
        super(msg);
        this.name = "NapPersistenceError";
      }
    }
    const original = new NapPersistenceError("could not persist", [4, 9]);
    getAgentHandler.mockReturnValue({ displayName: "x", handler: vi.fn().mockRejectedValue(original) });

    // The failed set must carry the real diagnosis (which locations, what code),
    // not "Error: failed".
    await expect(processScheduleExec(makeJob(0, 3))).rejects.toBe(original);
  });

  it("still marks THIS attempt's run row failed before rethrowing", async () => {
    getAgentHandler.mockReturnValue({
      displayName: "x",
      handler: vi.fn().mockRejectedValue(new Error("db down")),
    });

    await expect(processScheduleExec(makeJob(0, 3))).rejects.toThrow("db down");

    // Rethrowing must not have cost us the honest run record.
    expect(failRun).toHaveBeenCalledWith(99, "db down");
  });
});

describe("processScheduleExec — next_run_at advances only on a terminal attempt", () => {
  it("does NOT advance while retries remain — the retry is the retry", async () => {
    getAgentHandler.mockReturnValue({
      displayName: "x",
      handler: vi.fn().mockRejectedValue(new Error("transient")),
    });

    // attempt 1 of 3.
    await expect(processScheduleExec(makeJob(0, 3))).rejects.toThrow("transient");

    // Advancing here would move the schedule's window out from under a retry
    // that has not happened yet, and would report last_run_at for a run still
    // in flight.
    expect(updateById).not.toHaveBeenCalled();
  });

  it("does NOT advance on a middle attempt either", async () => {
    getAgentHandler.mockReturnValue({
      displayName: "x",
      handler: vi.fn().mockRejectedValue(new Error("transient")),
    });

    // attempt 2 of 3.
    await expect(processScheduleExec(makeJob(1, 3))).rejects.toThrow("transient");

    expect(updateById).not.toHaveBeenCalled();
  });

  it("DOES advance on the final attempt, so an always-failing schedule is not left wedged", async () => {
    getAgentHandler.mockReturnValue({
      displayName: "x",
      handler: vi.fn().mockRejectedValue(new Error("permanent")),
    });

    // attempt 3 of 3 — terminal.
    await expect(processScheduleExec(makeJob(2, 3))).rejects.toThrow("permanent");

    expect(updateById).toHaveBeenCalledOnce();
    const [id, patch] = updateById.mock.calls[0];
    expect(id).toBe(7);
    expect(patch.next_run_at).toBeInstanceOf(Date);
    // Why this matters: the tick's jobId is keyed on next_run_at. Left unadvanced,
    // the retained exhausted job would dedupe every re-enqueue and the schedule
    // would never run again.
    expect(patch.next_run_at.getTime()).toBeGreaterThan(Date.now());
  });

  it("rethrows on the terminal attempt too — the exhausted job must land in the failed set", async () => {
    getAgentHandler.mockReturnValue({
      displayName: "x",
      handler: vi.fn().mockRejectedValue(new Error("permanent")),
    });

    // Terminal + rethrow together are what routes it to the dead-letter path.
    await expect(processScheduleExec(makeJob(2, 3))).rejects.toThrow("permanent");
  });

  it("treats a job with no `attempts` option as already terminal (in-flight across a deploy)", async () => {
    getAgentHandler.mockReturnValue({
      displayName: "x",
      handler: vi.fn().mockRejectedValue(new Error("legacy job")),
    });

    // Jobs enqueued before retry options existed must not hang unadvanced forever.
    await expect(processScheduleExec(makeJob(0))).rejects.toThrow("legacy job");

    expect(updateById).toHaveBeenCalledOnce();
    expect(updateById.mock.calls[0][1].next_run_at).toBeInstanceOf(Date);
  });
});

describe("processScheduleExec — failure logging carries context (§21.4)", () => {
  it("logs job name, identifiers, attempt count and the error", async () => {
    getAgentHandler.mockReturnValue({
      displayName: "x",
      handler: vi.fn().mockRejectedValue(new Error("kaboom")),
    });

    await expect(processScheduleExec(makeJob(1, 3))).rejects.toThrow("kaboom");

    const ctx = errorLog.mock.calls.find((c) => c[0]?.attempt !== undefined)?.[0];
    expect(ctx).toMatchObject({
      err: "kaboom",
      jobName: "run-schedule",
      scheduleId: 7,
      runId: 99,
      agentKey: "nap_consistency",
      attempt: 2,
      maxAttempts: 3,
      terminal: false,
    });
  });

  it("emits a distinct DEAD-LETTERED line when retries are exhausted", async () => {
    getAgentHandler.mockReturnValue({
      displayName: "x",
      handler: vi.fn().mockRejectedValue(new Error("kaboom")),
    });

    await expect(processScheduleExec(makeJob(2, 3))).rejects.toThrow("kaboom");

    // An operator must be able to tell "retrying" from "gave up".
    const deadLetter = errorLog.mock.calls.find((c) => String(c[1]).includes("DEAD-LETTERED"));
    expect(deadLetter).toBeDefined();
    expect(deadLetter![0]).toMatchObject({ scheduleId: 7, agentKey: "nap_consistency", attempts: 3 });
  });
});

describe("processScheduleExec — the success path is untouched", () => {
  it("completes the run, advances next_run_at, and resolves", async () => {
    const summary = { targets: 2, locationsRecorded: 2 };
    getAgentHandler.mockReturnValue({
      displayName: "x",
      handler: vi.fn().mockResolvedValue({ summary }),
    });

    await expect(processScheduleExec(makeJob(0, 3))).resolves.toBeUndefined();

    expect(completeRun).toHaveBeenCalledWith(99, summary);
    expect(failRun).not.toHaveBeenCalled();
    expect(updateById).toHaveBeenCalledOnce();
    expect(updateById.mock.calls[0][1].next_run_at).toBeInstanceOf(Date);
  });

  it("still no-ops (resolves) when the schedule is missing or already running", async () => {
    findById.mockResolvedValue(undefined);
    await expect(processScheduleExec(makeJob(0, 3))).resolves.toBeUndefined();
    expect(createRun).not.toHaveBeenCalled();

    vi.clearAllMocks();
    findById.mockResolvedValue({ ...SCHEDULE });
    hasActiveRun.mockResolvedValue(true);
    await expect(processScheduleExec(makeJob(0, 3))).resolves.toBeUndefined();
    expect(createRun).not.toHaveBeenCalled();
  });
});
