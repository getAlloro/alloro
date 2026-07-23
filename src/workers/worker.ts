import * as dotenv from "dotenv";
dotenv.config();

import { Job, Worker } from "bullmq";
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
import { processExtractPracticeFacts } from "./processors/extractPracticeFacts.processor";
import { processReviewSync } from "./processors/reviewSync.processor";
import { processApifyReviewFetch } from "./processors/reviewApifyFetch.processor";
import { processSchedulerTick } from "./processors/scheduler.processor";
import { processLocationCancellationFinalizerTick } from "./processors/locationCancellationFinalizer.processor";
import { processScheduleExec } from "./processors/scheduleExec.processor";
import { processWebsiteBackup } from "./processors/websiteBackup.processor";
import { processWebsiteRestore } from "./processors/websiteRestore.processor";
import { processAuditLeadgen } from "./processors/auditLeadgen.processor";
import {
  processProjectScrape,
  processPageGenerate,
} from "./processors/websiteGeneration.processor";
import { processIdentityWarmup } from "./processors/identityWarmup.processor";
import { processAiSeoAudit } from "./processors/aiSeoAudit.processor";
import { processLayoutGenerate } from "./processors/websiteLayouts.processor";
import { processPostImport } from "./processors/postImporter.processor";
import { processCrmPush } from "./processors/crmPush.processor";
import { processCrmMappingValidation } from "./processors/crmMappingValidation.processor";
import { processCrmSyncLogPrune } from "./processors/crmSyncLogPrune.processor";
import { processDataHarvest } from "./processors/dataHarvest.processor";
import { processGbpAutomationJob } from "./processors/gbpAutomation.processor";
import { processOsIngest } from "./processors/osIngest.processor";
import { processOsConvert } from "./processors/osConvert.processor";
import { processOsPurge } from "./processors/osPurge.processor";
import { processOsLockReaper } from "./processors/osLockReaper.processor";
import { closeWbQueues } from "./wb-queues";
import {
  setupDiscoverySchedule,
  setupSkillTriggerSchedule,
  setupWorksDigestSchedule,
  setupReviewSyncSchedule,
  setupGbpLocalPostSyncSchedule,
  setupLocationCancellationFinalizer,
  setupSchedulerTick,
  setupCrmMappingValidationSchedule,
  setupCrmSyncLogPruneSchedule,
  setupDataHarvestSchedule,
  setupGbpLocalPostGenerationSchedule,
  setupOsLockReaperSchedule,
} from "./schedules";
import logger from "../lib/logger";

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);

logger.info("[MINDS-WORKER] Starting Minds worker process...");
logger.info(`[MINDS-WORKER] Connecting to Redis at ${REDIS_HOST}:${REDIS_PORT}`);

// Each Worker gets its own Redis connection via makeConnection(). Sharing a single
// ioredis instance across all ~20 workers funnels every lock-renewal command through
// one connection; under load those renewals get delayed and surface as
// "could not renew lock". One connection per worker removes that contention.
const connections: IORedis[] = [];
function makeConnection(): IORedis {
  const conn = new IORedis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: null, // required by BullMQ workers
    // Bounded backoff so a dropped connection always keeps retrying instead of
    // silently giving up (the 2026-06-07 stall surfaced no logs at all).
    retryStrategy: (times) => Math.min(times * 200, 5000),
    ...(process.env.REDIS_TLS === "true" && { tls: {} }),
  });
  // Make connection trouble LOUD — previously these events were unhandled, so a
  // hung/closed connection froze the worker with zero log output.
  conn.on("error", (err) =>
    logger.error({ err: err?.message }, "[MINDS-WORKER][redis] connection error:"),
  );
  conn.on("close", () =>
    logger.warn("[MINDS-WORKER][redis] connection closed"),
  );
  conn.on("reconnecting", () =>
    logger.warn("[MINDS-WORKER][redis] reconnecting..."),
  );
  conn.on("end", () =>
    logger.warn("[MINDS-WORKER][redis] connection ended (no further reconnects)"),
  );
  connections.push(conn);
  return conn;
}

// Scrape & Compare worker
const scrapeCompareWorker = new Worker(
  "minds-scrape-compare",
  async (job) => {
    await processScrapeCompare(job);
  },
  {
    connection: makeConnection(),
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
    connection: makeConnection(),
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
    connection: makeConnection(),
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
    connection: makeConnection(),
    concurrency: 1,
    lockDuration: 300000, // 5 min — fires a webhook to n8n per due skill; batched but bounded
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
    connection: makeConnection(),
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
    connection: makeConnection(),
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Practice Fact Extraction worker
const extractPracticeFactsWorker = new Worker(
  "minds-extract-practice-facts",
  async (job) => {
    await processExtractPracticeFacts(job);
  },
  {
    connection: makeConnection(),
    concurrency: 2,
    prefix: '{minds}',
  }
);

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
    connection: makeConnection(),
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Scheduler worker (ticks every 60s, dispatches due schedules to minds-schedule-exec)
const schedulerWorker = new Worker(
  "minds-scheduler",
  async (job) => {
    await processSchedulerTick(job);
  },
  {
    connection: makeConnection(),
    concurrency: 1,
    prefix: '{minds}',
  }
);

// Location cancellation finalizer (hourly — flips due pending_cancellation → cancelled)
const locationCancellationFinalizerWorker = new Worker(
  "minds-location-cancellation",
  async (job) => {
    await processLocationCancellationFinalizerTick(job);
  },
  {
    connection: makeConnection(),
    concurrency: 1,
    prefix: '{minds}',
    removeOnComplete: { count: 24 },
    removeOnFail: { count: 24 },
  }
);

// Schedule Exec worker — runs a single due schedule's agent handler off the tick.
// Long lock + parallelism: agent handlers (proofline/ranking over all locations)
// are multi-minute, so they must not run inside the 60s scheduler tick.
const scheduleExecWorker = new Worker(
  "minds-schedule-exec",
  async (job) => {
    await processScheduleExec(job);
  },
  {
    connection: makeConnection(),
    concurrency: 2,
    lockDuration: 900000, // 15 min — covers worst-case agent run
    prefix: '{minds}',
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 25 },
  }
);

// Website Builder — Backup worker
const wbBackupWorker = new Worker(
  "wb-backup",
  async (job) => {
    await processWebsiteBackup(job);
  },
  {
    connection: makeConnection(),
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
    connection: makeConnection(),
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
    connection: makeConnection(),
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
    connection: makeConnection(),
    concurrency: 1,
    lockDuration: 600000, // 10 min — Apify + Claude calls can take a while
    prefix: '{wb}',
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 25 },
  }
);

// Website Builder — AI/SEO Audit worker (URL collection + external scan + scoring)
const wbAiSeoAuditWorker = new Worker(
  "wb-ai-seo-audit",
  async (job) => {
    await processAiSeoAudit(job);
  },
  {
    connection: makeConnection(),
    concurrency: 2,
    lockDuration: 600000, // 10 min — multi-page fetch + SerpApi + external fetches
    prefix: '{wb}',
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 50 },
  }
);

// Website Builder — Project Scrape worker (Apify + website scrape + image analysis)
const wbProjectScrapeWorker = new Worker(
  "wb-project-scrape",
  async (job) => {
    await processProjectScrape(job);
  },
  {
    connection: makeConnection(),
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
    connection: makeConnection(),
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
    connection: makeConnection(),
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
    connection: makeConnection(),
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
    connection: makeConnection(),
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
    connection: makeConnection(),
    concurrency: 1,
    lockDuration: 600000, // 10 min — could iterate many integrations
    prefix: '{crm}',
    removeOnComplete: { count: 30 },
    removeOnFail: { count: 30 },
  }
);

// CRM Sync-Log Prune worker — daily retention housekeeping on crm_sync_logs.
const crmSyncLogPruneWorker = new Worker(
  "crm-sync-log-prune",
  async (job) => {
    await processCrmSyncLogPrune(job);
  },
  {
    connection: makeConnection(),
    concurrency: 1,
    lockDuration: 300000, // 5 min — a single bounded DELETE by time cutoff
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
    connection: makeConnection(),
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
    connection: makeConnection(),
    concurrency: 1,
    lockDuration: 1200000, // 20 min — sync-local-posts iterates all locations (Google API each); daily cadence, no overlap risk. See spec T4 for the per-location dispatch follow-up.
    prefix: '{gbp}',
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  }
);

// OS knowledge base workers (plans/07042026-alloro-os-admin-port, D10).
// ingest/convert/purge are P1 logging stubs (real logic lands P4/P6/P2);
// lock-reaper is REAL (deletes expired os.document_locks; repeatable 60s below).
const osWorkerDefs: Array<{
  queue: string;
  concurrency: number;
  handler: (job: Job) => Promise<void>;
}> = [
  { queue: "os-ingest", concurrency: 2, handler: processOsIngest },
  { queue: "os-convert", concurrency: 2, handler: processOsConvert },
  { queue: "os-purge", concurrency: 2, handler: processOsPurge },
  { queue: "os-lock-reaper", concurrency: 1, handler: processOsLockReaper },
];
const osWorkers = osWorkerDefs.map(
  ({ queue, concurrency, handler }) =>
    new Worker(queue, async (job) => { await handler(job); }, {
      connection: makeConnection(),
      concurrency,
      prefix: '{os}',
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 25 },
    })
);

// Event handlers
for (const worker of [scrapeCompareWorker, compilePublishWorker, discoveryWorker, skillTriggerWorker, worksDigestWorker, seoBulkGenerateWorker, extractPracticeFactsWorker, reviewSyncWorker, schedulerWorker, scheduleExecWorker, wbBackupWorker, wbRestoreWorker, wbIdentityWarmupWorker, wbAiSeoAuditWorker, wbLayoutsWorker, wbProjectScrapeWorker, wbPageGenerateWorker, wbPostImportWorker, auditLeadgenWorker, crmHubspotPushWorker, crmMappingValidationWorker, crmSyncLogPruneWorker, dataHarvestWorker, gbpAutomationWorker, ...osWorkers]) {
  worker.on("completed", (job) => {
    logger.info(`[MINDS-WORKER] Job ${job?.id} completed on queue ${worker.name}`);
  });

  worker.on("failed", (job, err) => {
    logger.error({ err: err }, `[MINDS-WORKER] Job ${job?.id} failed on queue ${worker.name}:`);
  });

  worker.on("error", (err) => {
    logger.error({ err: err }, `[MINDS-WORKER] Worker error on ${worker.name}:`);
  });
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  logger.info("[MINDS-WORKER] Shutting down workers...");
  await scrapeCompareWorker.close();
  await compilePublishWorker.close();
  await discoveryWorker.close();
  await skillTriggerWorker.close();
  await worksDigestWorker.close();
  await seoBulkGenerateWorker.close();
  await extractPracticeFactsWorker.close();
  await reviewSyncWorker.close();
  await schedulerWorker.close();
  await locationCancellationFinalizerWorker.close();
  await scheduleExecWorker.close();
  await wbBackupWorker.close();
  await wbRestoreWorker.close();
  await wbIdentityWarmupWorker.close();
  await wbAiSeoAuditWorker.close();
  await wbLayoutsWorker.close();
  await wbProjectScrapeWorker.close();
  await wbPageGenerateWorker.close();
  await wbPostImportWorker.close();
  await auditLeadgenWorker.close();
  await crmHubspotPushWorker.close();
  await crmMappingValidationWorker.close();
  await crmSyncLogPruneWorker.close();
  await closeWbQueues();
  await gbpAutomationWorker.close();
  for (const osWorker of osWorkers) {
    await osWorker.close();
  }
  await Promise.all(connections.map((c) => c.quit()));
  logger.info("[MINDS-WORKER] Workers shut down");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

setupDiscoverySchedule();
setupSkillTriggerSchedule();
setupWorksDigestSchedule();
setupReviewSyncSchedule();
setupSchedulerTick();
setupLocationCancellationFinalizer();
setupCrmMappingValidationSchedule();
setupCrmSyncLogPruneSchedule();
setupDataHarvestSchedule();
setupGbpLocalPostGenerationSchedule();
setupGbpLocalPostSyncSchedule();
setupOsLockReaperSchedule();

logger.info("[MINDS-WORKER] All workers running. Waiting for jobs...");
