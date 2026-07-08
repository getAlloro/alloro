/**
 * Regression guard for the OS enqueue helpers' jobId format.
 *
 * BullMQ (5.70) rejects a custom jobId that contains a single ":" —
 * Job.validateOptions throws "Custom Id cannot contain :" unless the id splits
 * into exactly 3 colon-parts (the legacy repeatable-job form). The original OS
 * dedup convention used "os-ingest:{uuid}" (one colon) which threw at
 * enqueue time AFTER the document row committed, silently breaking the whole
 * ingest/convert/purge pipeline. The unit suites mock getOsQueue, so the throw
 * never surfaced there — it only appeared when run against a real queue.
 *
 * This test asserts the produced jobId satisfies BullMQ's rule directly (no
 * Redis needed), so a future edit that reintroduces a bare colon fails in the
 * standard `npm test` gate.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const queueAdd = vi.fn();
vi.mock("../workers/queues", () => ({
  getOsQueue: vi.fn(() => ({ add: queueAdd })),
}));

import {
  enqueueOsIngest,
  enqueueOsConvert,
  enqueueOsPurge,
} from "../controllers/admin-os/feature-utils/osQueueJobs";

/** BullMQ's own constraint: a ":" is only allowed in a 3-part id. */
function isBullMqValidJobId(jobId: string): boolean {
  if (!jobId.includes(":")) return true;
  return jobId.split(":").length === 3;
}

const DOC_ID = "c3a98541-05b1-414c-ba96-cf9588742abe";
const IMPORT_ID = "d4b09652-16c2-525d-a9ce-df6699853bcf";

function lastJobId(): string {
  const calls = queueAdd.mock.calls;
  const opts = calls[calls.length - 1]?.[2] as { jobId?: string } | undefined;
  return opts?.jobId ?? "";
}

describe("OS enqueue helpers produce BullMQ-valid jobIds", () => {
  beforeEach(() => queueAdd.mockClear());

  it("enqueueOsIngest jobId has no bare colon", async () => {
    await enqueueOsIngest(DOC_ID);
    const jobId = lastJobId();
    expect(jobId).toBe(`os-ingest-${DOC_ID}`);
    expect(jobId).not.toContain(":");
    expect(isBullMqValidJobId(jobId)).toBe(true);
  });

  it("enqueueOsConvert jobId has no bare colon", async () => {
    await enqueueOsConvert(DOC_ID, IMPORT_ID);
    const jobId = lastJobId();
    expect(jobId).toBe(`os-convert-${IMPORT_ID}`);
    expect(isBullMqValidJobId(jobId)).toBe(true);
  });

  it("enqueueOsPurge jobId has no bare colon", async () => {
    await enqueueOsPurge(DOC_ID);
    const jobId = lastJobId();
    expect(jobId).toBe(`os-purge-${DOC_ID}`);
    expect(isBullMqValidJobId(jobId)).toBe(true);
  });
});
