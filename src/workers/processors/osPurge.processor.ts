/**
 * OS Purge — P1 stub (plans/07042026-alloro-os-admin-port).
 * The real trash purge (hard-delete archived documents + S3 assets) lands in
 * P2. Until then this logs with context (§21.4) and completes, so any
 * enqueued job drains safely. Idempotency convention (§21.1):
 * jobId = os-purge:{documentId}.
 */

import { Job } from "bullmq";
import logger from "../../lib/logger";

export interface OsPurgeJobData {
  documentId?: string;
}

export async function processOsPurge(job: Job<OsPurgeJobData>): Promise<void> {
  logger.info(
    { jobId: job.id, documentId: job.data?.documentId },
    "[OS-WORKER] os-purge stub — real purge lands in P2; completing"
  );
}
