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
 */

import { Job, Queue } from "bullmq";
import { OwnerDigestService } from "../../services/owner-digest/OwnerDigestService";
import {
  OWNER_WEEKLY_DIGEST_CRON,
  OWNER_WEEKLY_DIGEST_TZ,
  OWNER_WEEKLY_DIGEST_JOB_ID,
} from "../../config/ownerWeeklyDigest";
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

/**
 * Register the weekly repeatable schedule on the given queue. Lives here rather
 * than inline in worker.ts to keep that orchestration file under the §2.4 size
 * ceiling. Registering the schedule emails no owner on its own — the send is
 * gated by OWNER_WEEKLY_DIGEST_ENABLED inside the service.
 */
export async function registerOwnerWeeklyDigestSchedule(
  queue: Queue
): Promise<void> {
  try {
    await queue.add(
      OWNER_WEEKLY_DIGEST_JOB_ID,
      {},
      {
        repeat: {
          pattern: OWNER_WEEKLY_DIGEST_CRON,
          tz: OWNER_WEEKLY_DIGEST_TZ,
        },
        jobId: OWNER_WEEKLY_DIGEST_JOB_ID,
        attempts: 2,
        backoff: { type: "exponential", delay: 60000 },
      }
    );
    logger.info(
      "[MINDS-WORKER] Weekly owner digest job scheduled (Mondays 13:00 UTC; send gated by OWNER_WEEKLY_DIGEST_ENABLED)"
    );
  } catch (err) {
    logger.error(
      { err },
      "[MINDS-WORKER] Failed to set up owner weekly digest schedule:"
    );
  }
}
