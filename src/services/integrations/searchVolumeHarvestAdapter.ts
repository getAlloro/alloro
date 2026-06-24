/**
 * Search-volume harvest adapter — market-demand stage of Patient Journey Insights.
 *
 * Unlike the per-project OAuth harvest adapters (gscHarvestAdapter, etc.), search
 * volume is a GLOBAL-API-KEY, per-LOCATION monthly job: DataForSEO is one shared
 * account, and the unit of work is a practice location's keyword set, not a
 * website integration. So this is a standalone service the monthly worker drives,
 * not an IDataHarvestAdapter in the harvest-registry loop.
 *
 * For one location it: builds the curated patient-intent keyword set, resolves a
 * metro→state→US location-name fallback, calls DataForSEO once (falling back to a
 * coarser geo on a location error), and upserts the per-keyword volumes through
 * KeywordSearchVolumeModel for the current report month. Returns { ok, error };
 * it NEVER throws (§21) so a single bad location cannot crash the monthly sweep.
 *
 * All DB access is through KeywordSearchVolumeModel (§7.4). Credentials come from
 * config/dataforseo (§5.1). Logging is Pino (§9.1).
 */

import {
  KeywordSearchVolumeModel,
  type KeywordVolumeUpsert,
} from "../../models/KeywordSearchVolumeModel";
import { isDataForSeoConfigured } from "../../config/dataforseo";
import {
  fetchSearchVolume,
  type KeywordVolumeResult,
} from "./search-volume/dataForSeoClient";
import {
  buildHarvestKeywords,
  buildLocationNameCandidates,
} from "./search-volume/searchVolumeKeywords";
import logger from "../../lib/logger";

const LOG_PREFIX = "[SEARCH-VOLUME]";
const SOURCE = "dataforseo";

export interface SearchVolumeHarvestTarget {
  organizationId: number;
  locationId: number;
  rankKeywords: string;
  city: string | null;
  state: string | null;
}

export interface SearchVolumeHarvestResult {
  ok: boolean;
  error?: string;
  rowsUpserted?: number;
  locationName?: string;
}

/**
 * First day of the current month, `YYYY-MM-01` (UTC) — the canonical report
 * month for an idempotent monthly upsert (§21.1).
 */
export function currentReportMonth(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

/**
 * Try each location-name candidate in order, stopping at the first non-location
 * error (success, or a hard failure). Falls through City,State → State → US on a
 * DataForSEO location error so "your market" is still an honest estimate.
 */
async function fetchWithGeoFallback(
  keywords: string[],
  candidates: string[]
): Promise<{ ok: boolean; results: KeywordVolumeResult[]; locationName: string; error?: string }> {
  let lastError = "no location candidates";
  let lastLocationName = candidates[candidates.length - 1] ?? "United States";
  for (const locationName of candidates) {
    const outcome = await fetchSearchVolume(keywords, locationName);
    if (outcome.ok) {
      return { ok: true, results: outcome.results, locationName };
    }
    lastError = outcome.error;
    lastLocationName = locationName;
    if (!outcome.locationError) {
      break;
    }
    logger.warn(
      { locationName, error: outcome.error },
      `${LOG_PREFIX} location not resolved, falling back to coarser geo`
    );
  }
  return { ok: false, results: [], locationName: lastLocationName, error: lastError };
}

function toUpsertRows(
  target: SearchVolumeHarvestTarget,
  results: KeywordVolumeResult[],
  locationName: string,
  reportMonth: string
): KeywordVolumeUpsert[] {
  return results.map((result) => ({
    organizationId: target.organizationId,
    locationId: target.locationId,
    keyword: result.keyword,
    reportMonth,
    searchVolume: result.searchVolume,
    source: SOURCE,
    locationName,
    data: { searchVolume: result.searchVolume },
  }));
}

/**
 * Harvest market search volume for one location and upsert it for the current
 * report month. Idempotent (upsert on (location, keyword, month)) and total —
 * returns { ok:false, error } instead of throwing on any failure.
 */
export async function harvestSearchVolumeForLocation(
  target: SearchVolumeHarvestTarget,
  reportMonth: string = currentReportMonth()
): Promise<SearchVolumeHarvestResult> {
  if (!isDataForSeoConfigured()) {
    return { ok: false, error: "DataForSEO is not configured" };
  }

  const keywords = buildHarvestKeywords(target.rankKeywords);
  if (keywords.length === 0) {
    return { ok: false, error: "no usable keywords after normalization" };
  }

  const candidates = buildLocationNameCandidates(target.city, target.state);

  try {
    const fetched = await fetchWithGeoFallback(keywords, candidates);
    if (!fetched.ok) {
      return { ok: false, error: fetched.error, locationName: fetched.locationName };
    }

    const rows = toUpsertRows(target, fetched.results, fetched.locationName, reportMonth);
    if (rows.length > 0) {
      await KeywordSearchVolumeModel.upsertMany(rows);
    }

    logger.info(
      {
        organizationId: target.organizationId,
        locationId: target.locationId,
        locationName: fetched.locationName,
        rows: rows.length,
        reportMonth,
      },
      `${LOG_PREFIX} harvested market search volume`
    );
    return {
      ok: true,
      rowsUpserted: rows.length,
      locationName: fetched.locationName,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { err: message, organizationId: target.organizationId, locationId: target.locationId },
      `${LOG_PREFIX} failed to harvest/upsert search volume`
    );
    return { ok: false, error: message };
  }
}
