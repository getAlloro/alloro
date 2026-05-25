import * as dotenv from "dotenv";
dotenv.config();

import { Worker } from "bullmq";
import IORedis from "ioredis";
import { processScrapeCompare } from "./processors/scrapeCompare.processor";
import { processCompilePublish } from "./processors/compilePublish.processor";
import { processDiscovery } from "./processors/discovery.processor";
import {
  processSkillTrigger,
  processDeadLetterCheck,
} from "./processors/skillTrigger.processor";
import { processWorksDigest } from "./processors/worksDigest.processor";
import { processSeoBulkGenerate } from "./processors/seoBulkGenerate.processor";
import { processReviewSync } from "./processors/reviewSync.processor";
import { processApifyReviewFetch } from "./processors/reviewApifyFetch.processor";
import { processSchedulerTick } from "./processors/scheduler.processor";
import { processWebsiteBackup } from "./processors/websiteBackup.processor";
import { processWebsiteRestore } from "./processors/websiteRestore.processor";
import { processAuditLeadgen } from "./processors/auditLeadgen.processor";
import {
  processProjectScrape,
  processPageGenerate,
} from "./processors/websiteGeneration.processor";
import { processIdentityWarmup } from "./processors/identityWarmup.processor";
import { processLayoutGenerate } from "./processors/websiteLayouts.processor";
import { processPostImport } from "./processors/postImporter.processor";
import { processCrmPush } from "./processors/crmPush.processor";
import { processCrmMappingValidation } from "./processors/crmMappingValidation.processor";
import { processDataHarvest } from "./processors/dataHarvest.processor";
import { processGbpAutomationJob } from "./processors/gbpAutomation.processor";
import { getMindsQueue, getCrmQueue, getHarvestQueue } from "./queues";
import { closeWbQueues } from "./wb-queues";

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);

console.log("[MINDS-WORKER] Starting Minds worker process...");
console.log(`[MINDS-WORKER] Connecting to Redis at ${REDIS_HOST}:${REDIS_PORT}`);

const connection = new IORedis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
  ...(process.env.REDIS_TLS === "true" && { tls: {} }),
});

// Scrape & Compare worker
const scrapeCompareWorker = new Worker(
  "minds-scrape-compare",
  async (job) => {
    await processScrapeCompare(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Compile & Publish worker
const compilePublishWorker = new Worker(
  "minds-compile-publish",
  async (job) => {
    await processCompilePublish(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Discovery worker
const discoveryWorker = new Worker(
  "minds-discovery",
  async (job) => {
    await processDiscovery(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Skill Trigger worker
const skillTriggerWorker = new Worker(
  "minds-skill-triggers",
  async (job) => {
    if (job.name === "dead-letter-check") {
      await processDeadLetterCheck(job);
    } else {
      await processSkillTrigger(job);
    }
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Works Digest worker
const worksDigestWorker = new Worker(
  "minds-works-digest",
  async (job) => {
    await processWorksDigest(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// SEO Bulk Generate worker
const seoBulkGenerateWorker = new Worker(
  "minds-seo-bulk-generate",
  async (job) => {
    await processSeoBulkGenerate(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Set up repeatable discovery job (every 24 hours)
async function setupDiscoverySchedule(): Promise<void> {
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
    console.log("[MINDS-WORKER] Daily discovery job scheduled (6 AM UTC)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up discovery schedule:", err);
  }
}

// Set up skill trigger schedule (every 5 minutes) + dead letter check (every 10 minutes)
async function setupSkillTriggerSchedule(): Promise<void> {
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
    console.log("[MINDS-WORKER] Skill trigger + dead letter check scheduled");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up skill trigger schedule:", err);
  }
}

// Review Sync worker (handles both OAuth sync and Apify fetch)
const reviewSyncWorker = new Worker(
  "minds-review-sync",
  async (job) => {
    if (job.name === "apify-review-fetch") {
      await processApifyReviewFetch(job);
    } else {
      await processReviewSync(job);
    }
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Scheduler worker (ticks every 60s, checks DB for due schedules)
const schedulerWorker = new Worker(
  "minds-scheduler",
  async (job) => {
    await processSchedulerTick(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Website Builder — Backup worker
const wbBackupWorker = new Worker(
  "wb-backup",
  async (job) => {
    await processWebsiteBackup(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{wb}',
  }
);

// Website Builder — Restore worker
const wbRestoreWorker = new Worker(
  "wb-restore",
  async (job) => {
    await processWebsiteRestore(job);
  },
  {
    connection,
    concurrency: 1,
    prefix: '{wb}',
  }
);

// Website Builder — Layouts generation worker (admin-triggered from Layouts tab)
const wbLayoutsWorker = new Worker(
  "wb-layout-generate",
  async (job) => {
    await processLayoutGenerate(job);
  },
  {
    connection,
    concurrency: 1,
    lockDuration: 600000, // 10 min — 3 Claude calls with tool loops
    prefix: '{wb}',
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 25 },
  }
);

// Website Builder — Identity Warmup worker (admin-triggered)
const wbIdentityWarmupWorker = new Worker(
  "wb-identity-warmup",
  async (job) => {
    await processIdentityWarmup(job);
  },
  {
    connection,
    concurrency: 1,
    lockDuration: 600000, // 10 min — Apify + Claude calls can take a while
    prefix: '{wb}',
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 25 },
  }
);

// Website Builder — Project Scrape worker (Apify + website scrape + image analysis)
const wbProjectScrapeWorker = new Worker(
  "wb-project-scrape",
  async (job) => {
    await processProjectScrape(job);
  },
  {
    connection,
    concurrency: 1,
    lockDuration: 600000, // 10 min — Apify polling can be slow
    prefix: '{wb}',
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 25 },
  }
);

// Website Builder — Page Generate worker (component-by-component HTML generation)
const wbPageGenerateWorker = new Worker(
  "wb-page-generate",
  async (job) => {
    await processPageGenerate(job);
  },
  {
    connection,
    concurrency: 2,
    lockDuration: 300000, // 5 min per page
    prefix: '{wb}',
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 25 },
  }
);

// Website Builder — Post Importer worker (admin-triggered from Posts tab)
const wbPostImportWorker = new Worker(
  "wb-post-import",
  async (job) => {
    return await processPostImport(job);
  },
  {
    connection,
    concurrency: 1,
    lockDuration: 600000, // 10 min — sequential URL scrapes can stack up
    prefix: '{wb}',
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 25 },
  }
);

// Audit Leadgen worker — long-running (3–5 min); higher lock duration.
const auditLeadgenWorker = new Worker(
  "audit-leadgen",
  async (job) => {
    await processAuditLeadgen(job);
  },
  {
    connection,
    concurrency: 3,
    lockDuration: 600000, // 10 min
    prefix: '{audit}',
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  }
);

// CRM HubSpot Push worker — async push of form submissions to HubSpot.
// Idempotent via jobId === submissionId (set at enqueue time).
const crmHubspotPushWorker = new Worker(
  "crm-hubspot-push",
  async (job) => {
    await processCrmPush(job);
  },
  {
    connection,
    concurrency: 3,
    lockDuration: 30000, // 30s — submission pushes are sub-second normally
    prefix: '{crm}',
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  }
);

// CRM Mapping Validation worker — daily token + form-existence sweep.
const crmMappingValidationWorker = new Worker(
  "crm-mapping-validation",
  async (job) => {
    await processCrmMappingValidation(job);
  },
  {
    connection,
    concurrency: 1,
    lockDuration: 600000, // 10 min — could iterate many integrations
    prefix: '{crm}',
    removeOnComplete: { count: 30 },
    removeOnFail: { count: 30 },
  }
);

// Data Harvest worker — daily pull of analytics data from Rybbit, Clarity, GSC.
const dataHarvestWorker = new Worker(
  "harvest-daily",
  async (job) => {
    await processDataHarvest(job);
  },
  {
    connection,
    concurrency: 1,
    lockDuration: 600000, // 10 min — iterates all active harvest integrations
    prefix: '{harvest}',
    removeOnComplete: { count: 30 },
    removeOnFail: { count: 30 },
  }
);

const gbpAutomationWorker = new Worker(
  "gbp-automation-deployment",
  async (job) => {
    await processGbpAutomationJob(job);
  },
  {
    connection,
    concurrency: 1,
    lockDuration: 120000,
    prefix: '{gbp}',
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  }
);

// Event handlers
for (const worker of [scrapeCompareWorker, compilePublishWorker, discoveryWorker, skillTriggerWorker, worksDigestWorker, seoBulkGenerateWorker, reviewSyncWorker, schedulerWorker, wbBackupWorker, wbRestoreWorker, wbIdentityWarmupWorker, wbLayoutsWorker, wbProjectScrapeWorker, wbPageGenerateWorker, wbPostImportWorker, auditLeadgenWorker, crmHubspotPushWorker, crmMappingValidationWorker, dataHarvestWorker, gbpAutomationWorker]) {
  worker.on("completed", (job) => {
    console.log(`[MINDS-WORKER] Job ${job?.id} completed on queue ${worker.name}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[MINDS-WORKER] Job ${job?.id} failed on queue ${worker.name}:`, err);
  });

  worker.on("error", (err) => {
    console.error(`[MINDS-WORKER] Worker error on ${worker.name}:`, err);
  });
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log("[MINDS-WORKER] Shutting down workers...");
  await scrapeCompareWorker.close();
  await compilePublishWorker.close();
  await discoveryWorker.close();
  await skillTriggerWorker.close();
  await worksDigestWorker.close();
  await seoBulkGenerateWorker.close();
  await reviewSyncWorker.close();
  await schedulerWorker.close();
  await wbBackupWorker.close();
  await wbRestoreWorker.close();
  await wbIdentityWarmupWorker.close();
  await wbLayoutsWorker.close();
  await wbProjectScrapeWorker.close();
  await wbPageGenerateWorker.close();
  await wbPostImportWorker.close();
  await auditLeadgenWorker.close();
  await crmHubspotPushWorker.close();
  await crmMappingValidationWorker.close();
  await closeWbQueues();
  await gbpAutomationWorker.close();
  await connection.quit();
  console.log("[MINDS-WORKER] Workers shut down");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Set up works digest schedule (weekly — 3 AM UTC Sundays)
async function setupWorksDigestSchedule(): Promise<void> {
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
    console.log("[MINDS-WORKER] Weekly works digest job scheduled (3 AM UTC Sundays)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up works digest schedule:", err);
  }
}

// Set up review sync schedule (daily — 4 AM UTC)
async function setupReviewSyncSchedule(): Promise<void> {
  try {
    const queue = getMindsQueue("review-sync");
    await queue.add(
      "daily-review-sync",
      {},
      {
        repeat: {
          pattern: "0 4 * * *", // 4 AM UTC daily
          tz: "UTC",
        },
        jobId: "daily-review-sync",
      }
    );
    console.log("[MINDS-WORKER] Daily review sync job scheduled (4 AM UTC)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up review sync schedule:", err);
  }
}

// Set up scheduler tick (every 60 seconds)
async function setupSchedulerTick(): Promise<void> {
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
    console.log("[MINDS-WORKER] Scheduler tick scheduled (every 60s)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up scheduler tick:", err);
  }
}

// Set up CRM mapping validation schedule (daily — 4:30 AM UTC)
async function setupCrmMappingValidationSchedule(): Promise<void> {
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
    console.log("[MINDS-WORKER] Daily CRM mapping validation scheduled (4:30 AM UTC)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up CRM mapping validation schedule:", err);
  }
}

// Set up daily data harvest schedule (5:00 AM UTC)
async function setupDataHarvestSchedule(): Promise<void> {
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
    console.log("[MINDS-WORKER] Daily data harvest scheduled (5:00 AM UTC)");
  } catch (err: any) {
    console.error("[MINDS-WORKER] Failed to set up data harvest schedule:", err);
  }
}

setupDiscoverySchedule();
setupSkillTriggerSchedule();
setupWorksDigestSchedule();
setupReviewSyncSchedule();
setupSchedulerTick();
setupCrmMappingValidationSchedule();
setupDataHarvestSchedule();

console.log("[MINDS-WORKER] All workers running. Waiting for jobs...");
