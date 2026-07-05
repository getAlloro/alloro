/**
 * OS Lock Reaper (plans/07042026-alloro-os-admin-port, D8).
 *
 * Deletes expired os.document_locks rows so documents abandoned mid-edit
 * (closed tab, dead heartbeat) become editable again. Runs as a repeatable
 * BullMQ job every 60s (worker.ts).
 *
 * Idempotent by predicate (§21.1): only rows with expires_at < now are
 * deleted, so re-runs, overlapping ticks, and manual triggers are all safe.
 * DB access stays behind the model seam (§7.4, §21.3).
 */

import { Job } from "bullmq";
import { OsDocumentLockModel } from "../../models/OsDocumentLockModel";
import logger from "../../lib/logger";

export async function processOsLockReaper(job: Job): Promise<void> {
  try {
    const reaped = await OsDocumentLockModel.deleteExpired(new Date());
    if (reaped > 0) {
      logger.info(
        { jobId: job.id, reaped },
        "[OS-WORKER] Reaped expired document lock(s)"
      );
    }
  } catch (err) {
    // §21.4 — full context, then rethrow so BullMQ retry/backoff applies
    logger.error(
      { jobId: job.id, attemptsMade: job.attemptsMade, err: (err as Error)?.message },
      "[OS-WORKER] Lock reaper tick failed:"
    );
    throw err;
  }
}
