/**
 * Monthly market search-volume harvest processor (Patient Journey Insights).
 *
 * Iterates every location that has tracked ranking keywords and harvests its
 * DataForSEO market search volume for the current report month, upserting through
 * the search-volume service. Each location's attempt is logged via
 * IntegrationHarvestLogModel (§21.4). The sweep is idempotent — re-running a month
 * upserts the same rows (§21.1) — and total: a single location failure is logged
 * and skipped, never thrown, so the rest of the fleet still runs (§21.2).
 *
 * Search volume moves slowly, so this runs monthly (registered in worker.ts),
 * not in the daily data-harvest loop. The job orchestrates and calls the
 * service (§21.3); all DB reads/writes go through models (§7.4).
 */

import { Job } from "bullmq";
import { PracticeRankingModel } from "../../models/PracticeRankingModel";
import { IntegrationHarvestLogModel } from "../../models/website-builder/IntegrationHarvestLogModel";
import {
  harvestSearchVolumeForLocation,
  currentReportMonth,
} from "../../services/integrations/searchVolumeHarvestAdapter";
import { isDataForSeoConfigured } from "../../config/dataforseo";
import logger from "../../lib/logger";

const LOG_PREFIX = "[SEARCH-VOLUME-HARVEST]";
const HARVEST_PLATFORM = "search_volume";

export interface SearchVolumeHarvestJobData {
  reportMonth?: string;
}

async function logLocationOutcome(
  reportMonth: string,
  ok: boolean,
  rows: number,
  error?: string,
): Promise<void> {
  try {
    await IntegrationHarvestLogModel.create({
      integration_id: null,
      platform: HARVEST_PLATFORM,
      harvest_date: reportMonth,
      outcome: ok ? "success" : "failed",
      rows_fetched: rows,
      error: error ?? null,
    });
  } catch (err) {
    // Logging the attempt must never sink the sweep.
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      `${LOG_PREFIX} failed to write harvest log`,
    );
  }
}

export async function processSearchVolumeHarvest(
  job: Job<SearchVolumeHarvestJobData>,
): Promise<void> {
  if (!isDataForSeoConfigured()) {
    logger.warn(`${LOG_PREFIX} DataForSEO not configured — skipping monthly harvest`);
    return;
  }

  const reportMonth = job.data?.reportMonth || currentReportMonth();
  const locations = await PracticeRankingModel.findLocationsWithKeywords();
  logger.info(
    `${LOG_PREFIX} starting monthly harvest for ${locations.length} locations (reportMonth=${reportMonth})`,
  );

  let succeeded = 0;
  let failed = 0;

  for (const location of locations) {
    const result = await harvestSearchVolumeForLocation(
      {
        organizationId: location.organization_id,
        locationId: location.location_id,
        rankKeywords: location.rank_keywords,
        city: location.search_city,
        state: location.search_state,
      },
      reportMonth,
    );

    if (result.ok) {
      succeeded += 1;
    } else {
      failed += 1;
      logger.warn(
        { locationId: location.location_id, error: result.error },
        `${LOG_PREFIX} location harvest failed`,
      );
    }

    await logLocationOutcome(reportMonth, result.ok, result.rowsUpserted ?? 0, result.error);
  }

  logger.info(
    `${LOG_PREFIX} monthly harvest complete — ${succeeded} ok, ${failed} failed`,
  );
}
