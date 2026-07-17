import type { JobsOptions } from "bullmq";

export type ScheduleQueueKind =
  | "minds"
  | "crm"
  | "harvest"
  | "gbp-automation"
  | "os";

export interface RecurringScheduleDefinition {
  name: string;
  queueKind: ScheduleQueueKind;
  queueName: string;
  jobName: string;
  data: Record<string, unknown>;
  options: JobsOptions;
  successMessage: string;
}

export const RECURRING_SCHEDULE_REGISTRY = [
  {
    name: "daily-discovery",
    queueKind: "minds",
    queueName: "discovery",
    jobName: "daily-discovery",
    data: {},
    options: {
      repeat: { pattern: "0 6 * * *", tz: "UTC" },
      jobId: "daily-discovery",
    },
    successMessage: "[MINDS-WORKER] Daily discovery job scheduled (6 AM UTC)",
  },
  {
    name: "skill-trigger-check",
    queueKind: "minds",
    queueName: "skill-triggers",
    jobName: "skill-trigger-check",
    data: {},
    options: {
      repeat: { pattern: "*/5 * * * *", tz: "UTC" },
      jobId: "skill-trigger-check",
    },
    successMessage: "[MINDS-WORKER] Skill trigger check scheduled (every 5 minutes)",
  },
  {
    name: "dead-letter-check",
    queueKind: "minds",
    queueName: "skill-triggers",
    jobName: "dead-letter-check",
    data: {},
    options: {
      repeat: { pattern: "*/10 * * * *", tz: "UTC" },
      jobId: "dead-letter-check",
    },
    successMessage: "[MINDS-WORKER] Dead letter check scheduled (every 10 minutes)",
  },
  {
    name: "weekly-works-digest",
    queueKind: "minds",
    queueName: "works-digest",
    jobName: "weekly-works-digest",
    data: {},
    options: {
      repeat: { pattern: "0 3 * * 0", tz: "UTC" },
      jobId: "weekly-works-digest",
    },
    successMessage: "[MINDS-WORKER] Weekly works digest job scheduled (3 AM UTC Sundays)",
  },
  {
    name: "daily-review-sync",
    queueKind: "minds",
    queueName: "review-sync",
    jobName: "daily-review-sync",
    data: { syncSource: "auto" },
    options: {
      repeat: { pattern: "0 4 * * *", tz: "UTC" },
      jobId: "daily-review-sync",
    },
    successMessage: "[MINDS-WORKER] Daily review sync job scheduled (4 AM UTC)",
  },
  {
    name: "scheduler-tick",
    queueKind: "minds",
    queueName: "scheduler",
    jobName: "scheduler-tick",
    data: {},
    options: {
      repeat: { pattern: "* * * * *", tz: "UTC" },
      jobId: "scheduler-tick",
    },
    successMessage: "[MINDS-WORKER] Scheduler tick scheduled (every 60s)",
  },
  {
    name: "location-cancellation-finalizer",
    queueKind: "minds",
    queueName: "location-cancellation",
    jobName: "location-cancellation-finalizer",
    data: {},
    options: {
      repeat: { pattern: "0 * * * *", tz: "UTC" },
      jobId: "location-cancellation-finalizer",
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
    },
    successMessage: "[MINDS-WORKER] Location cancellation finalizer scheduled (hourly)",
  },
  {
    name: "daily-mapping-validation",
    queueKind: "crm",
    queueName: "mapping-validation",
    jobName: "daily-mapping-validation",
    data: {},
    options: {
      repeat: { pattern: "30 4 * * *", tz: "UTC" },
      jobId: "daily-mapping-validation",
    },
    successMessage: "[MINDS-WORKER] Daily CRM mapping validation scheduled (4:30 AM UTC)",
  },
  {
    name: "daily-data-harvest",
    queueKind: "harvest",
    queueName: "daily",
    jobName: "daily-data-harvest",
    data: {},
    options: {
      repeat: { pattern: "0 5 * * *", tz: "UTC" },
      jobId: "daily-data-harvest",
    },
    successMessage: "[MINDS-WORKER] Daily data harvest scheduled (5:00 AM UTC)",
  },
  {
    name: "scan-local-post-generation",
    queueKind: "gbp-automation",
    queueName: "deployment",
    jobName: "scan-local-post-generation",
    data: { limit: 25 },
    options: {
      repeat: { pattern: "15 * * * *", tz: "UTC" },
      jobId: "scan-local-post-generation",
    },
    successMessage: "[MINDS-WORKER] GBP local post generation scan scheduled (hourly)",
  },
  {
    name: "daily-local-post-sync",
    queueKind: "gbp-automation",
    queueName: "deployment",
    jobName: "sync-local-posts",
    data: { syncSource: "auto" },
    options: {
      repeat: { pattern: "45 4 * * *", tz: "UTC" },
      jobId: "daily-local-post-sync",
    },
    successMessage: "[MINDS-WORKER] Daily GBP local post sync scheduled (4:45 AM UTC)",
  },
  {
    name: "os-lock-reaper-tick",
    queueKind: "os",
    queueName: "lock-reaper",
    jobName: "os-lock-reaper-tick",
    data: {},
    options: {
      repeat: { pattern: "* * * * *", tz: "UTC" },
      jobId: "os-lock-reaper-tick",
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
    },
    successMessage: "[MINDS-WORKER] OS lock reaper scheduled (every 60s)",
  },
] as const satisfies readonly RecurringScheduleDefinition[];

export type RegisteredSchedule = (typeof RECURRING_SCHEDULE_REGISTRY)[number];
