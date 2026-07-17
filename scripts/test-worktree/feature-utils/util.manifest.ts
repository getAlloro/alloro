import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  WORKTREE_MANIFEST_VERSION,
  type RuntimeManifest,
  type RuntimeRequest,
} from "../types";
import { composeProjectName } from "../config";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireString(record: Record<string, unknown>, key: string): void {
  if (typeof record[key] !== "string" || record[key] === "") {
    throw new Error(`Runtime manifest field "${key}" must be a non-empty string.`);
  }
}

export function validateRuntimeManifest(value: unknown): RuntimeManifest {
  if (!isRecord(value)) {
    throw new Error("Runtime manifest must be a JSON object.");
  }
  if (value.schemaVersion !== WORKTREE_MANIFEST_VERSION) {
    throw new Error(`Unsupported runtime manifest version: ${String(value.schemaVersion)}`);
  }

  for (const key of [
    "runtimeId",
    "createdAt",
    "appOrigin",
    "authenticatedBootstrapUrl",
    "healthUrl",
    "manifestPath",
    "stopCommand",
    "composeProject",
  ]) {
    requireString(value, key);
  }

  if (value.status !== "ready") {
    throw new Error('Runtime manifest status must be "ready".');
  }
  if (!Number.isInteger(value.supervisorPid) || Number(value.supervisorPid) <= 0) {
    throw new Error("Runtime manifest supervisorPid must be a positive integer.");
  }
  if (!isRecord(value.worktree) || !isRecord(value.ports) || !isRecord(value.safety)) {
    throw new Error("Runtime manifest is missing worktree, ports, or safety details.");
  }
  if (value.composeProject !== composeProjectName(String(value.runtimeId))) {
    throw new Error("Runtime manifest composeProject does not match its runtime ID.");
  }

  return value as unknown as RuntimeManifest;
}

async function writePrivateJson(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, filePath);
}

export async function writeRuntimeManifest(
  filePath: string,
  manifest: RuntimeManifest,
): Promise<void> {
  validateRuntimeManifest(manifest);
  await writePrivateJson(filePath, manifest);
}

export async function readRuntimeManifest(filePath: string): Promise<RuntimeManifest> {
  const content = await readFile(path.resolve(filePath), "utf8");
  return validateRuntimeManifest(JSON.parse(content) as unknown);
}

export async function writeRuntimeRequest(
  filePath: string,
  request: RuntimeRequest,
): Promise<void> {
  await writePrivateJson(filePath, request);
}

export async function readRuntimeRequest(filePath: string): Promise<RuntimeRequest> {
  const content = await readFile(path.resolve(filePath), "utf8");
  const value = JSON.parse(content) as unknown;
  if (!isRecord(value) || typeof value.runtimeId !== "string" || !isRecord(value.worktree)) {
    throw new Error("Runtime request file is invalid.");
  }
  return value as unknown as RuntimeRequest;
}
