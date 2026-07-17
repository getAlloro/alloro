import {
  selectWorkerDefinitions,
  type WorkerDefinition,
} from "./util.worker-registry";
import {
  RECURRING_SCHEDULE_REGISTRY,
  type RegisteredSchedule,
} from "./util.worker-schedule-registry";

export const WORKTREE_TEST_MODE_ENV = "ALLORO_WORKTREE_TEST_MODE";
export const WORKTREE_WORKERS_ENV = "ALLORO_WORKTREE_WORKERS";
export const WORKTREE_RUNTIME_ID_ENV = "ALLORO_WORKTREE_RUNTIME_ID";

const DEFAULT_REDIS_HOST = "127.0.0.1";
const DEFAULT_REDIS_PORT = 6379;
const MIN_PORT = 1;
const MAX_PORT = 65_535;
const RUNTIME_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export interface WorkerRedisConfig {
  host: string;
  port: number;
  isTlsEnabled: boolean;
}

export interface WorkerRuntimeConfig {
  isWorktreeTestMode: boolean;
  runtimeId: string | null;
  workerDefinitions: readonly WorkerDefinition[];
  recurringSchedules: readonly RegisteredSchedule[];
  redis: WorkerRedisConfig;
}

function parseOptionalBoolean(
  envName: string,
  rawValue: string | undefined,
): boolean {
  if (rawValue === undefined || rawValue === "false") return false;
  if (rawValue === "true") return true;
  throw new Error(`${envName} must be exactly "true" or "false" when set.`);
}

export function isWorktreeTestMode(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return parseOptionalBoolean(
    WORKTREE_TEST_MODE_ENV,
    env[WORKTREE_TEST_MODE_ENV],
  );
}

function parseRedisPort(rawPort: string | undefined): number {
  const value = rawPort ?? String(DEFAULT_REDIS_PORT);
  if (!/^\d+$/.test(value)) {
    throw new Error("REDIS_PORT must be an integer.");
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(`REDIS_PORT must be between ${MIN_PORT} and ${MAX_PORT}.`);
  }
  return port;
}

function isLoopbackHost(host: string): boolean {
  const normalizedHost = host.trim().toLowerCase().replace(/^\[(.*)\]$/, "$1");
  return (
    normalizedHost === "localhost" ||
    normalizedHost.endsWith(".localhost") ||
    normalizedHost === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalizedHost)
  );
}

function requireWorktreeRuntimeId(env: NodeJS.ProcessEnv): string {
  const runtimeId = env[WORKTREE_RUNTIME_ID_ENV]?.trim();
  if (!runtimeId) {
    throw new Error(
      `${WORKTREE_RUNTIME_ID_ENV} is required in worktree test mode.`,
    );
  }
  if (!RUNTIME_ID_PATTERN.test(runtimeId)) {
    throw new Error(
      `${WORKTREE_RUNTIME_ID_ENV} contains invalid characters or is too long.`,
    );
  }
  return runtimeId;
}

function resolveRedisConfig(
  env: NodeJS.ProcessEnv,
  worktreeTestMode: boolean,
): WorkerRedisConfig {
  const host = env.REDIS_HOST?.trim() || DEFAULT_REDIS_HOST;
  const port = parseRedisPort(env.REDIS_PORT);
  const isTlsEnabled = parseOptionalBoolean("REDIS_TLS", env.REDIS_TLS);

  if (worktreeTestMode && (!env.REDIS_HOST || !env.REDIS_PORT)) {
    throw new Error(
      "REDIS_HOST and REDIS_PORT are required in worktree test mode.",
    );
  }
  if (worktreeTestMode && !isLoopbackHost(host)) {
    throw new Error(
      `Worktree workers require a loopback Redis host; received "${host}".`,
    );
  }
  if (worktreeTestMode && isTlsEnabled) {
    throw new Error("REDIS_TLS must be false in worktree test mode.");
  }

  return { host, port, isTlsEnabled };
}

export function resolveWorkerRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): WorkerRuntimeConfig {
  const worktreeTestMode = isWorktreeTestMode(env);
  const workerDefinitions = selectWorkerDefinitions(
    worktreeTestMode,
    env[WORKTREE_WORKERS_ENV],
  );
  const runtimeId = worktreeTestMode ? requireWorktreeRuntimeId(env) : null;

  return {
    isWorktreeTestMode: worktreeTestMode,
    runtimeId,
    workerDefinitions,
    recurringSchedules: worktreeTestMode
      ? []
      : RECURRING_SCHEDULE_REGISTRY,
    redis: resolveRedisConfig(env, worktreeTestMode),
  };
}
