/**
 * Worker processing heartbeat (file-based).
 *
 * Written by the worker on each scheduler tick and on each harvest completion,
 * then read by the OUT-OF-PROCESS watchdog (src/scripts/worker-watchdog.ts).
 *
 * Deliberately file-based, NOT Redis-based: the failure mode we are guarding
 * against (2026-06-07) is a hung Redis connection that silently freezes all
 * queues. Storing the heartbeat on the filesystem keeps detection independent
 * of the very dependency that fails. All writes are cheap and never throw into
 * the caller — a health-write failure must not break the tick or the harvest.
 */
import fs from "fs";
import os from "os";
import path from "path";
import logger from "../lib/logger";

const HEALTH_FILE =
  process.env.WORKER_HEALTH_FILE ||
  path.join(os.tmpdir(), "alloro-worker-health.json");

export interface WorkerHealth {
  schedulerTickAt: string | null;
  harvestCompletedAt: string | null;
}

function read(): WorkerHealth {
  try {
    const parsed = JSON.parse(fs.readFileSync(HEALTH_FILE, "utf8"));
    return {
      schedulerTickAt: parsed.schedulerTickAt ?? null,
      harvestCompletedAt: parsed.harvestCompletedAt ?? null,
    };
  } catch {
    return { schedulerTickAt: null, harvestCompletedAt: null };
  }
}

function write(next: WorkerHealth): void {
  try {
    fs.writeFileSync(HEALTH_FILE, JSON.stringify(next), "utf8");
  } catch (err) {
    // Never throw into tick/harvest — a health-write failure is non-fatal.
    logger.warn({ err: (err as Error)?.message }, "[WORKER-HEALTH] Failed to write health file:");
  }
}

/** Record that the scheduler tick is processing (called every ~60s). */
export function recordSchedulerTick(now: Date = new Date()): void {
  const current = read();
  current.schedulerTickAt = now.toISOString();
  write(current);
}

/** Record a completed daily harvest. */
export function recordHarvestComplete(now: Date = new Date()): void {
  const current = read();
  current.harvestCompletedAt = now.toISOString();
  write(current);
}

export function readWorkerHealth(): WorkerHealth {
  return read();
}

export function getHealthFilePath(): string {
  return HEALTH_FILE;
}
