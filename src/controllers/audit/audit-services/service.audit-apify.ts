/**
 * Audit Apify Service
 *
 * Full-field Google Maps (GBP) extraction for the leadgen audit pipeline.
 * Mirrors the n8n `parse1` (single self GBP) and `parse3` (competitors list)
 * minimization logic — 23 fields per entry, preserved verbatim for prompt parity.
 *
 * This file is intentionally standalone (no imports from
 * `practice-ranking/feature-services/service.apify.ts`) so the audit pipeline
 * can evolve without breaking existing `CompetitorDetailedData` consumers.
 *
 * Pattern reference: src/controllers/practice-ranking/feature-services/service.apify.ts
 */

import axios from "axios";
import { GbpMinimized } from "../../../models/AuditProcessModel";
import { textSearch } from "../../places/feature-services/GooglePlacesApiService";
import logger from "../../../lib/logger";

export { GbpMinimized };

const APIFY_API_TOKEN = process.env.APIFY_TOKEN;
const APIFY_API_BASE = "https://api.apify.com/v2";

// Same actor n8n uses — tilde form required for URL path
const GOOGLE_MAPS_ACTOR = "compass~crawler-google-places";

// n8n allocates 4096 MB for these runs (see Leadgen Analysis Agent.json).
// Apify API accepts `memory` as a query parameter on the run endpoint.
const APIFY_MEMORY_MB = 4096;

interface ApifyRunResult {
  id: string;
  status: string;
  datasetId?: string;
}

function log(message: string): void {
  logger.info(`[AUDIT-APIFY] ${message}`);
}

/**
 * Map a raw Apify Google-Maps-scraper item to the 23-field minimized shape.
 * Field list is taken verbatim from n8n parse1/parse3 code nodes.
 */
function minimizeGbpItem(item: any): GbpMinimized {
  return {
    title: item?.title,
    categoryName: item?.categoryName,
    address: item?.address,
    website: item?.website,
    phone: item?.phone,
    location: item?.location,
    averageStarRating: item?.totalScore,
    placeId: item?.placeId,
    categories: item?.categories,
    reviewsCount: item?.reviewsCount,
    reviewsDistribution: item?.reviewsDistribution,
    imagesCount: item?.imagesCount,
    imageCategories: item?.imageCategories,
    openingHours: item?.openingHours,
    reviewsTags: item?.reviewsTags,
    additionalInfo: item?.additionalInfo,
    url: item?.url,
    searchPageUrl: item?.searchPageUrl,
    searchString: item?.searchString,
    imageUrl: item?.imageUrl,
    ownerUpdates: item?.ownerUpdates,
    imageUrls: item?.imageUrls,
    reviews: item?.reviews,
  };
}

/**
 * Poll an Apify actor run until it reaches a terminal state.
 * Local copy (not imported) to keep audit service independent of
 * practice-ranking service.
 */
async function waitForActorRun(
  runId: string,
  maxWaitMs: number = 300000,
): Promise<ApifyRunResult> {
  const startTime = Date.now();
  const pollInterval = 2000; // 2s — shaves up to 3s/run vs the 5s n8n default

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await axios.get(
        `${APIFY_API_BASE}/actor-runs/${runId}`,
        {
          headers: { Authorization: `Bearer ${APIFY_API_TOKEN}` },
        },
      );

      const run = response.data.data;
      log(`Run ${runId} status: ${run.status}`);

      if (run.status === "SUCCEEDED") {
        return {
          id: run.id,
          status: run.status,
          datasetId: run.defaultDatasetId,
        };
      }

      if (
        run.status === "FAILED" ||
        run.status === "ABORTED" ||
        run.status === "TIMED-OUT"
      ) {
        throw new Error(`Apify actor run failed: ${run.status}`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`Apify actor run ${runId} not found`);
      }
      throw error;
    }
  }

  throw new Error(`Apify actor run ${runId} timed out after ${maxWaitMs}ms`);
}

async function fetchDatasetItems(datasetId: string): Promise<any[]> {
  try {
    const response = await axios.get(
      `${APIFY_API_BASE}/datasets/${datasetId}/items`,
      {
        headers: { Authorization: `Bearer ${APIFY_API_TOKEN}` },
        params: { format: "json" },
      },
    );
    return response.data;
  } catch (error: any) {
    log(`Error fetching dataset ${datasetId}: ${error.message}`);
    throw error;
  }
}

/**
 * Kick off an Apify run with the given input body and return the completed
 * run's dataset items. Centralized so scrapeSelfGBP and scrapeCompetitorGBPs
 * share identical invocation semantics.
 */
async function runActorAndFetch(inputBody: Record<string, any>): Promise<any[]> {
  if (!APIFY_API_TOKEN) {
    throw new Error("APIFY_TOKEN not set");
  }

  log(`Starting actor run with input: ${JSON.stringify(inputBody)}`);

  const runResponse = await axios.post(
    `${APIFY_API_BASE}/acts/${GOOGLE_MAPS_ACTOR}/runs`,
    inputBody,
    {
      headers: {
        Authorization: `Bearer ${APIFY_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      params: { memory: APIFY_MEMORY_MB },
    },
  );

  const runId = runResponse.data?.data?.id;
  if (!runId) {
    throw new Error("Apify actor run did not return a run id");
  }
  log(`Started actor run: ${runId}`);

  const runResult = await waitForActorRun(runId);
  if (!runResult.datasetId) {
    throw new Error("No dataset ID returned");
  }

  return fetchDatasetItems(runResult.datasetId);
}

/**
 * Resolve placeIds via Google Places API Text Search (sub-second, ~$0.03/req).
 * Returns up to `limit` placeIds — caller decides how many to scrape via Apify.
 */
async function findPlaceIds(
  query: string,
  limit: number,
): Promise<string[]> {
  const places = await textSearch(query, limit);
  const ids = (places || [])
    .map((p: any) => p?.id)
    .filter((id: unknown): id is string => typeof id === "string");
  return ids.slice(0, limit);
}

/**
 * Map a Google Places API `textSearch` record to the GbpMinimized shape we
 * store + feed to the LLM. Places API covers most fields we need for
 * competitor benchmarking (title, address, rating, reviewsCount, location,
 * categories, opening hours). Fields the Places API does NOT provide —
 * `reviewsDistribution`, `imagesCount`, `ownerUpdates`, full review text —
 * are set to null so downstream code can detect them as missing.
 */
function placeToGbpMinimized(p: any): GbpMinimized {
  const photos = Array.isArray(p?.photos) ? p.photos : [];
  return {
    title: p?.displayName?.text ?? p?.displayName,
    categoryName: p?.primaryTypeDisplayName?.text ?? p?.primaryType,
    address: p?.formattedAddress,
    website: p?.websiteUri,
    phone: p?.nationalPhoneNumber,
    location: p?.location
      ? { lat: p.location.latitude, lng: p.location.longitude }
      : undefined,
    averageStarRating: p?.rating,
    placeId: p?.id,
    categories: Array.isArray(p?.types) ? p.types : undefined,
    reviewsCount: p?.userRatingCount,
    reviewsDistribution: undefined,
    imagesCount: photos.length > 0 ? photos.length : undefined,
    imageCategories: undefined,
    openingHours: p?.regularOpeningHours?.weekdayDescriptions,
    reviewsTags: undefined,
    additionalInfo: undefined,
    url: undefined,
    searchPageUrl: undefined,
    searchString: undefined,
    imageUrl: undefined,
    ownerUpdates: undefined,
    imageUrls: undefined,
    reviews: undefined,
  };
}

/**
 * Scrape ONE place from Apify by placeId via `startUrls`. Avoids Apify's
 * search step entirely — single-place runs warm up faster than batched
 * search runs, which is what unlocks the parallel-competitor speedup below.
 */
/**
 * Scrape ONE place via Apify by placeId. `detail` controls whether we ask
 * Apify for the place's detail page (which carries `imagesCount`,
 * `reviewsDistribution`, and the `reviews[]` array). Both self and competitor
 * scrapes need detail because Visual Authority pillar benchmarks photo
 * counts across the cohort. `maxReviews` is the only knob between the two:
 * self needs the full review window for recency, competitors just need the
 * detail-page metadata.
 */
async function scrapeOneByPlaceId(
  placeId: string,
  options: { maxReviews: number },
): Promise<GbpMinimized | null> {
  const inputBody: Record<string, unknown> = {
    startUrls: [
      { url: `https://www.google.com/maps/place/?q=place_id:${placeId}` },
    ],
    language: "en",
    maxCrawledPlacesPerSearch: 1,
    scrapePlaceDetailPage: true,
    maxImages: 1, // imagesCount metadata only; we never use imageUrls
    maxReviews: options.maxReviews,
  };

  try {
    const items = await runActorAndFetch(inputBody);
    if (items.length === 0) return null;
    return minimizeGbpItem(items[0]);
  } catch (err: any) {
    log(`scrapeOneByPlaceId(${placeId}) failed: ${err?.message}`);
    return null;
  }
}

/**
 * Scrape the practice's own Google Business Profile.
 *
 * Hybrid: Places API resolves the placeId in <1s (the text-search step that
 * Apify's actor would otherwise burn ~5-10s on), then Apify is asked to
 * scrape just that single place with full detail (reviews + photo metadata).
 *
 * @param searchString Compact query string (e.g. "Smile Dental Austin, TX")
 * @returns Single minimized GBP record (23 fields)
 */
export async function scrapeSelfGBP(
  searchString: string,
): Promise<GbpMinimized> {
  log(`scrapeSelfGBP: "${searchString}" (Places API → Apify single-place)`);

  const placeIds = await findPlaceIds(searchString, 1);
  if (placeIds.length === 0) {
    throw new Error(`No place found for self GBP search: ${searchString}`);
  }
  log(
    `scrapeSelfGBP: resolved placeId=${placeIds[0]}, fetching detail via Apify`,
  );

  // Self GBP needs full review window for 30/90-day recency scoring.
  const result = await scrapeOneByPlaceId(placeIds[0], { maxReviews: 10 });
  if (!result) {
    throw new Error(`Apify scrape failed for self placeId ${placeIds[0]}`);
  }
  return result;
}

/**
 * Scrape competitor GBPs.
 *
 * Pure Google Places API — no Apify. One `textSearch` call returns the full
 * cohort with title/address/rating/reviewsCount/location/hours/categories
 * in under a second. Apify's batched competitor run was routinely taking
 * 3+ minutes for 5 places on the compass~crawler-google-places actor
 * (visible in production logs), so we bypass it entirely for competitors.
 *
 * Trade: `reviewsDistribution`, `imagesCount` (precise), `ownerUpdates`
 * are NOT returned by Places API. The condensers + pillar prompts already
 * handle these as optional fields. Self GBP still goes through Apify for
 * full detail (reviews array used for recency, photo metadata, etc).
 *
 * @param searchString Category + location query (e.g. "orthodontist Winter Garden FL")
 * @param limit Max competitors to fetch (default 5)
 * @returns Array of minimized GBP records
 */
export async function scrapeCompetitorGBPs(
  searchString: string,
  limit: number = 5,
): Promise<GbpMinimized[]> {
  log(
    `scrapeCompetitorGBPs: "${searchString}" (limit: ${limit}, Places API only — no Apify)`,
  );

  const places = await textSearch(searchString, limit);
  if (!places || places.length === 0) {
    log("scrapeCompetitorGBPs: no competitors found via Places API");
    return [];
  }

  const competitors = places.slice(0, limit).map(placeToGbpMinimized);
  log(`scrapeCompetitorGBPs: ${competitors.length} competitor(s) from Places API`);
  return competitors;
}

export default {
  scrapeSelfGBP,
  scrapeCompetitorGBPs,
};
