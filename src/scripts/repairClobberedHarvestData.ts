/**
 * One-time repair: re-harvest dates whose stored data was overwritten with empty.
 *
 * Background: until the empty-write guard landed (dataHarvest.processor.ts), a
 * harvest that succeeded with 0 rows still ran the data upsert, replacing a
 * previously-good day with an empty payload. This script finds those dates —
 * the harvest log proves we once fetched rows (max rows_fetched > 0) but the
 * current gsc_data / clarity_data row is empty or missing — and re-enqueues a
 * single-date harvest for each. With the guard in place, the re-harvest either
 * restores real data or (if the provider now returns empty) safely skips the
 * write, so this can never re-clobber.
 *
 * GSC + Clarity only. Rybbit reports rowCount 1 on every success, so it has no
 * empty-row failure mode to repair.
 *
 * Usage (from the app dir so dotenv reads .env):
 *   npx tsx src/scripts/repairClobberedHarvestData.ts            # dry-run (default)
 *   npx tsx src/scripts/repairClobberedHarvestData.ts --apply    # enqueue re-harvests
 *
 * Idempotent: the deterministic jobId dedupes, so re-running is safe.
 *
 * Spec: plans/06122026-harvest-empty-overwrite-guard/spec.html (T2).
 */
import * as dotenv from "dotenv";
dotenv.config();

import { WebsiteIntegrationModel } from "../models/website-builder/WebsiteIntegrationModel";
import { IntegrationHarvestLogModel } from "../models/website-builder/IntegrationHarvestLogModel";
import { GscDataModel } from "../models/website-builder/GscDataModel";
import { ClarityDataModelV2 } from "../models/website-builder/ClarityDataModelV2";
import { getHarvestQueue, closeQueues } from "../workers/queues";
import { db } from "../database/connection";
import logger from "../lib/logger";

const APPLY = process.argv.includes("--apply");

function rowsLen(section: unknown): number {
  if (
    section &&
    typeof section === "object" &&
    Array.isArray((section as { rows?: unknown }).rows)
  ) {
    return (section as { rows: unknown[] }).rows.length;
  }
  return 0;
}

/**
 * Stored GSC payload → row count, mirroring gscHarvestAdapter. Returns -1 for a
 * legacy payload (schemaVersion < 2) we can't reliably count, so the caller
 * skips it rather than risk re-harvesting a good day.
 */
function countGscRows(data: unknown): number {
  if (!data || typeof data !== "object") return -1;
  const obj = data as Record<string, unknown>;
  const schemaVersion = Number(obj.schemaVersion);
  if (!Number.isFinite(schemaVersion) || schemaVersion < 2) return -1;
  return (
    rowsLen(obj.summary) +
    rowsLen(obj.queries) +
    rowsLen(obj.pages) +
    rowsLen(obj.countries) +
    rowsLen(obj.devices)
  );
}

/** Stored Clarity payload → row count, mirroring clarityHarvestAdapter. */
function countClarityRows(data: unknown): number {
  if (data == null) return 0;
  if (Array.isArray(data)) return data.length;
  return 1;
}

interface RepairPlatform {
  model: {
    findByProjectAndDate: (
      projectId: string,
      date: string,
    ) => Promise<{ data: unknown } | undefined>;
  };
  countRows: (data: unknown) => number;
}

const REPAIR_PLATFORMS: Record<string, RepairPlatform> = {
  gsc: { model: GscDataModel, countRows: countGscRows },
  clarity: { model: ClarityDataModelV2, countRows: countClarityRows },
};

async function main(): Promise<void> {
  const platforms = Object.keys(REPAIR_PLATFORMS);
  const active = await WebsiteIntegrationModel.findActiveByTypes([
    "data_harvest",
    "hybrid",
  ]);
  const integrations = active.filter((i) => platforms.includes(i.platform));

  logger.info(
    `[REPAIR] ${APPLY ? "APPLY" : "DRY-RUN"} — scanning ${integrations.length} GSC/Clarity integration(s)\n`,
  );

  const queue = APPLY ? getHarvestQueue("daily") : null;
  let grandCandidates = 0;
  let grandEnqueued = 0;

  for (const integration of integrations) {
    const cfg = REPAIR_PLATFORMS[integration.platform];
    const datesWithData =
      await IntegrationHarvestLogModel.findDatesWithDataByIntegration(
        integration.id,
      );

    const candidates: string[] = [];
    for (const date of datesWithData) {
      const row = await cfg.model.findByProjectAndDate(
        integration.project_id,
        date,
      );
      // 0 = empty payload or missing row → clobbered. -1 = legacy/unknown → skip.
      const count = row ? cfg.countRows(row.data) : 0;
      if (count === 0) candidates.push(date);
    }

    grandCandidates += candidates.length;
    logger.info(
      `[REPAIR] ${integration.platform} integration=${integration.id} ` +
        `project=${integration.project_id}: ${candidates.length} clobbered ` +
        `of ${datesWithData.length} dates-with-data`,
    );
    if (candidates.length > 0) {
      logger.info(`         ${candidates.join(", ")}`);
    }

    if (queue) {
      for (const date of candidates) {
        await queue.add(
          "repair-harvest",
          { integrationId: integration.id, harvestDate: date },
          { jobId: `repair-${integration.id}-${date}` },
        );
        grandEnqueued++;
      }
    }
  }

  logger.info(
    `\n[REPAIR] ${APPLY ? "ENQUEUED" : "DRY-RUN COMPLETE"} — ${grandCandidates} ` +
      `clobbered date(s) across ${integrations.length} integration(s)` +
      (APPLY
        ? `; ${grandEnqueued} re-harvest job(s) queued.`
        : `. Re-run with --apply to enqueue re-harvests.`),
  );
}

main()
  .catch((err) => {
    logger.error({ err: err }, "[REPAIR] error:");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeQueues();
    await db.destroy();
    process.exit(process.exitCode ?? 0);
  });
