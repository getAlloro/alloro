import { spawn, type ChildProcess } from "node:child_process";
import { chmod, mkdir, open, readFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  STARTUP_POLL_INTERVAL_MS,
  STARTUP_TIMEOUT_MS,
  STOP_TIMEOUT_MS,
} from "../config";

export interface LoggedChildProcess {
  name: string;
  pid: number;
  logPath: string;
  process: ChildProcess;
}

interface ReadyProcessOptions<T> {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  logPath: string;
  readyPath: string;
  validateReady: (value: unknown) => T;
}

function combinedError(message: string, errors: unknown[]): Error {
  const details = errors
    .map((error) => (error instanceof Error ? error.message : String(error)))
    .join(" | ");
  return new Error(`${message} ${details}`);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function waitForSpawn(child: ChildProcess, name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const handleSpawn = (): void => {
      child.off("error", handleError);
      resolve();
    };
    const handleError = (error: Error): void => {
      child.off("spawn", handleSpawn);
      reject(new Error(`${name} could not start: ${error.message}`));
    };

    child.once("spawn", handleSpawn);
    child.once("error", handleError);
  });
}

async function readReadyFile<T>(
  child: LoggedChildProcess,
  readyPath: string,
  validateReady: (value: unknown) => T,
): Promise<T> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.process.exitCode !== null || child.process.signalCode !== null) {
      throw new Error(
        `${child.name} exited before becoming ready. See ${child.logPath}.`,
      );
    }

    try {
      const content = await readFile(readyPath, "utf8");
      return validateReady(JSON.parse(content) as unknown);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await delay(STARTUP_POLL_INTERVAL_MS);
  }

  throw new Error(
    `${child.name} did not become ready within ${STARTUP_TIMEOUT_MS}ms. See ${child.logPath}.`,
  );
}

export async function startReadyProcess<T>(
  options: ReadyProcessOptions<T>,
): Promise<{ child: LoggedChildProcess; ready: T }> {
  await mkdir(path.dirname(options.logPath), { recursive: true, mode: 0o700 });
  await rm(options.readyPath, { force: true });
  const logHandle = await open(options.logPath, "a", 0o600);
  await chmod(options.logPath, 0o600);

  const processHandle = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", logHandle.fd, logHandle.fd],
  });
  try {
    await waitForSpawn(processHandle, options.name);
  } finally {
    await logHandle.close();
  }

  if (!processHandle.pid) {
    throw new Error(`${options.name} started without a process ID.`);
  }

  const child: LoggedChildProcess = {
    name: options.name,
    pid: processHandle.pid,
    logPath: options.logPath,
    process: processHandle,
  };

  try {
    const ready = await readReadyFile(child, options.readyPath, options.validateReady);
    return { child, ready };
  } catch (error) {
    try {
      await stopLoggedProcess(child);
    } catch (cleanupError) {
      throw combinedError(
        `${options.name} startup and cleanup both failed.`,
        [error, cleanupError],
      );
    }
    throw error;
  }
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.off("exit", handleExit);
      resolve(false);
    }, timeoutMs);
    const handleExit = (): void => {
      clearTimeout(timeout);
      resolve(true);
    };
    child.once("exit", handleExit);
  });
}

export async function stopLoggedProcess(child: LoggedChildProcess): Promise<void> {
  if (child.process.exitCode !== null || child.process.signalCode !== null) return;

  child.process.kill("SIGTERM");
  if (await waitForExit(child.process, STOP_TIMEOUT_MS)) return;

  child.process.kill("SIGKILL");
  if (!(await waitForExit(child.process, 2_000))) {
    throw new Error(`${child.name} process ${child.pid} could not be stopped.`);
  }
}
