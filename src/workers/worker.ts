import * as dotenv from "dotenv";
import { chmod, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { isWorktreeTestMode } from "./feature-utils/util.worker-runtime-config";

function loadWorkerEnvironment(): void {
  if (isWorktreeTestMode(process.env)) return;
  dotenv.config();
}

async function writeWorktreeReadyFile(value: unknown): Promise<void> {
  if (!isWorktreeTestMode(process.env)) return;
  const readyPath = process.env.ALLORO_WORKTREE_WORKER_READY_FILE;
  if (!readyPath || !path.isAbsolute(readyPath)) {
    throw new Error(
      "ALLORO_WORKTREE_WORKER_READY_FILE must be an absolute path in worktree test mode.",
    );
  }

  const temporaryPath = `${readyPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, readyPath);
}

async function main(): Promise<void> {
  loadWorkerEnvironment();

  const [{ startWorkerRuntime }, { default: logger }] = await Promise.all([
    import("./feature-services/service.worker-runtime"),
    import("../lib/logger"),
  ]);
  const runtime = await startWorkerRuntime(process.env);
  let shutdownPromise: Promise<void> | null = null;

  const handleSignal = (signal: NodeJS.Signals): void => {
    shutdownPromise ??= (async () => {
      logger.info(
        {
          runtimeId: runtime.config.runtimeId,
          signal,
          workerCount: runtime.workers.length,
        },
        "[MINDS-WORKER] Shutting down worker runtime",
      );
      await runtime.close();
      logger.info(
        { runtimeId: runtime.config.runtimeId },
        "[MINDS-WORKER] Worker runtime shut down",
      );
    })();

    void shutdownPromise
      .then(() => {
        process.exit(0);
      })
      .catch((error: unknown) => {
        logger.error(
          { err: error, runtimeId: runtime.config.runtimeId, signal },
          "[MINDS-WORKER] Worker runtime shutdown failed",
        );
        process.exit(1);
      });
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

  logger.info(
    {
      isWorktreeTestMode: runtime.config.isWorktreeTestMode,
      runtimeId: runtime.config.runtimeId,
      workerNames: runtime.config.workerDefinitions.map(({ name }) => name),
      recurringScheduleCount: runtime.config.recurringSchedules.length,
    },
    "[MINDS-WORKER] Worker runtime ready",
  );
  await writeWorktreeReadyFile({
    pid: process.pid,
    runtimeId: runtime.config.runtimeId,
    workers: runtime.config.workerDefinitions.map(({ name }) => name),
    recurringScheduleCount: runtime.config.recurringSchedules.length,
  });
}

void main().catch(async (error: unknown) => {
  const { default: logger } = await import("../lib/logger");
  logger.error({ err: error }, "[MINDS-WORKER] Worker runtime startup failed");
  process.exitCode = 1;
});
