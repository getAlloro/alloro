import { spawn } from "node:child_process";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  ERROR_FILE_NAME,
  MANIFEST_FILE_NAME,
  REQUEST_FILE_NAME,
  STARTUP_POLL_INTERVAL_MS,
  STARTUP_TIMEOUT_MS,
  STOP_TIMEOUT_MS,
  SUPERVISOR_LOG_FILE_NAME,
  composeProjectName,
} from "../config";
import { readRuntimeManifest, writeRuntimeRequest } from "../feature-utils/util.manifest";
import type { RuntimeManifest, RuntimeRequest } from "../types";
import { runCommand } from "../feature-utils/util.command";

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function readStartupError(errorPath: string): Promise<string | null> {
  try {
    const content = await readFile(errorPath, "utf8");
    const parsed = JSON.parse(content) as { message?: unknown };
    return typeof parsed.message === "string" ? parsed.message : "Runtime startup failed.";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
}

async function waitForManifest(runtimeDir: string): Promise<RuntimeManifest> {
  const manifestPath = path.join(runtimeDir, MANIFEST_FILE_NAME);
  const errorPath = path.join(runtimeDir, ERROR_FILE_NAME);
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      return await readRuntimeManifest(manifestPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        const startupError = await readStartupError(errorPath);
        if (startupError) throw new Error(startupError);
        throw error;
      }
    }
    const startupError = await readStartupError(errorPath);
    if (startupError) throw new Error(startupError);
    await delay(STARTUP_POLL_INTERVAL_MS);
  }

  throw new Error(`Runtime did not become ready within ${STARTUP_TIMEOUT_MS}ms.`);
}

export async function launchSupervisor(request: RuntimeRequest): Promise<RuntimeManifest> {
  await mkdir(request.runtimeDir, { recursive: true, mode: 0o700 });
  const requestPath = path.join(request.runtimeDir, REQUEST_FILE_NAME);
  const logPath = path.join(request.runtimeDir, SUPERVISOR_LOG_FILE_NAME);
  await writeRuntimeRequest(requestPath, request);

  const logHandle = await open(logPath, "a", 0o600);
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      path.join(request.worktree.worktreePath, "scripts/test-worktree/supervisor.ts"),
      "--request",
      requestPath,
      "--runtime-id",
      request.runtimeId,
    ],
    {
      cwd: request.worktree.worktreePath,
      detached: true,
      stdio: ["ignore", logHandle.fd, logHandle.fd],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
      },
    },
  );
  child.unref();
  await logHandle.close();

  try {
    return await waitForManifest(request.runtimeDir);
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    if (child.pid) {
      try {
        process.kill(child.pid, "SIGTERM");
        if (!(await waitForExit(child.pid))) {
          process.kill(child.pid, "SIGKILL");
          if (!(await waitForExit(child.pid))) {
            cleanupErrors.push(
              new Error(`Supervisor ${child.pid} did not exit after SIGKILL.`),
            );
          }
        }
      } catch (signalError) {
        if ((signalError as NodeJS.ErrnoException).code !== "ESRCH") {
          cleanupErrors.push(signalError);
        }
      }
    }
    if (!request.keep) {
      try {
        await rm(request.runtimeDir, { recursive: true, force: true });
      } catch (removeError) {
        cleanupErrors.push(removeError);
      }
    }
    if (cleanupErrors.length > 0) {
      const detail = cleanupErrors
        .map((cleanupError) =>
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        )
        .join(" | ");
      throw new Error(
        `${error instanceof Error ? error.message : String(error)} Startup cleanup failed: ${detail}`,
      );
    }
    throw error;
  }
}

async function isOwnedSupervisor(pid: number, runtimeId: string): Promise<boolean> {
  try {
    const result = await runCommand("ps", ["-p", String(pid), "-o", "command="], process.cwd());
    return result.stdout.includes("scripts/test-worktree/supervisor.ts")
      && result.stdout.includes(runtimeId);
  } catch {
    return false;
  }
}

async function waitForExit(pid: number): Promise<boolean> {
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
      await delay(200);
    } catch {
      return true;
    }
  }
  return false;
}

async function dockerResourceIds(
  resource: "ps" | "network" | "volume",
  composeProject: string,
  cwd: string,
): Promise<string[]> {
  const args = resource === "ps"
    ? ["ps", "-aq", "--filter", `label=com.docker.compose.project=${composeProject}`]
    : [
        resource,
        "ls",
        "-q",
        "--filter",
        `label=com.docker.compose.project=${composeProject}`,
      ];
  const result = await runCommand("docker", args, cwd);
  return result.stdout.split("\n").map((id) => id.trim()).filter(Boolean);
}

async function removeComposeProjectResources(
  composeProject: string,
  cwd: string,
): Promise<void> {
  const containerIds = await dockerResourceIds("ps", composeProject, cwd);
  if (containerIds.length > 0) {
    await runCommand("docker", ["rm", "-f", "-v", ...containerIds], cwd);
  }

  const volumeIds = await dockerResourceIds("volume", composeProject, cwd);
  if (volumeIds.length > 0) {
    await runCommand("docker", ["volume", "rm", ...volumeIds], cwd);
  }

  const networkIds = await dockerResourceIds("network", composeProject, cwd);
  if (networkIds.length > 0) {
    await runCommand("docker", ["network", "rm", ...networkIds], cwd);
  }
}

export async function stopRuntime(manifest: RuntimeManifest): Promise<void> {
  if (await isOwnedSupervisor(manifest.supervisorPid, manifest.runtimeId)) {
    process.kill(manifest.supervisorPid, "SIGTERM");
    if (!(await waitForExit(manifest.supervisorPid))) {
      throw new Error(
        `Supervisor ${manifest.supervisorPid} did not stop within ${STOP_TIMEOUT_MS}ms.`,
      );
    }
  }

  await removeComposeProjectResources(
    composeProjectName(manifest.runtimeId),
    manifest.worktree.worktreePath,
  ).catch((error: unknown) => {
    throw new Error(`Failed to tear down runtime containers: ${String(error)}`);
  });

  await rm(path.dirname(manifest.manifestPath), { recursive: true, force: true });
}
