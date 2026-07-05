/**
 * OS Ingest — P1 stub (plans/07042026-alloro-os-admin-port).
 * The real chunk→embed→AI-metadata pipeline lands in P4. Until then this
 * logs with context (§21.4) and completes, so any enqueued job drains safely
 * instead of piling up. Idempotency convention (§21.1):
 * jobId = os-ingest:{documentId}.
 */

import { Job } from "bullmq";
import logger from "../../lib/logger";

export interface OsIngestJobData {
  documentId?: string;
}

export async function processOsIngest(job: Job<OsIngestJobData>): Promise<void> {
  logger.info(
    { jobId: job.id, documentId: job.data?.documentId },
    "[OS-WORKER] os-ingest stub — real pipeline lands in P4; completing"
  );
}
