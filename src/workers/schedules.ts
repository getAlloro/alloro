/**
 * Repeatable-job registration for the Minds worker process.
 *
 * Each `setup*Schedule()` adds a single BullMQ repeatable job (a cron-style
 * recurring entry keyed by a stable `jobId`, so re-running on boot is
 * idempotent). This is a distinct responsibility from instantiating the
 * Workers that consume those queues — the Workers, their event wiring, and
 * shutdown live in `worker.ts`; the recurring schedules live here.
 *
 * Extracted from `worker.ts` when adding the CRM sync-log prune schedule pushed
 * that file past the ~800-line hard ceiling (§2.4); this is the split the
 * Article prescribes, not a drive-by refactor.
 */

import {
  getMindsQueue,
  getCrmQueue,
  getHarvestQueue,
  getGbpAutomationQueue,
  getOsQueue,
} from "./queues";
import logger from "../lib/logger";

// Set up repeatable discovery job (every 24 hours)
export async function setupDiscoverySchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("discovery");
    await queue.add(
      "daily-discovery",
      {},
      {
        repeat: {
          pattern: "0 6 * * *", // 6 AM UTC daily
          tz: "UTC",
        },
        jobId: "daily-discovery",
      }
    );
    logger.info("[MINDS-WORKER] Daily discovery job scheduled (6 AM UTC)");
  } catch (err: any) {
    logger.error({ err: err }, "[MINDS-WORKER] Failed to set up discovery schedule:");
  }
}

// Set up skill trigger schedule (every 5 minutes) + dead letter check (every 10 minutes)
export async function setupSkillTriggerSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("skill-triggers");
    await queue.add(
      "skill-trigger-check",
      {},
      {
        repeat: {
          pattern: "*/5 * * * *", // Every 5 minutes
          tz: "UTC",
        },
        jobId: "skill-trigger-check",
      }
    );
    await queue.add(
      "dead-letter-check",
      {},
      {
        repeat: {
          pattern: "*/10 * * * *", // Every 10 minutes
          tz: "UTC",
        },
        jobId: "dead-letter-check",
      }
    );
    logger.info("[MINDS-WORKER] Skill trigger + dead letter check scheduled");
  } catch (err: any) {
    logger.error({ err: err }, "[MINDS-WORKER] Failed to set up skill trigger schedule:");
  }
}

// Set up works digest schedule (weekly — 3 AM UTC Sundays)
export async function setupWorksDigestSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("works-digest");
    await queue.add(
      "weekly-works-digest",
      {},
      {
        repeat: {
          pattern: "0 3 * * 0", // 3 AM UTC every Sunday
          tz: "UTC",
        },
        jobId: "weekly-works-digest",
      }
    );
    logger.info("[MINDS-WORKER] Weekly works digest job scheduled (3 AM UTC Sundays)");
  } catch (err: any) {
    logger.error({ err: err }, "[MINDS-WORKER] Failed to set up works digest schedule:");
  }
}

// Set up review sync schedule (daily — 4 AM UTC)
export async function setupReviewSyncSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("review-sync");
    await queue.add(
      "daily-review-sync",
      { syncSource: "auto" },
      {
        repeat: {
          pattern: "0 4 * * *", // 4 AM UTC daily
          tz: "UTC",
        },
        jobId: "daily-review-sync",
      }
    );
    logger.info("[MINDS-WORKER] Daily review sync job scheduled (4 AM UTC)");
  } catch (err: any) {
    logger.error({ err: err }, "[MINDS-WORKER] Failed to set up review sync schedule:");
  }
}

// Set up GBP published local posts sync schedule (daily — 4:45 AM UTC)
export async function setupGbpLocalPostSyncSchedule(): Promise<void> {
  try {
    const queue = getGbpAutomationQueue("deployment");
    await queue.add(
      "sync-local-posts",
      { syncSource: "auto" },
      {
        repeat: {
          pattern: "45 4 * * *", // 4:45 AM UTC daily
          tz: "UTC",
        },
        jobId: "daily-local-post-sync",
      }
    );
    logger.info("[MINDS-WORKER] Daily GBP local post sync scheduled (4:45 AM UTC)");
  } catch (err: any) {
    logger.error({ err: err }, "[MINDS-WORKER] Failed to set up GBP local post sync schedule:");
  }
}

// Set up location cancellation finalizer (hourly, on the hour)
export async function setupLocationCancellationFinalizer(): Promise<void> {
  try {
    const queue = getMindsQueue("location-cancellation");
    await queue.add(
      "location-cancellation-finalizer",
      {},
      {
        repeat: {
          pattern: "0 * * * *", // hourly
          tz: "UTC",
        },
        jobId: "location-cancellation-finalizer",
        attempts: 3,
        backoff: { type: "exponential", delay: 60000 },
      }
    );
    logger.info("[MINDS-WORKER] Location cancellation finalizer scheduled (hourly)");
  } catch (err: any) {
    logger.error({ err: err }, "[MINDS-WORKER] Failed to set up location cancellation finalizer:");
  }
}

// Set up scheduler tick (every 60 seconds)
export async function setupSchedulerTick(): Promise<void> {
  try {
    const queue = getMindsQueue("scheduler");
    await queue.add(
      "scheduler-tick",
      {},
      {
        repeat: {
          pattern: "* * * * *", // Every minute
          tz: "UTC",
        },
        jobId: "scheduler-tick",
      }
    );
    logger.info("[MINDS-WORKER] Scheduler tick scheduled (every 60s)");
  } catch (err: any) {
    logger.error({ err: err }, "[MINDS-WORKER] Failed to set up scheduler tick:");
  }
}

// Set up CRM mapping validation schedule (daily — 4:30 AM UTC)
export async function setupCrmMappingValidationSchedule(): Promise<void> {
  try {
    const queue = getCrmQueue("mapping-validation");
    await queue.add(
      "daily-mapping-validation",
      {},
      {
        repeat: {
          pattern: "30 4 * * *", // 4:30 AM UTC daily
          tz: "UTC",
        },
        jobId: "daily-mapping-validation",
      }
    );
    logger.info("[MINDS-WORKER] Daily CRM mapping validation scheduled (4:30 AM UTC)");
  } catch (err: any) {
    logger.error({ err: err }, "[MINDS-WORKER] Failed to set up CRM mapping validation schedule:");
  }
}

// Set up CRM sync-log prune schedule (daily — 3:15 AM UTC retention housekeeping)
export async function setupCrmSyncLogPruneSchedule(): Promise<void> {
  try {
    const queue = getCrmQueue("sync-log-prune");
    await queue.add(
      "daily-sync-log-prune",
      {},
      {
        repeat: {
          pattern: "15 3 * * *", // 3:15 AM UTC daily
          tz: "UTC",
        },
        jobId: "daily-sync-log-prune",
      }
    );
    logger.info("[MINDS-WORKER] Daily CRM sync-log prune scheduled (3:15 AM UTC)");
  } catch (err: any) {
    logger.error({ err: err }, "[MINDS-WORKER] Failed to set up CRM sync-log prune schedule:");
  }
}

// Set up daily data harvest schedule (5:00 AM UTC)
export async function setupDataHarvestSchedule(): Promise<void> {
  try {
    const queue = getHarvestQueue("daily");
    await queue.add(
      "daily-data-harvest",
      {},
      {
        repeat: {
          pattern: "0 5 * * *", // 5:00 AM UTC daily
          tz: "UTC",
        },
        jobId: "daily-data-harvest",
      }
    );
    logger.info("[MINDS-WORKER] Daily data harvest scheduled (5:00 AM UTC)");
  } catch (err: any) {
    logger.error({ err: err }, "[MINDS-WORKER] Failed to set up data harvest schedule:");
  }
}

// Set up GBP local post draft schedule scan (hourly)
export async function setupGbpLocalPostGenerationSchedule(): Promise<void> {
  try {
    const queue = getGbpAutomationQueue("deployment");
    await queue.add(
      "scan-local-post-generation",
      { limit: 25 },
      {
        repeat: {
          pattern: "15 * * * *", // Hourly at :15 UTC
          tz: "UTC",
        },
        jobId: "scan-local-post-generation",
      }
    );
    logger.info("[MINDS-WORKER] GBP local post generation scan scheduled (hourly)");
  } catch (err: any) {
    logger.error({ err: err }, "[MINDS-WORKER] Failed to set up GBP local post generation schedule:");
  }
}

// Set up OS lock reaper tick (every 60 seconds — reaps expired os.document_locks)
export async function setupOsLockReaperSchedule(): Promise<void> {
  try {
    const queue = getOsQueue("lock-reaper");
    await queue.add(
      "os-lock-reaper-tick",
      {},
      {
        repeat: {
          pattern: "* * * * *", // Every minute
          tz: "UTC",
        },
        jobId: "os-lock-reaper-tick",
        attempts: 3,
        backoff: { type: "exponential", delay: 30000 },
      }
    );
    logger.info("[MINDS-WORKER] OS lock reaper scheduled (every 60s)");
  } catch (err: any) {
    logger.error({ err: err }, "[MINDS-WORKER] Failed to set up OS lock reaper schedule:");
  }
}
