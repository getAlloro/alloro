/**
 * OS Convert processor (plans/07042026-alloro-os-admin-port, P6 T3). The real
 * file-import conversion (docx/xlsx/pdf/md → markdown v1) lives in
 * OsConversionService; this worker only orchestrates and delegates (§21.3):
 *
 *   - success  → run() writes v1, marks the import `converted`, and enqueues
 *     os-ingest (the chunk/embed/AI-metadata pipeline).
 *   - failure  → rethrow so BullMQ retries with backoff (attempts:3, §21.2,
 *     configured on enqueue in feature-utils/osQueueJobs.ts). Only on the FINAL
 *     attempt do we flip the document to `processing_failed` and the import to
 *     `failed`, so an earlier retry can still recover it. Marking-failed is
 *     best-effort: if it throws we still rethrow the original error so the job
 *     lands in the dead-letter set.
 *
 * Idempotency (§21.1): jobId = os-convert:{importId}; run() no-ops the v1 write
 * when current_version_id is already set, so a repeat run converges. Every
 * failure logs the job name, importId, documentId, and attempt count (§21.4).
 */

import { Job } from "bullmq";
import logger from "../../lib/logger";
import { OsConversionService } from "../../controllers/admin-os/feature-services/OsConversionService";

export interface OsConvertJobData {
  importId?: string;
  documentId?: string;
}

export async function processOsConvert(job: Job<OsConvertJobData>): Promise<void> {
  const importId = job.data?.importId;
  const documentId = job.data?.documentId;
  if (!importId) {
    logger.warn(
      { jobId: job.id, documentId },
      "[OS-WORKER] os-convert job without an importId — nothing to convert"
    );
    return;
  }

  try {
    await OsConversionService.run(importId);
    logger.info(
      { jobId: job.id, importId, documentId },
      "[OS-WORKER] os-convert completed"
    );
  } catch (error) {
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 1;
    const isFinalAttempt = attempt >= maxAttempts;
    logger.error(
      { err: error, jobId: job.id, importId, documentId, attempt, maxAttempts, isFinalAttempt },
      "[OS-WORKER] os-convert failed"
    );
    if (isFinalAttempt) {
      await OsConversionService.markFailed(importId).catch((markError) =>
        logger.error(
          { err: markError, jobId: job.id, importId, documentId },
          "[OS-WORKER] os-convert: failed to mark failed on final attempt"
        )
      );
    }
    throw error; // let BullMQ retry with backoff / retain for inspection (§21.2)
  }
}
