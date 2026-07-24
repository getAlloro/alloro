/**
 * Owner Weekly Digest processor.
 *
 * Runs the weekly "here is what Alloro did for you" batch. A worker only
 * orchestrates and calls the service (§21.3) — all composition, honesty rules,
 * recipient resolution, and the send kill-switch live in OwnerDigestService.
 *
 * Idempotency/retry (§21.1/§21.2): the service isolates per-org failures and
 * only the pre-send eligibility lookup can throw, so an ERROR-driven bounded
 * retry re-runs before anything was sent. (It does not dedupe a hard process
 * crash mid-batch — see OwnerDigestService.runWeeklyDigest for that caveat; the
 * feature ships flag-gated off, so this is not a live risk.) A thrown error here
 * is a genuine batch-level failure and is surfaced (re-thrown) so BullMQ retries
 * and, once exhausted, keeps the failed job for inspection.
 *
 * The repeatable schedule that feeds this queue lives with the other twelve in
 * `workers/schedules.ts` (§2.1 — registering a schedule and consuming its jobs
 * are two responsibilities).
 */

import { Job } from "bullmq";
import { OwnerDigestService } from "../../services/owner-digest/OwnerDigestService";
import logger from "../../lib/logger";

export async function processOwnerWeeklyDigest(job: Job): Promise<void> {
  logger.info(
    { jobId: job.id, jobName: job.name },
    "[OWNER-DIGEST] Starting weekly owner digest run..."
  );
  try {
    const result = await OwnerDigestService.runWeeklyDigest();
    logger.info(
      { jobId: job.id, ...result },
      "[OWNER-DIGEST] Weekly owner digest run complete"
    );
  } catch (err) {
    logger.error(
      {
        err,
        jobId: job.id,
        jobName: job.name,
        attemptsMade: job.attemptsMade,
      },
      "[OWNER-DIGEST] Weekly owner digest run failed"
    );
    throw err;
  }
}
