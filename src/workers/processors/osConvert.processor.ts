/**
 * OS Convert — P1 stub (plans/07042026-alloro-os-admin-port).
 * The real file-import conversion (docx/xlsx/pdf/md → markdown) lands in P6.
 * Until then this logs with context (§21.4) and completes, so any enqueued
 * job drains safely. Idempotency convention (§21.1):
 * jobId = os-convert:{importId}.
 */

import { Job } from "bullmq";
import logger from "../../lib/logger";

export interface OsConvertJobData {
  importId?: string;
  documentId?: string;
}

export async function processOsConvert(job: Job<OsConvertJobData>): Promise<void> {
  logger.info(
    { jobId: job.id, importId: job.data?.importId, documentId: job.data?.documentId },
    "[OS-WORKER] os-convert stub — real conversion lands in P6; completing"
  );
}
