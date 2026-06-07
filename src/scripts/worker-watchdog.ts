/**
 * Worker watchdog (runs OUTSIDE minds-worker, via system cron).
 *
 * Reads the file-based processing heartbeat (src/workers/workerHealth.ts) and
 * emails a dev alert via the existing n8n email webhook when the worker has
 * stopped processing (stale scheduler tick) or has missed a daily harvest.
 *
 * Alert-only — it never restarts the worker. De-duped via a small state file so
 * a 5-minute cron does not spam: it alerts on the healthy->unhealthy transition
 * and then at most once per ALERT_REPEAT_HOURS while still unhealthy.
 *
 * Deploy: compiled to dist/scripts/worker-watchdog.js and invoked by cron from
 * the app dir (so dotenv picks up .env). See plan
 * plans/06072026-worker-harvest-watchdog for the crontab line + env.
 */
import * as dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import os from "os";
import path from "path";
import { readWorkerHealth, getHealthFilePath } from "../workers/workerHealth";
import { sendEmail } from "../emails/emailService";

const TICK_STALE_MIN = parseInt(process.env.WORKER_TICK_STALE_MIN || "5", 10);
const HARVEST_STALE_HOURS = parseInt(process.env.HARVEST_STALE_HOURS || "26", 10);
const ALERT_REPEAT_HOURS = parseInt(process.env.ALERT_REPEAT_HOURS || "6", 10);
const ALERT_RECIPIENT = process.env.WORKER_ALERT_EMAIL || "dave@getalloro.com";
const STATE_FILE =
  process.env.WORKER_WATCHDOG_STATE_FILE ||
  path.join(os.tmpdir(), "alloro-worker-watchdog-state.json");

interface WatchdogState {
  unhealthy: boolean;
  lastAlertAt: string | null;
}

function readState(): WatchdogState {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { unhealthy: false, lastAlertAt: null };
  }
}

function writeState(state: WatchdogState): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), "utf8");
  } catch (err) {
    console.warn("[WATCHDOG] Failed to write state file:", (err as Error)?.message);
  }
}

function ageMinutes(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 60000;
}

async function main(): Promise<void> {
  const health = readWorkerHealth();
  const tickAgeMin = ageMinutes(health.schedulerTickAt);
  const harvestAgeMin = ageMinutes(health.harvestCompletedAt);

  const problems: string[] = [];
  if (tickAgeMin === null) {
    problems.push("No scheduler-tick heartbeat has ever been recorded.");
  } else if (tickAgeMin > TICK_STALE_MIN) {
    problems.push(
      `Scheduler tick stale: last tick ${tickAgeMin.toFixed(1)} min ago (threshold ${TICK_STALE_MIN}m).`,
    );
  }
  if (harvestAgeMin !== null && harvestAgeMin > HARVEST_STALE_HOURS * 60) {
    problems.push(
      `Daily harvest stale: last completed ${(harvestAgeMin / 60).toFixed(1)}h ago (threshold ${HARVEST_STALE_HOURS}h).`,
    );
  }

  const state = readState();
  const isUnhealthy = problems.length > 0;

  if (!isUnhealthy) {
    if (state.unhealthy) writeState({ unhealthy: false, lastAlertAt: null });
    console.log(
      "[WATCHDOG] OK",
      JSON.stringify({ tickAgeMin, harvestAgeMin }),
    );
    return;
  }

  const lastAlertAgeMin = ageMinutes(state.lastAlertAt);
  const shouldAlert =
    !state.unhealthy ||
    lastAlertAgeMin === null ||
    lastAlertAgeMin > ALERT_REPEAT_HOURS * 60;

  if (!shouldAlert) {
    console.log("[WATCHDOG] Still unhealthy; within repeat window — not re-alerting.");
    return;
  }

  const host = os.hostname();
  const lines = [
    "minds-worker health check FAILED.",
    "",
    ...problems.map((p) => "- " + p),
    "",
    `host: ${host}`,
    `healthFile: ${getHealthFilePath()}`,
    `schedulerTickAt: ${health.schedulerTickAt ?? "(none)"}`,
    `harvestCompletedAt: ${health.harvestCompletedAt ?? "(none)"}`,
    "",
    "Remediation: ssh alloro-app, then",
    "  PATH=/home/ubuntu/.nvm/versions/node/v22.18.0/bin:$PATH pm2 restart minds-worker",
  ];
  const result = await sendEmail({
    subject: `[ALLORO][worker] minds-worker stalled on ${host}`,
    body: `<pre>${lines.join("\n")}</pre>`,
    recipients: [ALERT_RECIPIENT],
  });

  console.log("[WATCHDOG] Alert sent:", result.success, result.error || "");
  writeState({ unhealthy: true, lastAlertAt: new Date().toISOString() });
}

main()
  .catch((err) => {
    console.error("[WATCHDOG] error:", err);
  })
  .finally(() => process.exit(0));
