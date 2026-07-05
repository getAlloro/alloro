/**
 * OS queue enqueue helpers — the one place that knows job names, payloads and
 * the §21.1 idempotency convention (jobId = os-<queue>-{documentId}, master
 * spec D10). Services call these; they never touch BullMQ directly.
 *
 * Separator is "-" not ":": BullMQ (5.70) rejects a custom jobId with a single
 * colon — a colon is only valid in the legacy 3-part repeatable-job form
 * "name:id:timestamp", so Job.validateOptions throws "Custom Id cannot contain
 * :" on "os-ingest:<uuid>". Caught at runtime (a mocked queue hides it in unit
 * tests); without this the whole ingest/convert/purge path fails after commit.
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
    { ...OS_JOB_OPTIONS, jobId: `os-ingest-${documentId}` }
  );
}

/**
 * Queue the file-import conversion (docx/xlsx/pdf/md → markdown, P6). Idempotent
 * by IMPORT id (§21.1): one job per uploaded file, so a batch of N files yields
 * N convert jobs. Both documentId and importId ride the payload; the processor
 * keys on importId.
 */
export async function enqueueOsConvert(
  documentId: string,
  importId: string
): Promise<void> {
  await getOsQueue("convert").add(
    "os-convert",
    { documentId, importId },
    { ...OS_JOB_OPTIONS, jobId: `os-convert-${importId}` }
  );
}

/** Queue the hard-delete purge for a trashed document. */
export async function enqueueOsPurge(documentId: string): Promise<void> {
  await getOsQueue("purge").add(
    "os-purge",
    { documentId },
    { ...OS_JOB_OPTIONS, jobId: `os-purge-${documentId}` }
  );
}
