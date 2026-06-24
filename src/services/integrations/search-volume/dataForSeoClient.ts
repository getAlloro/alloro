/**
 * Thin DataForSEO HTTP client for the Google Ads search-volume `live` endpoint.
 *
 * One practice per request: posts a single task `[{ keywords, location_name,
 * language_code }]` and returns the parsed per-keyword volumes (or a typed
 * location error so the caller can fall back to a coarser geo). Returns a
 * result object, never throws (§21 — the harvest must never crash the worker).
 *
 * Auth is HTTP Basic via config/dataforseo (§5.1). The endpoint URL is a
 * named constant (§4.2).
 */

import axios from "axios";
import { getDataForSeoAuthHeader } from "../../../config/dataforseo";
import logger from "../../../lib/logger";

const SEARCH_VOLUME_LIVE_ENDPOINT =
  "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live";
const LANGUAGE_CODE = "en";
const REQUEST_TIMEOUT_MS = 30000;

/**
 * DataForSEO task status codes we special-case. 20000 = ok; the 404xx family
 * means the `location_name` couldn't be resolved, which is our signal to fall
 * back to a coarser geo (City,State → State → United States).
 */
const STATUS_OK = 20000;
const LOCATION_ERROR_CODES = new Set([40400, 40401, 40501]);

export interface KeywordVolumeResult {
  keyword: string;
  searchVolume: number | null;
}

export type SearchVolumeOutcome =
  | { ok: true; results: KeywordVolumeResult[] }
  | { ok: false; locationError: boolean; error: string };

interface DataForSeoTaskResultItem {
  keyword?: string;
  search_volume?: number | null;
}

interface DataForSeoTask {
  status_code?: number;
  status_message?: string;
  result?: DataForSeoTaskResultItem[] | null;
}

interface DataForSeoResponse {
  status_code?: number;
  status_message?: string;
  tasks?: DataForSeoTask[] | null;
}

function isLocationError(code: number | undefined): boolean {
  return code !== undefined && LOCATION_ERROR_CODES.has(code);
}

function parseTask(task: DataForSeoTask): SearchVolumeOutcome {
  const code = task.status_code;
  if (code !== STATUS_OK) {
    return {
      ok: false,
      locationError: isLocationError(code),
      error: `DataForSEO task ${code ?? "unknown"}: ${task.status_message ?? "no message"}`,
    };
  }
  const items = Array.isArray(task.result) ? task.result : [];
  const results: KeywordVolumeResult[] = items
    .filter((item): item is DataForSeoTaskResultItem => typeof item?.keyword === "string")
    .map((item) => ({
      keyword: item.keyword as string,
      searchVolume:
        typeof item.search_volume === "number" ? item.search_volume : null,
    }));
  return { ok: true, results };
}

/**
 * Fetch search volume for one keyword set scoped to a single `location_name`.
 * Returns the per-keyword volumes, or a typed error (with `locationError` set
 * when the geo couldn't be resolved). Never throws.
 */
export async function fetchSearchVolume(
  keywords: string[],
  locationName: string
): Promise<SearchVolumeOutcome> {
  if (keywords.length === 0) {
    return { ok: true, results: [] };
  }
  try {
    const body = [
      { keywords, location_name: locationName, language_code: LANGUAGE_CODE },
    ];
    const response = await axios.post<DataForSeoResponse>(
      SEARCH_VOLUME_LIVE_ENDPOINT,
      body,
      {
        headers: {
          Authorization: getDataForSeoAuthHeader(),
          "Content-Type": "application/json",
        },
        timeout: REQUEST_TIMEOUT_MS,
      }
    );

    const payload = response.data;
    const task = payload.tasks?.[0];
    if (!task) {
      return {
        ok: false,
        locationError: false,
        error: `DataForSEO response had no task (status ${payload.status_code ?? "unknown"}: ${payload.status_message ?? "no message"})`,
      };
    }
    return parseTask(task);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      { err: message, locationName },
      "[SEARCH-VOLUME] DataForSEO request failed"
    );
    return { ok: false, locationError: false, error: message };
  }
}
