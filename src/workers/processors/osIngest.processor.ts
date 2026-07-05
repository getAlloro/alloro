/**
 * OS Ingest processor (plans/07042026-alloro-os-admin-port, P4 T3). The real
 * chunk → embed → AI-metadata → link-suggest → tsv → status pipeline lives in
 * OsIngestService; this worker only orchestrates and delegates (§21.3):
 *
 *   - success  → OsIngestService.run flips the document to `indexed`.
 *   - failure  → rethrow so BullMQ retries with backoff (attempts:3, §21.2,
 *     configured on enqueue in feature-utils/osQueueJobs.ts). Only on the FINAL
 *     attempt do we mark the document `processing_failed` so the UI shows the
 *     Reindex path — earlier attempts leave it `processing` so a later retry can
 *     still recover it. Marking-failed itself is best-effort: if it throws we
 *     still rethrow the original error so the job lands in the dead-letter set.
 *
 * Idempotency (§21.1): jobId = os-ingest:{documentId}; run() is a full reindex
 * of the live version, so a repeat run converges on current state. Every failure
 * logs the job name, documentId, and attempt count through Pino (§21.4).
 */

import { Job } from "bullmq";
import logger from "../../lib/logger";
import { OsIngestService } from "../../controllers/admin-os/feature-services/OsIngestService";

export interface OsIngestJobData {
  documentId?: string;
}

export async function processOsIngest(job: Job<OsIngestJobData>): Promise<void> {
  const documentId = job.data?.documentId;
  if (!documentId) {
    logger.warn(
      { jobId: job.id },
      "[OS-WORKER] os-ingest job without a documentId — nothing to index"
    );
    return;
  }

  try {
    await OsIngestService.run(documentId);
    logger.info(
      { jobId: job.id, documentId },
      "[OS-WORKER] os-ingest completed"
    );
  } catch (error) {
    // attemptsMade is the count of attempts already finished (0 on the first
    // run); job.opts.attempts is the configured ceiling. The final attempt is
    // the one where attemptsMade + 1 === attempts.
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 1;
    const isFinalAttempt = attempt >= maxAttempts;
    logger.error(
      { err: error, jobId: job.id, documentId, attempt, maxAttempts, isFinalAttempt },
      "[OS-WORKER] os-ingest failed"
    );
    if (isFinalAttempt) {
      // Best-effort: never let the status write mask the real ingest error.
      await OsIngestService.markFailed(documentId).catch((markError) =>
        logger.error(
          { err: markError, jobId: job.id, documentId },
          "[OS-WORKER] os-ingest: failed to mark processing_failed on final attempt"
        )
      );
    }
    throw error; // let BullMQ retry with backoff / retain for inspection (§21.2)
  }
}
