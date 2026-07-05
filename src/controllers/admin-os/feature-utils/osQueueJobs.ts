/**
 * OS queue enqueue helpers — the one place that knows job names, payloads and
 * the §21.1 idempotency convention (jobId = os-<queue>:{documentId}, master
 * spec D10). Services call these; they never touch BullMQ directly.
 *
 * removeOnComplete keeps the jobId slot reusable: BullMQ ignores an add()
 * whose jobId still exists, so a retained completed job would silently
 * suppress the next re-ingest of the same document. While a job is pending or
 * running, the same jobId still dedupes — exactly the idempotency we want.
 * Failed jobs are retained for inspection (§21.2 dead-letter path).
 */

import { getOsQueue } from "../../../workers/queues";

/** D10: bounded retries with exponential backoff on every OS job. */
export const OS_JOB_ATTEMPTS = 3;
export const OS_JOB_BACKOFF_MS = 30_000;

const OS_JOB_OPTIONS = {
  attempts: OS_JOB_ATTEMPTS,
  backoff: { type: "exponential", delay: OS_JOB_BACKOFF_MS },
  removeOnComplete: true,
} as const;

/** Queue the chunk→embed→AI-metadata pipeline (stubbed until P4). */
export async function enqueueOsIngest(documentId: string): Promise<void> {
  await getOsQueue("ingest").add(
    "os-ingest",
    { documentId },
    { ...OS_JOB_OPTIONS, jobId: `os-ingest:${documentId}` }
  );
}

/** Queue the hard-delete purge for a trashed document. */
export async function enqueueOsPurge(documentId: string): Promise<void> {
  await getOsQueue("purge").add(
    "os-purge",
    { documentId },
    { ...OS_JOB_OPTIONS, jobId: `os-purge:${documentId}` }
  );
}
