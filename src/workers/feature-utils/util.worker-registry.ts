import type { WorkerOptions } from "bullmq";

export type WorkerOptionsWithoutConnection = Omit<WorkerOptions, "connection">;

export interface WorkerRegistryDefinition {
  name: string;
  queueName: string;
  options: WorkerOptionsWithoutConnection;
}

export const WORKER_REGISTRY = [
  {
    name: "scrape-compare",
    queueName: "minds-scrape-compare",
    options: { concurrency: 1, prefix: "{minds}" },
  },
  {
    name: "compile-publish",
    queueName: "minds-compile-publish",
    options: { concurrency: 1, prefix: "{minds}" },
  },
  {
    name: "discovery",
    queueName: "minds-discovery",
    options: { concurrency: 1, prefix: "{minds}" },
  },
  {
    name: "skill-triggers",
    queueName: "minds-skill-triggers",
    options: {
      concurrency: 1,
      lockDuration: 300_000,
      prefix: "{minds}",
    },
  },
  {
    name: "works-digest",
    queueName: "minds-works-digest",
    options: { concurrency: 1, prefix: "{minds}" },
  },
  {
    name: "seo-bulk-generate",
    queueName: "minds-seo-bulk-generate",
    options: { concurrency: 1, prefix: "{minds}" },
  },
  {
    name: "extract-practice-facts",
    queueName: "minds-extract-practice-facts",
    options: { concurrency: 2, prefix: "{minds}" },
  },
  {
    name: "review-sync",
    queueName: "minds-review-sync",
    options: { concurrency: 1, prefix: "{minds}" },
  },
  {
    name: "scheduler",
    queueName: "minds-scheduler",
    options: { concurrency: 1, prefix: "{minds}" },
  },
  {
    name: "location-cancellation",
    queueName: "minds-location-cancellation",
    options: {
      concurrency: 1,
      prefix: "{minds}",
      removeOnComplete: { count: 24 },
      removeOnFail: { count: 24 },
    },
  },
  {
    name: "schedule-exec",
    queueName: "minds-schedule-exec",
    options: {
      concurrency: 2,
      lockDuration: 900_000,
      prefix: "{minds}",
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 25 },
    },
  },
  {
    name: "wb-backup",
    queueName: "wb-backup",
    options: { concurrency: 1, prefix: "{wb}" },
  },
  {
    name: "wb-restore",
    queueName: "wb-restore",
    options: { concurrency: 1, prefix: "{wb}" },
  },
  {
    name: "wb-layout-generate",
    queueName: "wb-layout-generate",
    options: {
      concurrency: 1,
      lockDuration: 600_000,
      prefix: "{wb}",
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 25 },
    },
  },
  {
    name: "wb-identity-warmup",
    queueName: "wb-identity-warmup",
    options: {
      concurrency: 1,
      lockDuration: 600_000,
      prefix: "{wb}",
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 25 },
    },
  },
  {
    name: "wb-ai-seo-audit",
    queueName: "wb-ai-seo-audit",
    options: {
      concurrency: 2,
      lockDuration: 600_000,
      prefix: "{wb}",
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  },
  {
    name: "wb-project-scrape",
    queueName: "wb-project-scrape",
    options: {
      concurrency: 1,
      lockDuration: 600_000,
      prefix: "{wb}",
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 25 },
    },
  },
  {
    name: "wb-page-generate",
    queueName: "wb-page-generate",
    options: {
      concurrency: 2,
      lockDuration: 300_000,
      prefix: "{wb}",
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 25 },
    },
  },
  {
    name: "wb-post-import",
    queueName: "wb-post-import",
    options: {
      concurrency: 1,
      lockDuration: 600_000,
      prefix: "{wb}",
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 25 },
    },
  },
  {
    name: "audit-leadgen",
    queueName: "audit-leadgen",
    options: {
      concurrency: 3,
      lockDuration: 600_000,
      prefix: "{audit}",
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  },
  {
    name: "crm-hubspot-push",
    queueName: "crm-hubspot-push",
    options: {
      concurrency: 3,
      lockDuration: 30_000,
      prefix: "{crm}",
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  },
  {
    name: "crm-mapping-validation",
    queueName: "crm-mapping-validation",
    options: {
      concurrency: 1,
      lockDuration: 600_000,
      prefix: "{crm}",
      removeOnComplete: { count: 30 },
      removeOnFail: { count: 30 },
    },
  },
  {
    name: "harvest-daily",
    queueName: "harvest-daily",
    options: {
      concurrency: 1,
      lockDuration: 600_000,
      prefix: "{harvest}",
      removeOnComplete: { count: 30 },
      removeOnFail: { count: 30 },
    },
  },
  {
    name: "gbp-automation",
    queueName: "gbp-automation-deployment",
    options: {
      concurrency: 1,
      lockDuration: 1_200_000,
      prefix: "{gbp}",
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  },
  {
    name: "os-ingest",
    queueName: "os-ingest",
    options: {
      concurrency: 2,
      prefix: "{os}",
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 25 },
    },
  },
  {
    name: "os-convert",
    queueName: "os-convert",
    options: {
      concurrency: 2,
      prefix: "{os}",
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 25 },
    },
  },
  {
    name: "os-purge",
    queueName: "os-purge",
    options: {
      concurrency: 2,
      prefix: "{os}",
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 25 },
    },
  },
  {
    name: "os-lock-reaper",
    queueName: "os-lock-reaper",
    options: {
      concurrency: 1,
      prefix: "{os}",
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 25 },
    },
  },
] as const satisfies readonly WorkerRegistryDefinition[];

export type WorkerDefinition = (typeof WORKER_REGISTRY)[number];
export type WorkerName = WorkerDefinition["name"];

export const PRODUCTION_WORKER_NAMES: readonly WorkerName[] =
  WORKER_REGISTRY.map(({ name }) => name);

const WORKER_NAMES = new Set<string>(PRODUCTION_WORKER_NAMES);

export function isWorkerName(value: string): value is WorkerName {
  return WORKER_NAMES.has(value);
}

export function parseRequestedWorkerNames(
  rawWorkerNames: string | undefined,
): WorkerName[] {
  if (!rawWorkerNames?.trim()) return [];

  const requestedNames = [
    ...new Set(
      rawWorkerNames
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ];
  const invalidNames = requestedNames.filter((name) => !isWorkerName(name));

  if (invalidNames.length > 0) {
    throw new Error(
      `Unknown worker name(s): ${invalidNames.join(", ")}. Allowed workers: ${PRODUCTION_WORKER_NAMES.join(", ")}.`,
    );
  }

  return requestedNames.filter(isWorkerName);
}

export function selectWorkerDefinitions(
  isWorktreeTestMode: boolean,
  rawWorkerNames: string | undefined,
): readonly WorkerDefinition[] {
  const requestedNames = parseRequestedWorkerNames(rawWorkerNames);
  if (!isWorktreeTestMode) return WORKER_REGISTRY;

  const requestedNameSet = new Set<WorkerName>(requestedNames);
  return WORKER_REGISTRY.filter(({ name }) => requestedNameSet.has(name));
}
