import { randomBytes } from "node:crypto";
import { chmod, rename, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import {
  ERROR_FILE_NAME,
  MANIFEST_FILE_NAME,
  SUPERVISOR_LOG_FILE_NAME,
} from "./config";
import {
  startReadyProcess,
  stopLoggedProcess,
  type LoggedChildProcess,
} from "./feature-services/service.child-process";
import {
  startDatabaseRuntime,
  stopDatabaseRuntime,
  type DatabaseRuntime,
} from "./feature-services/service.database-runtime";
import { writeRuntimeManifest, readRuntimeRequest } from "./feature-utils/util.manifest";
import { seedFixtureProfile } from "./fixtures/seed";
import { FIXTURE_IDENTITIES, FIXTURE_IDS } from "./fixtures/constants";
import {
  startAnthropicFixtureService,
  type AnthropicFixtureServiceHandle,
} from "./services/anthropic-fixture";
import {
  startEmailCaptureService,
  type EmailCaptureServiceHandle,
} from "./services/email-capture";
import { parseRequestedWorkerNames } from "../../src/workers/feature-utils/util.worker-registry";
import {
  WORKTREE_MANIFEST_VERSION,
  type RuntimeManifest,
  type RuntimeRequest,
} from "./types";

const LOOPBACK_HOST = "127.0.0.1";
const BOOTSTRAP_PATH = "/__worktree/bootstrap";
const HEALTH_PATH = "/api/health/db";
const HEALTH_TIMEOUT_MS = 30_000;
const WEB_PORT_BIND_ATTEMPTS = 5;

interface ApiReady {
  host: typeof LOOPBACK_HOST;
  port: number;
  pid: number;
  healthUrl: string;
}

interface WebReady {
  host: typeof LOOPBACK_HOST;
  hostname: string;
  port: number;
  pid: number;
  origin: string;
}

interface WorkerReady {
  pid: number;
  runtimeId: string;
  workers: string[];
  recurringScheduleCount: number;
}

interface RuntimeState {
  database: DatabaseRuntime | null;
  emailCapture: EmailCaptureServiceHandle | null;
  anthropicFixture: AnthropicFixtureServiceHandle | null;
  api: LoggedChildProcess | null;
  web: LoggedChildProcess | null;
  worker: LoggedChildProcess | null;
  tokenFile: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireLoopbackPort(
  value: unknown,
  service: string,
): Record<string, unknown> {
  if (
    !isRecord(value)
    || value.host !== LOOPBACK_HOST
    || !Number.isInteger(value.port)
    || Number(value.port) < 1
    || Number(value.port) > 65_535
    || !Number.isInteger(value.pid)
    || Number(value.pid) < 1
  ) {
    throw new Error(`${service} readiness file is invalid.`);
  }
  return value;
}

function combinedError(message: string, errors: unknown[]): Error {
  const details = errors
    .map((error) => (error instanceof Error ? error.message : String(error)))
    .join(" | ");
  return new Error(`${message} ${details}`);
}

function validateApiReady(value: unknown): ApiReady {
  const ready = requireLoopbackPort(value, "API");
  if (typeof ready.healthUrl !== "string") {
    throw new Error("API readiness healthUrl is invalid.");
  }
  return ready as unknown as ApiReady;
}

function validateWebReady(
  value: unknown,
  request: RuntimeRequest,
): WebReady {
  const ready = requireLoopbackPort(value, "Vite");
  if (
    ready.hostname !== `${request.runtimeId}.localhost`
    || typeof ready.origin !== "string"
    || ready.origin !== `http://${ready.hostname}:${ready.port}`
  ) {
    throw new Error("Vite readiness origin is invalid.");
  }
  return ready as unknown as WebReady;
}

function validateWorkerReady(
  value: unknown,
  request: RuntimeRequest,
): WorkerReady {
  if (
    !isRecord(value)
    || !Number.isInteger(value.pid)
    || value.runtimeId !== request.runtimeId
    || !Array.isArray(value.workers)
    || !value.workers.every((worker) => typeof worker === "string")
    || value.recurringScheduleCount !== 0
  ) {
    throw new Error("Worker readiness file is invalid.");
  }
  const expectedWorkers = [...request.workers].sort();
  const actualWorkers = [...value.workers].sort();
  if (JSON.stringify(actualWorkers) !== JSON.stringify(expectedWorkers)) {
    throw new Error("Worker readiness does not match the requested allowlist.");
  }
  return value as unknown as WorkerReady;
}

function argumentValue(args: string[], flag: string): string | null {
  const direct = args.find((arg) => arg.startsWith(`${flag}=`));
  if (direct) return direct.slice(flag.length + 1);
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function parseInvocation(args: string[]): { requestPath: string; runtimeId: string } {
  const requestPath = argumentValue(args, "--request");
  const runtimeId = argumentValue(args, "--runtime-id");
  if (!requestPath || !path.isAbsolute(requestPath)) {
    throw new Error("Supervisor --request must be an absolute path.");
  }
  if (!runtimeId) {
    throw new Error("Supervisor --runtime-id is required.");
  }
  return { requestPath, runtimeId };
}

function requiredEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = environment[name];
  if (!value) throw new Error(`Database runtime did not provide ${name}.`);
  return value;
}

function baseChildEnvironment(
  request: RuntimeRequest,
  database: DatabaseRuntime,
  emailCapture: EmailCaptureServiceHandle,
  anthropicFixture: AnthropicFixtureServiceHandle,
  jwtSecret: string,
): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    NODE_ENV: "production",
    LOG_LEVEL: "warn",
    ALLORO_WORKTREE_TEST_MODE: "true",
    ALLORO_WORKTREE_RUNTIME_ID: request.runtimeId,
    ...database.applicationEnvironment,
    JWT_SECRET: jwtSecret,
    ADMIN_ALLOWED_DOMAIN: "getalloro.com",
    ADMIN_EMAILS: FIXTURE_IDENTITIES.adminEmail,
    EMAIL_DEFAULT_TRANSPORT: "n8n",
    ALLORO_EMAIL_SERVICE_WEBHOOK: emailCapture.webhookUrl,
    ALLORO_EMAIL_LOG_DIR: path.join(request.runtimeDir, "email-service"),
    ANTHROPIC_API_KEY: `worktree-${randomBytes(24).toString("hex")}`,
    ANTHROPIC_BASE_URL: anthropicFixture.baseUrl,
    GBP_AUTOMATION_POST_LLM_MODEL: "claude-worktree-fixture",
    STRIPE_MODE: "test",
  };
}

async function writePrivateFile(filePath: string, content: string): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, filePath);
}

async function removeIfPresent(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function waitForHealth(
  web: WebReady,
): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  const loopbackUrl = `http://${LOOPBACK_HOST}:${web.port}${HEALTH_PATH}`;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(loopbackUrl, {
        headers: { host: web.hostname },
        signal: AbortSignal.timeout(3_000),
      });
      if (response.ok) return;
    } catch {
      // The API and proxy may still be reaching readiness.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Worktree app health check did not pass within ${HEALTH_TIMEOUT_MS}ms.`);
}

async function reserveLoopbackPort(): Promise<number> {
  const server = createServer();
  const port = await new Promise<number>((resolve, reject) => {
    const handleError = (error: Error): void => {
      server.off("listening", handleListening);
      reject(error);
    };
    const handleListening = (): void => {
      server.off("error", handleError);
      const address = server.address();
      if (!address || typeof address === "string" || address.address !== LOOPBACK_HOST) {
        reject(new Error("OS port reservation did not bind to IPv4 loopback."));
        return;
      }
      resolve(address.port);
    };
    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(0, LOOPBACK_HOST);
  });
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  return port;
}

async function cleanupState(state: RuntimeState): Promise<void> {
  const failures: Error[] = [];
  const attempt = async (label: string, action: () => Promise<void>): Promise<void> => {
    try {
      await action();
    } catch (error) {
      failures.push(
        new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`),
      );
    }
  };

  if (state.web) await attempt("stop Vite", () => stopLoggedProcess(state.web!));
  if (state.worker) {
    await attempt("stop worker", () => stopLoggedProcess(state.worker!));
  }
  if (state.api) await attempt("stop API", () => stopLoggedProcess(state.api!));
  if (state.anthropicFixture) {
    await attempt("stop Anthropic fixture", state.anthropicFixture.close);
  }
  if (state.emailCapture) {
    await attempt("stop email capture", state.emailCapture.close);
  }
  if (state.database) {
    await attempt("stop database runtime", () => stopDatabaseRuntime(state.database!));
  }
  if (state.tokenFile) {
    await attempt("remove bootstrap token", () => removeIfPresent(state.tokenFile!));
    await attempt("remove consuming bootstrap token", () =>
      removeIfPresent(`${state.tokenFile!}.consuming`),
    );
  }

  if (failures.length > 0) {
    throw combinedError("Worktree runtime teardown failed.", failures);
  }
}

async function startRuntime(
  request: RuntimeRequest,
  stopRequested: () => boolean,
): Promise<{ manifest: RuntimeManifest; state: RuntimeState }> {
  const state: RuntimeState = {
    database: null,
    emailCapture: null,
    anthropicFixture: null,
    api: null,
    web: null,
    worker: null,
    tokenFile: null,
  };
  const assertRunning = (): void => {
    if (stopRequested()) throw new Error("Runtime startup was stopped.");
  };

  try {
    parseRequestedWorkerNames(request.workers.join(","));
    state.database = await startDatabaseRuntime(request);
    assertRunning();

    process.env.ALLORO_WORKTREE_TEST_MODE = "true";
    const fixtureDatabase = {
      host: requiredEnvironmentValue(
        state.database.applicationEnvironment,
        "DB_HOST",
      ),
      port: Number(
        requiredEnvironmentValue(
          state.database.applicationEnvironment,
          "DB_PORT",
        ),
      ),
      user: requiredEnvironmentValue(
        state.database.applicationEnvironment,
        "DB_USER",
      ),
      password: requiredEnvironmentValue(
        state.database.applicationEnvironment,
        "DB_PASSWORD",
      ),
      database: requiredEnvironmentValue(
        state.database.applicationEnvironment,
        "DB_NAME",
      ),
    };
    await seedFixtureProfile(fixtureDatabase, request.fixture);
    // Exercise idempotency on every disposable startup; row counts must remain stable.
    await seedFixtureProfile(fixtureDatabase, request.fixture);
    assertRunning();

    const emailEvidencePath = path.join(request.runtimeDir, "email-capture.jsonl");
    const anthropicEvidencePath = path.join(
      request.runtimeDir,
      "anthropic-capture.jsonl",
    );
    state.emailCapture = await startEmailCaptureService({
      evidencePath: emailEvidencePath,
    });
    state.anthropicFixture = await startAnthropicFixtureService({
      evidencePath: anthropicEvidencePath,
    });
    assertRunning();

    const jwtSecret = randomBytes(48).toString("hex");
    process.env.JWT_SECRET = jwtSecret;
    const { generateToken } = await import(
      "../../src/controllers/auth-otp/feature-services/service.jwt-management"
    );
    const bootstrapToken = generateToken(
      FIXTURE_IDS.adminUser,
      FIXTURE_IDENTITIES.adminEmail,
    );
    state.tokenFile = path.join(request.runtimeDir, "bootstrap-token");
    await writePrivateFile(state.tokenFile, bootstrapToken);

    const guardPath = path.join(
      request.worktree.worktreePath,
      "scripts/test-worktree/outbound-guard.cjs",
    );
    const childEnvironment = baseChildEnvironment(
      request,
      state.database,
      state.emailCapture,
      state.anthropicFixture,
      jwtSecret,
    );
    const apiReadyPath = path.join(request.runtimeDir, "api-ready.json");
    const apiLogPath = path.join(request.runtimeDir, "api.log");
    const apiResult = await startReadyProcess({
      name: "Alloro API",
      command: process.execPath,
      args: [
        "--require",
        guardPath,
        "--import",
        "tsx",
        path.join(request.worktree.worktreePath, "scripts/test-worktree/start-api.ts"),
      ],
      cwd: request.worktree.worktreePath,
      env: {
        ...childEnvironment,
        ALLORO_WORKTREE_API_READY_FILE: apiReadyPath,
      },
      logPath: apiLogPath,
      readyPath: apiReadyPath,
      validateReady: validateApiReady,
    });
    state.api = apiResult.child;
    assertRunning();

    const webReadyPath = path.join(request.runtimeDir, "web-ready.json");
    const webLogPath = path.join(request.runtimeDir, "web.log");
    let webResult: {
      child: LoggedChildProcess;
      ready: WebReady;
    } | null = null;
    const webStartupErrors: unknown[] = [];
    for (
      let attempt = 1;
      attempt <= WEB_PORT_BIND_ATTEMPTS && !webResult;
      attempt += 1
    ) {
      const webPort = await reserveLoopbackPort();
      try {
        webResult = await startReadyProcess({
          name: "Alloro Vite frontend",
          command: process.execPath,
          args: [
            "--require",
            guardPath,
            path.join(
              request.worktree.worktreePath,
              "frontend/node_modules/vite/bin/vite.js",
            ),
            "--clearScreen=false",
          ],
          cwd: path.join(request.worktree.worktreePath, "frontend"),
          env: {
            ...childEnvironment,
            ALLORO_WORKTREE_API_ORIGIN: `http://${LOOPBACK_HOST}:${apiResult.ready.port}`,
            ALLORO_WORKTREE_BOOTSTRAP_TOKEN_FILE: state.tokenFile,
            ALLORO_WORKTREE_WEB_READY_FILE: webReadyPath,
            ALLORO_WORKTREE_WEB_PORT: String(webPort),
          },
          logPath: webLogPath,
          readyPath: webReadyPath,
          validateReady: (value) => validateWebReady(value, request),
        });
      } catch (error) {
        webStartupErrors.push(error);
      }
    }
    if (!webResult) {
      throw combinedError(
        `Alloro Vite frontend could not bind after ${WEB_PORT_BIND_ATTEMPTS} OS-assigned port attempts.`,
        webStartupErrors,
      );
    }
    state.web = webResult.child;
    assertRunning();

    let workerLogPath: string | null = null;
    if (request.workers.length > 0) {
      const workerReadyPath = path.join(request.runtimeDir, "worker-ready.json");
      workerLogPath = path.join(request.runtimeDir, "worker.log");
      const workerResult = await startReadyProcess({
        name: "Alloro worker",
        command: process.execPath,
        args: [
          "--require",
          guardPath,
          "--import",
          "tsx",
          path.join(request.worktree.worktreePath, "src/workers/worker.ts"),
        ],
        cwd: request.worktree.worktreePath,
        env: {
          ...childEnvironment,
          ALLORO_WORKTREE_WORKERS: request.workers.join(","),
          ALLORO_WORKTREE_WORKER_READY_FILE: workerReadyPath,
        },
        logPath: workerLogPath,
        readyPath: workerReadyPath,
        validateReady: (value) => validateWorkerReady(value, request),
      });
      state.worker = workerResult.child;
    }
    assertRunning();

    await waitForHealth(webResult.ready);

    const manifestPath = path.join(request.runtimeDir, MANIFEST_FILE_NAME);
    const appOrigin = webResult.ready.origin;
    const manifest: RuntimeManifest = {
      schemaVersion: WORKTREE_MANIFEST_VERSION,
      runtimeId: request.runtimeId,
      status: "ready",
      createdAt: request.createdAt,
      worktree: request.worktree,
      fixture: request.fixture,
      appOrigin,
      authenticatedBootstrapUrl: `${appOrigin}${BOOTSTRAP_PATH}`,
      healthUrl: `${appOrigin}${HEALTH_PATH}`,
      ports: {
        api: apiResult.ready.port,
        web: webResult.ready.port,
        postgres: state.database.postgresPort,
        redis: state.database.redisPort,
        emailCapture: state.emailCapture.port,
        anthropicFixture: state.anthropicFixture.port,
      },
      dependencies: [
        {
          name: "postgres",
          kind: "container",
          identifier: `${state.database.composeProject}:postgres`,
        },
        {
          name: "redis",
          kind: "container",
          identifier: `${state.database.composeProject}:redis`,
        },
        {
          name: "api",
          kind: "process",
          identifier: String(state.api.pid),
        },
        {
          name: "web",
          kind: "process",
          identifier: String(state.web.pid),
        },
        {
          name: "email-capture",
          kind: "process",
          identifier: String(process.pid),
        },
        {
          name: "anthropic-fixture",
          kind: "process",
          identifier: String(process.pid),
        },
        ...(state.worker
          ? [
              {
                name: "worker",
                kind: "process" as const,
                identifier: String(state.worker.pid),
              },
            ]
          : []),
      ],
      safety: {
        database: "local-disposable",
        email: "local-capture",
        queue: "isolated-container",
        workers: [...request.workers],
        recurringSchedules: false,
        externalWrites: "disabled",
        environment: "allowlisted",
      },
      logs: {
        supervisor: path.join(request.runtimeDir, SUPERVISOR_LOG_FILE_NAME),
        api: apiLogPath,
        web: webLogPath,
        emailCapture: emailEvidencePath,
        anthropicFixture: anthropicEvidencePath,
        worker: workerLogPath,
      },
      manifestPath,
      stopCommand: `npm run test:worktree -- stop --manifest ${JSON.stringify(manifestPath)}`,
      supervisorPid: process.pid,
      composeProject: state.database.composeProject,
      keep: request.keep,
    };
    await writeRuntimeManifest(manifestPath, manifest);
    return { manifest, state };
  } catch (error) {
    try {
      await cleanupState(state);
    } catch (cleanupError) {
      throw combinedError(
        "Runtime startup and cleanup both failed.",
        [error, cleanupError],
      );
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const invocation = parseInvocation(process.argv.slice(2));
  const request = await readRuntimeRequest(invocation.requestPath);
  if (request.runtimeId !== invocation.runtimeId) {
    throw new Error("Supervisor runtime ID does not match its request.");
  }
  if (path.resolve(request.worktree.worktreePath) !== process.cwd()) {
    throw new Error("Supervisor current directory does not match the verified worktree.");
  }

  let stopRequested = false;
  let resolveStop: (() => void) | null = null;
  const stopped = new Promise<void>((resolve) => {
    resolveStop = resolve;
  });
  const handleSignal = (): void => {
    stopRequested = true;
    resolveStop?.();
  };
  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

  const { state } = await startRuntime(request, () => stopRequested);
  await stopped;
  await cleanupState(state);
}

void main().catch(async (error: unknown) => {
  const invocation = parseInvocation(process.argv.slice(2));
  const request = await readRuntimeRequest(invocation.requestPath).catch(() => null);
  const message = error instanceof Error ? error.message : String(error);
  if (request) {
    await writePrivateFile(
      path.join(request.runtimeDir, ERROR_FILE_NAME),
      `${JSON.stringify({ message }, null, 2)}\n`,
    ).catch((writeError: unknown) => {
      process.stderr.write(
        `Could not write startup error: ${writeError instanceof Error ? writeError.message : String(writeError)}\n`,
      );
    });
  }
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
