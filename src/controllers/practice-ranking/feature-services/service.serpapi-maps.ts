/**
 * SerpApi Maps Service
 *
 * Handles sampled Google Maps result ordering for the dashboard's Maps estimate.
 * This is intentionally scoped to search-position lookups only; Apify remains
 * responsible for deep competitor detail and review velocity scraping.
 */

import axios from "axios";
import {
  isRetryableExternalError,
  RetryAttemptRecord,
  runWithRetry,
} from "./service.ranking-resilience";
import logger from "../../../lib/logger";

const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;
const SERPAPI_SEARCH_ENDPOINT = "https://serpapi.com/search.json";
const SERPAPI_MAPS_ZOOM = "15z";

interface SerpApiMapsOrigin {
  lat: number;
  lng: number;
}

interface SerpApiLocalResult {
  place_id?: string;
  title?: string;
  position?: number | string;
  rating?: number;
  reviews?: number;
  type?: string;
  types?: string[];
}

export interface SerpApiMapsSearchPositionResult {
  position: number | null;
  status: "ok" | "not_in_top_20" | "api_error";
  resultCount: number;
  orderedPlaceIds: string[];
  retryAttempts?: RetryAttemptRecord[];
  orderedResults: Array<{
    placeId: string;
    name: string;
    position: number;
    rating: number;
    reviewCount: number;
    primaryType: string;
    isClient: boolean;
  }>;
}

function log(message: string): void {
  logger.info(`[SERPAPI-MAPS] ${message}`);
}

function buildMapsLl(origin: SerpApiMapsOrigin): string {
  return `@${origin.lat},${origin.lng},${SERPAPI_MAPS_ZOOM}`;
}

function toPosition(value: number | string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPrimaryType(result: SerpApiLocalResult): string {
  if (typeof result.type === "string" && result.type.length > 0) {
    return result.type;
  }
  if (Array.isArray(result.types) && typeof result.types[0] === "string") {
    return result.types[0];
  }
  return "";
}

/**
 * Get the client's position in a Google Maps-style result set through SerpApi.
 *
 * Never throws. Provider failures collapse into `api_error` so the ranking
 * pipeline can fall back to Places API data without aborting the full run.
 */
export async function getSearchPositionViaSerpApiMaps(
  searchQuery: string,
  clientPlaceId: string,
  origin: SerpApiMapsOrigin,
): Promise<SerpApiMapsSearchPositionResult> {
  if (!SERPAPI_API_KEY) {
    log("SERPAPI_API_KEY not set — returning api_error");
    return {
      position: null,
      status: "api_error",
      resultCount: 0,
      orderedPlaceIds: [],
      orderedResults: [],
    };
  }

  const ll = buildMapsLl(origin);
  log(
    `Search-position lookup: "${searchQuery}" for placeId=${clientPlaceId} (ll=${ll})`,
  );

  try {
    const { value: localResults, attempts } = await runWithRetry(
      async () => {
        const response = await axios.get(SERPAPI_SEARCH_ENDPOINT, {
          params: {
            engine: "google_maps",
            type: "search",
            q: searchQuery,
            ll,
            hl: "en",
            gl: "us",
            api_key: SERPAPI_API_KEY,
          },
        });

        if (response.data?.error) {
          throw new Error(`SerpApi Maps error: ${response.data.error}`);
        }

        const results = response.data?.local_results;
        return Array.isArray(results) ? results : [];
      },
      {
        label: `SerpApi Maps search-position "${searchQuery}"`,
        maxAttempts: 3,
        logger: log,
        shouldRetry: isRetryableExternalError,
      },
    );

    log(`Search-position fetched ${localResults.length} Maps results`);

    const validResults = localResults.filter(
      (result: SerpApiLocalResult) =>
        typeof result?.place_id === "string" && result.place_id.length > 0,
    );
    const orderedPlaceIds = validResults.map(
      (result: SerpApiLocalResult) => result.place_id as string,
    );
    const orderedResults = validResults.map(
      (result: SerpApiLocalResult, index: number) => ({
        placeId: result.place_id as string,
        name: result.title || "",
        position: toPosition(result.position, index + 1),
        rating: toNumber(result.rating),
        reviewCount: toNumber(result.reviews),
        primaryType: getPrimaryType(result),
        isClient: result.place_id === clientPlaceId,
      }),
    );

    if (orderedResults.length === 0) {
      log("Search-position: SerpApi returned no usable Maps results");
      return {
        position: null,
        status: "api_error",
        resultCount: 0,
        orderedPlaceIds: [],
        retryAttempts: attempts,
        orderedResults: [],
      };
    }

    const match = orderedResults.find((result) => result.placeId === clientPlaceId);
    if (match) {
      log(`Search-position: client found at position ${match.position}`);
      return {
        position: match.position,
        status: "ok",
        resultCount: orderedResults.length,
        orderedPlaceIds,
        retryAttempts: attempts,
        orderedResults,
      };
    }

    log(`Search-position: client placeId not in top ${orderedResults.length} results`);
    return {
      position: null,
      status: "not_in_top_20",
      resultCount: orderedResults.length,
      orderedPlaceIds,
      retryAttempts: attempts,
      orderedResults,
    };
  } catch (error: any) {
    log(`Search-position lookup failed: ${error.message}`);
    return {
      position: null,
      status: "api_error",
      resultCount: 0,
      orderedPlaceIds: [],
      retryAttempts: Array.isArray(error.retryAttempts)
        ? error.retryAttempts
        : [],
      orderedResults: [],
    };
  }
}
