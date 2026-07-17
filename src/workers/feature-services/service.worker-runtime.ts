import { Queue, Worker, type Processor } from "bullmq";
import IORedis from "ioredis";
import logger from "../../lib/logger";
import { processAiSeoAudit } from "../processors/aiSeoAudit.processor";
import { processAuditLeadgen } from "../processors/auditLeadgen.processor";
import { processCompilePublish } from "../processors/compilePublish.processor";
import { processCrmMappingValidation } from "../processors/crmMappingValidation.processor";
import { processCrmPush } from "../processors/crmPush.processor";
import { processDataHarvest } from "../processors/dataHarvest.processor";
import { processDiscovery } from "../processors/discovery.processor";
import { processExtractPracticeFacts } from "../processors/extractPracticeFacts.processor";
import { processGbpAutomationJob } from "../processors/gbpAutomation.processor";
import { processIdentityWarmup } from "../processors/identityWarmup.processor";
import { processLocationCancellationFinalizerTick } from "../processors/locationCancellationFinalizer.processor";
import { processOsConvert } from "../processors/osConvert.processor";
import { processOsIngest } from "../processors/osIngest.processor";
import { processOsLockReaper } from "../processors/osLockReaper.processor";
import { processOsPurge } from "../processors/osPurge.processor";
import { processPostImport } from "../processors/postImporter.processor";
import { processApifyReviewFetch } from "../processors/reviewApifyFetch.processor";
import { processReviewSync } from "../processors/reviewSync.processor";
import { processScheduleExec } from "../processors/scheduleExec.processor";
import { processSchedulerTick } from "../processors/scheduler.processor";
import { processScrapeCompare } from "../processors/scrapeCompare.processor";
import { processSeoBulkGenerate } from "../processors/seoBulkGenerate.processor";
import {
  processDeadLetterCheck,
  processSkillTrigger,
} from "../processors/skillTrigger.processor";
import {
  processPageGenerate,
  processProjectScrape,
} from "../processors/websiteGeneration.processor";
import { processWebsiteBackup } from "../processors/websiteBackup.processor";
import { processLayoutGenerate } from "../processors/websiteLayouts.processor";
import { processWebsiteRestore } from "../processors/websiteRestore.processor";
import { processWorksDigest } from "../processors/worksDigest.processor";
import {
  closeQueues,
  getCrmQueue,
  getGbpAutomationQueue,
  getHarvestQueue,
  getMindsQueue,
  getOsQueue,
} from "../queues";
import { closeWbQueues } from "../wb-queues";
import {
  type WorkerDefinition,
  type WorkerName,
} from "../feature-utils/util.worker-registry";
import type {
  RegisteredSchedule,
  ScheduleQueueKind,
} from "../feature-utils/util.worker-schedule-registry";
import {
  resolveWorkerRuntimeConfig,
  type WorkerRedisConfig,
  type WorkerRuntimeConfig,
} from "../feature-utils/util.worker-runtime-config";

const REDIS_RETRY_STEP_MS = 200;
const REDIS_RETRY_MAX_MS = 5_000;

type WorkerProcessorRegistry = Record<WorkerName, Processor>;

const WORKER_PROCESSORS = {
  "scrape-compare": async (job) => {
    await processScrapeCompare(job);
  },
  "compile-publish": async (job) => {
    await processCompilePublish(job);
  },
  discovery: async (job) => {
    await processDiscovery(job);
  },
  "skill-triggers": async (job) => {
    if (job.name === "dead-letter-check") {
      await processDeadLetterCheck(job);
      return;
    }
    await processSkillTrigger(job);
  },
  "works-digest": async (job) => {
    await processWorksDigest(job);
  },
  "seo-bulk-generate": async (job) => {
    await processSeoBulkGenerate(job);
  },
  "extract-practice-facts": async (job) => {
    await processExtractPracticeFacts(job);
  },
  "review-sync": async (job) => {
    if (job.name === "apify-review-fetch") {
      await processApifyReviewFetch(job);
      return;
    }
    await processReviewSync(job);
  },
  scheduler: async (job) => {
    await processSchedulerTick(job);
  },
  "location-cancellation": async (job) => {
    await processLocationCancellationFinalizerTick(job);
  },
  "schedule-exec": async (job) => {
    await processScheduleExec(job);
  },
  "wb-backup": async (job) => {
    await processWebsiteBackup(job);
  },
  "wb-restore": async (job) => {
    await processWebsiteRestore(job);
  },
  "wb-layout-generate": async (job) => {
    await processLayoutGenerate(job);
  },
  "wb-identity-warmup": async (job) => {
    await processIdentityWarmup(job);
  },
  "wb-ai-seo-audit": async (job) => {
    await processAiSeoAudit(job);
  },
  "wb-project-scrape": async (job) => {
    await processProjectScrape(job);
  },
  "wb-page-generate": async (job) => {
    await processPageGenerate(job);
  },
  "wb-post-import": async (job) => processPostImport(job),
  "audit-leadgen": async (job) => {
    await processAuditLeadgen(job);
  },
  "crm-hubspot-push": async (job) => {
    await processCrmPush(job);
  },
  "crm-mapping-validation": async (job) => {
    await processCrmMappingValidation(job);
  },
  "harvest-daily": async (job) => {
    await processDataHarvest(job);
  },
  "gbp-automation": async (job) => {
    await processGbpAutomationJob(job);
  },
  "os-ingest": async (job) => {
    await processOsIngest(job);
  },
  "os-convert": async (job) => {
    await processOsConvert(job);
  },
  "os-purge": async (job) => {
    await processOsPurge(job);
  },
  "os-lock-reaper": async (job) => {
    await processOsLockReaper(job);
  },
} satisfies WorkerProcessorRegistry;

export interface WorkerRuntime {
  config: WorkerRuntimeConfig;
  workers: readonly Worker[];
  close: () => Promise<void>;
}

function createRedisConnection(
  config: WorkerRedisConfig,
  runtimeId: string | null,
): IORedis {
  const connection = new IORedis({
    host: config.host,
    port: config.port,
    maxRetriesPerRequest: null,
    retryStrategy: (times) =>
      Math.min(times * REDIS_RETRY_STEP_MS, REDIS_RETRY_MAX_MS),
    ...(config.isTlsEnabled && { tls: {} }),
  });
  const logContext = {
    redisHost: config.host,
    redisPort: config.port,
    runtimeId,
  };

  connection.on("error", (error) => {
    logger.error(
      { ...logContext, err: error.message },
      "[MINDS-WORKER][redis] Connection error",
    );
  });
  connection.on("close", () => {
    logger.warn(logContext, "[MINDS-WORKER][redis] Connection closed");
  });
  connection.on("reconnecting", () => {
    logger.warn(logContext, "[MINDS-WORKER][redis] Reconnecting");
  });
  connection.on("end", () => {
    logger.warn(logContext, "[MINDS-WORKER][redis] Connection ended");
  });

  return connection;
}

function attachWorkerEventHandlers(worker: Worker): void {
  worker.on("completed", (job) => {
    logger.info(
      {
        jobId: job.id ?? null,
        jobName: job.name,
        queueName: worker.name,
      },
      "[MINDS-WORKER] Job completed",
    );
  });
  worker.on("failed", (job, error) => {
    logger.error(
      {
        err: error,
        attemptsMade: job?.attemptsMade ?? null,
        jobId: job?.id ?? null,
        jobName: job?.name ?? null,
        queueName: worker.name,
      },
      "[MINDS-WORKER] Job failed",
    );
  });
  worker.on("error", (error) => {
    logger.error(
      { err: error, queueName: worker.name },
      "[MINDS-WORKER] Worker error",
    );
  });
}

function createWorker(
  definition: WorkerDefinition,
  connection: IORedis,
): Worker {
  const worker = new Worker(
    definition.queueName,
    WORKER_PROCESSORS[definition.name],
    {
      ...definition.options,
      connection,
    },
  );
  attachWorkerEventHandlers(worker);
  return worker;
}

function getScheduleQueue(
  queueKind: ScheduleQueueKind,
  queueName: string,
): Queue {
  switch (queueKind) {
    case "minds":
      return getMindsQueue(queueName);
    case "crm":
      return getCrmQueue(queueName);
    case "harvest":
      return getHarvestQueue(queueName);
    case "gbp-automation":
      return getGbpAutomationQueue(queueName);
    case "os":
      return getOsQueue(queueName);
  }
}

async function installRecurringSchedule(
  schedule: RegisteredSchedule,
): Promise<void> {
  try {
    const queue = getScheduleQueue(schedule.queueKind, schedule.queueName);
    await queue.add(schedule.jobName, schedule.data, schedule.options);
    logger.info(
      {
        scheduleName: schedule.name,
        queueName: queue.name,
      },
      schedule.successMessage,
    );
  } catch (error) {
    logger.error(
      {
        err: error,
        scheduleName: schedule.name,
        queueName: schedule.queueName,
      },
      "[MINDS-WORKER] Failed to install recurring schedule",
    );
    throw error;
  }
}

async function installRecurringSchedules(
  schedules: readonly RegisteredSchedule[],
): Promise<void> {
  for (const schedule of schedules) {
    await installRecurringSchedule(schedule);
  }
}

function collectRejectedReasons(
  results: readonly PromiseSettledResult<unknown>[],
  failures: unknown[],
): void {
  for (const result of results) {
    if (result.status === "rejected") failures.push(result.reason);
  }
}

function describeFailure(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

async function closeRuntimeResources(
  workers: readonly Worker[],
  connections: readonly IORedis[],
): Promise<void> {
  const failures: unknown[] = [];

  collectRejectedReasons(
    await Promise.allSettled(workers.map((worker) => worker.close())),
    failures,
  );

  try {
    await closeWbQueues();
  } catch (error) {
    failures.push(error);
  }

  try {
    await closeQueues();
  } catch (error) {
    failures.push(error);
  }

  collectRejectedReasons(
    await Promise.allSettled(connections.map((connection) => connection.quit())),
    failures,
  );

  if (failures.length > 0) {
    throw new Error(
      `Worker runtime shutdown failed: ${failures.map(describeFailure).join("; ")}`,
    );
  }
}

export async function startWorkerRuntime(
  env: NodeJS.ProcessEnv = process.env,
): Promise<WorkerRuntime> {
  const config = resolveWorkerRuntimeConfig(env);
  const workers: Worker[] = [];
  const connections: IORedis[] = [];

  logger.info(
    {
      isWorktreeTestMode: config.isWorktreeTestMode,
      runtimeId: config.runtimeId,
      workerNames: config.workerDefinitions.map(({ name }) => name),
      recurringScheduleCount: config.recurringSchedules.length,
      redisHost: config.redis.host,
      redisPort: config.redis.port,
    },
    "[MINDS-WORKER] Starting worker runtime",
  );

  try {
    for (const definition of config.workerDefinitions) {
      const connection = createRedisConnection(config.redis, config.runtimeId);
      connections.push(connection);
      workers.push(createWorker(definition, connection));
    }
    await installRecurringSchedules(config.recurringSchedules);
  } catch (error) {
    try {
      await closeRuntimeResources(workers, connections);
    } catch (cleanupError) {
      logger.error(
        { err: cleanupError, runtimeId: config.runtimeId },
        "[MINDS-WORKER] Startup cleanup failed",
      );
    }
    throw error;
  }

  let closePromise: Promise<void> | null = null;
  return {
    config,
    workers,
    close: () => {
      closePromise ??= closeRuntimeResources(workers, connections);
      return closePromise;
    },
  };
}
