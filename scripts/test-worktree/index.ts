import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  ALLOWED_FIXTURES,
  MANIFEST_FILE_NAME,
  RUNTIME_ROOT,
} from "./config";
import {
  launchSupervisor,
  stopRuntime,
} from "./feature-services/service.runtime-supervisor";
import { verifySecondaryWorktree } from "./feature-services/service.worktree-verifier";
import { readRuntimeManifest } from "./feature-utils/util.manifest";
import { createRuntimeId } from "./feature-utils/util.runtime-id";
import type { FixtureProfile, StartRuntimeOptions } from "./types";

interface ParsedCli {
  command: "start" | "stop" | "status";
  manifestPath: string | null;
  options: StartRuntimeOptions;
}

function argumentValue(args: string[], flag: string): string | null {
  const direct = args.find((arg) => arg.startsWith(`${flag}=`));
  if (direct) return direct.slice(flag.length + 1);
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function parseWorkers(value: string | null): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((worker) => worker.trim()).filter(Boolean))];
}

function parseFixture(value: string | null): FixtureProfile {
  const fixture = value ?? "baseline";
  if (!ALLOWED_FIXTURES.includes(fixture as FixtureProfile)) {
    throw new Error(
      `Unknown fixture "${fixture}". Allowed fixtures: ${ALLOWED_FIXTURES.join(", ")}.`,
    );
  }
  return fixture as FixtureProfile;
}

function parseCli(args: string[]): ParsedCli {
  const first = args[0];
  const command = first === "stop" || first === "status" ? first : "start";
  const optionArgs = command === "start" && first === "start" ? args.slice(1) : args;

  return {
    command,
    manifestPath: argumentValue(optionArgs, "--manifest"),
    options: {
      fixture: parseFixture(argumentValue(optionArgs, "--fixture")),
      workers: parseWorkers(argumentValue(optionArgs, "--workers")),
      keep: optionArgs.includes("--keep"),
    },
  };
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function start(options: StartRuntimeOptions): Promise<void> {
  const worktree = await verifySecondaryWorktree(process.cwd());
  const runtimeId = createRuntimeId(worktree.worktreePath, worktree.head);
  const runtimeDir = path.join(RUNTIME_ROOT, runtimeId);
  await mkdir(runtimeDir, { recursive: true, mode: 0o700 });

  const manifest = await launchSupervisor({
    runtimeId,
    runtimeDir,
    worktree,
    fixture: options.fixture,
    workers: options.workers,
    keep: options.keep,
    createdAt: new Date().toISOString(),
  });
  printJson(manifest);
}

async function loadManifest(manifestPath: string | null) {
  if (!manifestPath) {
    throw new Error("The --manifest <absolute-path> option is required.");
  }
  return readRuntimeManifest(path.resolve(manifestPath));
}

async function main(): Promise<void> {
  const parsed = parseCli(process.argv.slice(2));
  if (parsed.command === "start") {
    await start(parsed.options);
    return;
  }

  const manifest = await loadManifest(parsed.manifestPath);
  if (parsed.command === "status") {
    printJson(manifest);
    return;
  }

  await stopRuntime(manifest);
  printJson({
    runtimeId: manifest.runtimeId,
    status: "stopped",
    manifestPath: path.join(path.dirname(manifest.manifestPath), MANIFEST_FILE_NAME),
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
