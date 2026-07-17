import { describe, expect, it } from "vitest";
import {
  PRODUCTION_WORKER_NAMES,
  WORKER_REGISTRY,
} from "../workers/feature-utils/util.worker-registry";
import { RECURRING_SCHEDULE_REGISTRY } from "../workers/feature-utils/util.worker-schedule-registry";
import {
  resolveWorkerRuntimeConfig,
  WORKTREE_RUNTIME_ID_ENV,
  WORKTREE_TEST_MODE_ENV,
  WORKTREE_WORKERS_ENV,
} from "../workers/feature-utils/util.worker-runtime-config";

const EXPECTED_WORKER_QUEUES = [
  ["scrape-compare", "minds-scrape-compare"],
  ["compile-publish", "minds-compile-publish"],
  ["discovery", "minds-discovery"],
  ["skill-triggers", "minds-skill-triggers"],
  ["works-digest", "minds-works-digest"],
  ["seo-bulk-generate", "minds-seo-bulk-generate"],
  ["extract-practice-facts", "minds-extract-practice-facts"],
  ["review-sync", "minds-review-sync"],
  ["scheduler", "minds-scheduler"],
  ["location-cancellation", "minds-location-cancellation"],
  ["schedule-exec", "minds-schedule-exec"],
  ["wb-backup", "wb-backup"],
  ["wb-restore", "wb-restore"],
  ["wb-layout-generate", "wb-layout-generate"],
  ["wb-identity-warmup", "wb-identity-warmup"],
  ["wb-ai-seo-audit", "wb-ai-seo-audit"],
  ["wb-project-scrape", "wb-project-scrape"],
  ["wb-page-generate", "wb-page-generate"],
  ["wb-post-import", "wb-post-import"],
  ["audit-leadgen", "audit-leadgen"],
  ["crm-hubspot-push", "crm-hubspot-push"],
  ["crm-mapping-validation", "crm-mapping-validation"],
  ["harvest-daily", "harvest-daily"],
  ["gbp-automation", "gbp-automation-deployment"],
  ["os-ingest", "os-ingest"],
  ["os-convert", "os-convert"],
  ["os-purge", "os-purge"],
  ["os-lock-reaper", "os-lock-reaper"],
] as const;

const EXPECTED_SCHEDULES = [
  ["daily-discovery", "minds", "discovery", "daily-discovery", "0 6 * * *"],
  [
    "skill-trigger-check",
    "minds",
    "skill-triggers",
    "skill-trigger-check",
    "*/5 * * * *",
  ],
  [
    "dead-letter-check",
    "minds",
    "skill-triggers",
    "dead-letter-check",
    "*/10 * * * *",
  ],
  [
    "weekly-works-digest",
    "minds",
    "works-digest",
    "weekly-works-digest",
    "0 3 * * 0",
  ],
  [
    "daily-review-sync",
    "minds",
    "review-sync",
    "daily-review-sync",
    "0 4 * * *",
  ],
  ["scheduler-tick", "minds", "scheduler", "scheduler-tick", "* * * * *"],
  [
    "location-cancellation-finalizer",
    "minds",
    "location-cancellation",
    "location-cancellation-finalizer",
    "0 * * * *",
  ],
  [
    "daily-mapping-validation",
    "crm",
    "mapping-validation",
    "daily-mapping-validation",
    "30 4 * * *",
  ],
  [
    "daily-data-harvest",
    "harvest",
    "daily",
    "daily-data-harvest",
    "0 5 * * *",
  ],
  [
    "scan-local-post-generation",
    "gbp-automation",
    "deployment",
    "scan-local-post-generation",
    "15 * * * *",
  ],
  [
    "daily-local-post-sync",
    "gbp-automation",
    "deployment",
    "sync-local-posts",
    "45 4 * * *",
  ],
  [
    "os-lock-reaper-tick",
    "os",
    "lock-reaper",
    "os-lock-reaper-tick",
    "* * * * *",
  ],
] as const;

function worktreeEnvironment(
  workerNames = "",
): NodeJS.ProcessEnv {
  return {
    [WORKTREE_TEST_MODE_ENV]: "true",
    [WORKTREE_RUNTIME_ID_ENV]: "runtime-a",
    [WORKTREE_WORKERS_ENV]: workerNames,
    REDIS_HOST: "127.0.0.1",
    REDIS_PORT: "49152",
    REDIS_TLS: "false",
  };
}

describe("worker registry parity", () => {
  it("accounts for every production worker queue", () => {
    expect(
      WORKER_REGISTRY.map(({ name, queueName }) => [name, queueName]),
    ).toEqual(EXPECTED_WORKER_QUEUES);
    expect(PRODUCTION_WORKER_NAMES).toEqual(
      EXPECTED_WORKER_QUEUES.map(([name]) => name),
    );
  });

  it("accounts for every production recurring schedule", () => {
    expect(
      RECURRING_SCHEDULE_REGISTRY.map((schedule) => [
        schedule.name,
        schedule.queueKind,
        schedule.queueName,
        schedule.jobName,
        schedule.options.repeat?.pattern,
      ]),
    ).toEqual(EXPECTED_SCHEDULES);
  });
});

describe("worker runtime selection", () => {
  it("keeps every worker and recurring schedule enabled by default", () => {
    const config = resolveWorkerRuntimeConfig({
      [WORKTREE_TEST_MODE_ENV]: "false",
      [WORKTREE_WORKERS_ENV]: "gbp-automation",
    });

    expect(config.isWorktreeTestMode).toBe(false);
    expect(config.workerDefinitions).toBe(WORKER_REGISTRY);
    expect(config.recurringSchedules).toBe(RECURRING_SCHEDULE_REGISTRY);
    expect(config.redis).toEqual({
      host: "127.0.0.1",
      port: 6379,
      isTlsEnabled: false,
    });
  });

  it("starts no workers or recurring schedules by default in worktree mode", () => {
    const config = resolveWorkerRuntimeConfig(worktreeEnvironment());

    expect(config.workerDefinitions).toEqual([]);
    expect(config.recurringSchedules).toEqual([]);
  });

  it("selects only gbp-automation and still installs no repeat jobs", () => {
    const config = resolveWorkerRuntimeConfig(
      worktreeEnvironment("gbp-automation"),
    );

    expect(
      config.workerDefinitions.map(({ name, queueName }) => [name, queueName]),
    ).toEqual([["gbp-automation", "gbp-automation-deployment"]]);
    expect(config.recurringSchedules).toEqual([]);
  });

  it("rejects unknown names before any worker can start", () => {
    expect(() =>
      resolveWorkerRuntimeConfig(worktreeEnvironment("gbp-automation,unknown")),
    ).toThrow(/Unknown worker name.*unknown/);
  });

  it("requires explicit runtime identity and loopback Redis in worktree mode", () => {
    expect(() =>
      resolveWorkerRuntimeConfig({
        ...worktreeEnvironment(),
        [WORKTREE_RUNTIME_ID_ENV]: "",
      }),
    ).toThrow(`${WORKTREE_RUNTIME_ID_ENV} is required`);

    expect(() =>
      resolveWorkerRuntimeConfig({
        ...worktreeEnvironment(),
        REDIS_HOST: "shared-redis.internal",
      }),
    ).toThrow(/loopback Redis host/);
  });

  it("fails on malformed mode values instead of guessing", () => {
    expect(() =>
      resolveWorkerRuntimeConfig({
        [WORKTREE_TEST_MODE_ENV]: "yes",
      }),
    ).toThrow(`${WORKTREE_TEST_MODE_ENV} must be exactly`);
  });
});
