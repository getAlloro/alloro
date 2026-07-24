/**
 * Synthetic unit coverage for the CRM sync-log retention prune.
 *
 * This job issues a scheduled DELETE against `website_builder.crm_sync_logs`.
 * The only thing standing between a correct retention window and silent loss of
 * live diagnostic data is the cutoff arithmetic and the comparison operator, so
 * both are pinned here. Every persistence, queue, and logging seam is mocked —
 * no database is touched (§20.4).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";

const queueAdd = vi.fn();

vi.mock("../workers/queues", () => ({
  getMindsQueue: vi.fn(() => ({ add: queueAdd })),
  getCrmQueue: vi.fn(() => ({ add: queueAdd })),
  getHarvestQueue: vi.fn(() => ({ add: queueAdd })),
  getGbpAutomationQueue: vi.fn(() => ({ add: queueAdd })),
  getOsQueue: vi.fn(() => ({ add: queueAdd })),
}));

vi.mock("../lib/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

/**
 * Records every builder call the model makes so the query's *shape* can be
 * asserted without a database: which column, which operator, which limit.
 */
interface RecordedWhere {
  column: string;
  operator: string;
  value: unknown;
}

const recordedWheres: RecordedWhere[] = [];
const recordedLimits: number[] = [];
const recordedTables: string[] = [];
let deleteResults: number[] = [];
let deleteCallCount = 0;

function makeBuilder(): Record<string, unknown> {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.whereIn = vi.fn(() => builder);
  builder.where = vi.fn((column: string, operator: string, value: unknown) => {
    recordedWheres.push({ column, operator, value });
    return builder;
  });
  builder.limit = vi.fn((n: number) => {
    recordedLimits.push(n);
    return builder;
  });
  builder.del = vi.fn(() => {
    const result = deleteResults[deleteCallCount] ?? 0;
    deleteCallCount += 1;
    return Promise.resolve(result);
  });
  return builder;
}

vi.mock("../database/connection", () => ({
  db: vi.fn((table: string) => {
    recordedTables.push(table);
    return makeBuilder();
  }),
}));

import {
  CRM_SYNC_LOG_PRUNE_BATCH_SIZE,
  CRM_SYNC_LOG_RETENTION_DAYS,
  crmSyncLogRetentionCutoff,
} from "../config/crmSyncLog";
import { CrmSyncLogModel } from "../models/website-builder/CrmSyncLogModel";
import { processCrmSyncLogPrune } from "../workers/processors/crmSyncLogPrune.processor";
import { setupCrmSyncLogPruneSchedule } from "../workers/schedules";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const fakeJob = {} as Job;

beforeEach(() => {
  recordedWheres.length = 0;
  recordedLimits.length = 0;
  recordedTables.length = 0;
  deleteResults = [];
  deleteCallCount = 0;
  queueAdd.mockReset();
  queueAdd.mockResolvedValue(undefined);
});

describe("crmSyncLogRetentionCutoff", () => {
  it("returns exactly now minus the retention window", () => {
    const now = new Date("2026-07-24T00:00:00.000Z");
    expect(crmSyncLogRetentionCutoff(now).toISOString()).toBe(
      "2026-04-25T00:00:00.000Z",
    );
  });

  it("derives the window from the named constant, not a literal", () => {
    const now = new Date("2026-07-24T13:07:41.123Z");
    const cutoff = crmSyncLogRetentionCutoff(now);
    expect(now.getTime() - cutoff.getTime()).toBe(
      CRM_SYNC_LOG_RETENTION_DAYS * MS_PER_DAY,
    );
  });

  it("is unaffected by DST because it is epoch-millisecond arithmetic", () => {
    // 2026-03-08 is a US DST transition; a calendar-based subtraction would
    // shift the boundary by an hour, epoch arithmetic does not.
    const now = new Date("2026-06-06T12:00:00.000Z");
    const cutoff = crmSyncLogRetentionCutoff(now);
    expect(cutoff.getUTCHours()).toBe(12);
    expect(cutoff.getUTCMinutes()).toBe(0);
  });
});

describe("CrmSyncLogModel.pruneOlderThan", () => {
  it("cannot delete a row inside the retention window", async () => {
    const cutoff = crmSyncLogRetentionCutoff(
      new Date("2026-07-24T00:00:00.000Z"),
    );
    deleteResults = [3];

    await CrmSyncLogModel.pruneOlderThan(cutoff);

    const attemptedAtPredicate = recordedWheres.find(
      (w) => w.column === "attempted_at",
    );
    expect(attemptedAtPredicate).toBeDefined();
    expect(attemptedAtPredicate?.value).toBe(cutoff);

    // Strictly less-than. `<=` would delete the boundary row, which is inside
    // the window. An operator change here must fail this suite.
    expect(attemptedAtPredicate?.operator).toBe("<");
    expect(attemptedAtPredicate?.operator).not.toBe("<=");

    // The predicate the database will apply, evaluated against synthetic rows
    // on and just inside the boundary.
    const matches = (attemptedAt: Date) => attemptedAt < cutoff;
    expect(matches(new Date(cutoff.getTime()))).toBe(false);
    expect(matches(new Date(cutoff.getTime() + 1))).toBe(false);
    expect(matches(new Date(cutoff.getTime() + MS_PER_DAY))).toBe(false);
    expect(matches(new Date(cutoff.getTime() - 1))).toBe(true);
  });

  it("deletes in bounded batches instead of one unbounded statement", async () => {
    deleteResults = [CRM_SYNC_LOG_PRUNE_BATCH_SIZE, 42];

    const total = await CrmSyncLogModel.pruneOlderThan(new Date());

    expect(total).toBe(CRM_SYNC_LOG_PRUNE_BATCH_SIZE + 42);
    expect(deleteCallCount).toBe(2);
    expect(recordedLimits.length).toBe(2);
    expect(recordedLimits.every((n) => n === CRM_SYNC_LOG_PRUNE_BATCH_SIZE)).toBe(
      true,
    );
  });

  it("stops after the first short batch", async () => {
    deleteResults = [5];

    const total = await CrmSyncLogModel.pruneOlderThan(new Date());

    expect(total).toBe(5);
    expect(deleteCallCount).toBe(1);
  });

  it("queries only the sync-log table", async () => {
    deleteResults = [0];
    await CrmSyncLogModel.pruneOlderThan(new Date());
    expect(new Set(recordedTables)).toEqual(
      new Set(["website_builder.crm_sync_logs"]),
    );
  });
});

describe("processCrmSyncLogPrune", () => {
  it("is repeat-safe: a second run in the same window deletes nothing and does not throw", async () => {
    const spy = vi
      .spyOn(CrmSyncLogModel, "pruneOlderThan")
      .mockResolvedValueOnce(1200)
      .mockResolvedValueOnce(0);

    await expect(processCrmSyncLogPrune(fakeJob)).resolves.toBeUndefined();
    await expect(processCrmSyncLogPrune(fakeJob)).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("passes a cutoff no newer than the retention window", async () => {
    const spy = vi
      .spyOn(CrmSyncLogModel, "pruneOlderThan")
      .mockResolvedValue(0);

    const before = Date.now();
    await processCrmSyncLogPrune(fakeJob);
    const after = Date.now();

    const cutoff = spy.mock.calls[0][0] as Date;
    expect(cutoff.getTime()).toBeLessThanOrEqual(
      before - CRM_SYNC_LOG_RETENTION_DAYS * MS_PER_DAY,
    );
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(
      after - CRM_SYNC_LOG_RETENTION_DAYS * MS_PER_DAY - 5000,
    );
    spy.mockRestore();
  });

  it("propagates a failure so BullMQ can retry it", async () => {
    const spy = vi
      .spyOn(CrmSyncLogModel, "pruneOlderThan")
      .mockRejectedValue(new Error("connection terminated"));

    await expect(processCrmSyncLogPrune(fakeJob)).rejects.toThrow(
      "connection terminated",
    );
    spy.mockRestore();
  });
});

describe("setupCrmSyncLogPruneSchedule", () => {
  it("registers bounded retries with exponential backoff (§21.2)", async () => {
    await setupCrmSyncLogPruneSchedule();

    expect(queueAdd).toHaveBeenCalledTimes(1);
    const options = queueAdd.mock.calls[0][2] as Record<string, unknown>;

    // Without these a failed prune is dropped after one attempt and the table
    // keeps growing with nothing to surface it.
    expect(options.attempts).toBe(3);
    expect(options.backoff).toEqual({ type: "exponential", delay: 60000 });
  });

  it("keys the repeatable job so re-running on boot is idempotent", async () => {
    await setupCrmSyncLogPruneSchedule();

    const [name, payload, options] = queueAdd.mock.calls[0] as [
      string,
      unknown,
      Record<string, unknown>,
    ];
    expect(name).toBe("daily-sync-log-prune");
    expect(payload).toEqual({});
    expect(options.jobId).toBe("daily-sync-log-prune");
    expect(options.repeat).toEqual({ pattern: "15 3 * * *", tz: "UTC" });
  });
});
