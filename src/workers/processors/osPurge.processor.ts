/**
 * OS Purge — hard-deletes a trashed document (plans/07042026-alloro-os-admin-port,
 * P2). The job calls the same feature-service the request path uses (§21.3):
 * OsTrashService.purgeDocument deletes the os.documents row and the CASCADE
 * wipes versions, drafts, ai_index, chunks, links, locks, comments, imports
 * and asset rows. S3 object deletion joins in P6 when assets exist.
 *
 * P4 note: os.document_chunks and os.document_links both declare
 * `.references("id").inTable("os.documents").onDelete("CASCADE")` in migration
 * 20260704000000, so deleting the os.documents row removes every chunk and both
 * link directions automatically (document_links FKs source AND target as CASCADE).
 * No explicit chunk/link delete is needed here — the FK cascade is authoritative.
 *
 * Idempotency (§21.1): jobId = os-purge:{documentId}; a repeat run finds the
 * row already gone and no-ops. Failures throw so BullMQ retries with backoff
 * and retains the exhausted job for inspection (§21.2).
 */

import { Job } from "bullmq";
import logger from "../../lib/logger";
import { OsTrashService } from "../../controllers/admin-os/feature-services/OsTrashService";

export interface OsPurgeJobData {
  documentId?: string;
}

export async function processOsPurge(job: Job<OsPurgeJobData>): Promise<void> {
  const documentId = job.data?.documentId;
  if (!documentId) {
    logger.warn(
      { jobId: job.id },
      "[OS-WORKER] os-purge job without a documentId — nothing to do"
    );
    return;
  }

  try {
    const result = await OsTrashService.purgeDocument(documentId);
    logger.info(
      { jobId: job.id, documentId, purged: result.purged, title: result.title },
      "[OS-WORKER] os-purge completed"
    );
  } catch (error) {
    logger.error(
      { err: error, jobId: job.id, documentId, attempt: job.attemptsMade + 1 },
      "[OS-WORKER] os-purge failed"
    );
    throw error; // let BullMQ retry with backoff (§21.2)
  }
}
