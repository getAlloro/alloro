/**
 * Apify Service
 * Handles Google Maps scraping for competitor discovery and data collection
 */

import axios from "axios";
import {
  isRetryableExternalError,
  RetryAttemptRecord,
  runWithRetry,
  summarizeRetryAttempts,
} from "./service.ranking-resilience";

const APIFY_API_TOKEN = process.env.APIFY_TOKEN;
const APIFY_API_BASE = "https://api.apify.com/v2";

// Google Maps Scraper Actor ID (using compass crawler)
// Note: Use tilde (~) instead of slash (/) for Apify API URL format
const GOOGLE_MAPS_ACTOR = "compass~crawler-google-places";

interface ApifyRunResult {
  id: string;
  status: string;
  datasetId?: string;
}

interface CompetitorSearchResult {
  placeId: string;
  name: string;
  address: string;
  category: string;
  totalScore: number;
  reviewsCount: number;
  url: string;
  website?: string;
  phone?: string;
  location?: {
    lat: number;
    lng: number;
  };
}

// Location parameters for competitor discovery (from Identifier Agent)
interface LocationParams {
  county?: string | null;
  state?: string | null;
  postalCode?: string | null;
  city?: string | null;
}

interface CompetitorDetailedData {
  placeId: string;
  name: string;
  address: string;
  categories: string[];
  primaryCategory: string;
  totalReviews: number;
  averageRating: number;
  reviewsLast30d?: number;
  reviewsLast90d?: number;
  photosCount: number;
  postsLast90d?: number;
  hasWebsite: boolean;
  hasPhone: boolean;
  hasHours: boolean;
  hoursComplete: boolean;
  descriptionLength: number;
  hasKeywordInName: boolean;
  website?: string;
  phone?: string;
  openingHours?: any;
  reviewsDistribution?: {
    oneStar: number;
    twoStar: number;
    threeStar: number;
    fourStar: number;
    fiveStar: number;
  };
  recentReviews?: Array<{
    author: string;
    rating: number;
    text: string;
    publishedAtDate: string;
  }>;
}

/**
 * Log helper for Apify operations
 */
function log(message: string): void {
  console.log(`[APIFY] ${message}`);
}

/**
 * Wait for Apify actor run to complete
 */
async function waitForActorRun(
  runId: string,
  maxWaitMs: number = 300000,
): Promise<ApifyRunResult> {
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds

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
        throw new Error(`Actor run failed with status: ${run.status}`);
      }

      // Still running, wait and poll again
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`Actor run ${runId} not found`);
      }
      throw error;
    }
  }

  throw new Error(`Actor run ${runId} timed out after ${maxWaitMs}ms`);
}

/**
 * Fetch dataset items from Apify
 */
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
 * Result shape for the searchPosition lookup.
 *
 * - `ok`           : client was found in the Apify result set; `position` is 1-based.
 * - `not_in_top_20`: actor returned results but the client's placeId was absent.
 * - `api_error`    : Apify request or run failed; `position` is null.
 *
 * `orderedResults` mirrors the rich fields the rankings page renders in its
 * "Top Orthodontists" table — kept in sync with `position` so the table and
 * the headline number reflect the same Maps panel ordering.
 */
export interface ApifyMapsSearchPositionResult {
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

/**
 * Get the client's position in Google Maps' Places panel for a given query.
 *
 * Uses the same `compass~crawler-google-places` Apify actor as
 * `discoverCompetitors`, but the contract is narrowed to "where am I in
 * the ordered Maps result list". The order Apify returns matches the
 * Maps panel a real searcher sees in the area — distinct from the Places
 * API's `searchText` ranking, which is biased to client coordinates and
 * applies a different relevance algorithm.
 *
 * Spec: plans/04282026-no-ticket-live-google-rank-apify-maps-swap/spec.md (T1)
 *
 * Never throws — failures collapse into `{ status: "api_error", position: null }`
 * so the caller can fall back without aborting the rest of the pipeline.
 */
export async function getSearchPositionViaApifyMaps(
  searchQuery: string,
  clientPlaceId: string,
  locationParams?: LocationParams,
): Promise<ApifyMapsSearchPositionResult> {
  if (!APIFY_API_TOKEN) {
    log(
      `getSearchPositionViaApifyMaps: APIFY_TOKEN not set — returning api_error`,
    );
    return {
      position: null,
      status: "api_error",
      resultCount: 0,
      orderedPlaceIds: [],
      orderedResults: [],
    };
  }

  log(
    `Search-position lookup: "${searchQuery}" for placeId=${clientPlaceId}` +
      (locationParams
        ? ` (city=${locationParams.city ?? "-"}, state=${locationParams.state ?? "-"})`
        : ""),
  );

  try {
    const inputPayload: Record<string, any> = {
      searchStringsArray: [searchQuery],
      maxCrawledPlacesPerSearch: 20,
    };
    if (locationParams?.county) inputPayload.county = locationParams.county;
    if (locationParams?.state) inputPayload.state = locationParams.state;
    if (locationParams?.postalCode)
      inputPayload.postalCode = locationParams.postalCode;
    if (locationParams?.city) inputPayload.city = locationParams.city;

    const { value: items, attempts } = await runWithRetry(
      async () => {
        const runResponse = await axios.post(
          `${APIFY_API_BASE}/acts/${GOOGLE_MAPS_ACTOR}/runs`,
          inputPayload,
          {
            headers: {
              Authorization: `Bearer ${APIFY_API_TOKEN}`,
              "Content-Type": "application/json",
            },
          },
        );

        const runId = runResponse.data.data.id;
        log(`Search-position actor run started: ${runId}`);

        const runResult = await waitForActorRun(runId);

        if (!runResult.datasetId) {
          throw new Error("No dataset ID returned from actor run");
        }

        return fetchDatasetItems(runResult.datasetId);
      },
      {
        label: `Apify Maps search-position "${searchQuery}"`,
        maxAttempts: 3,
        logger: log,
        shouldRetry: isRetryableExternalError,
      },
    );
    log(`Search-position fetched ${items.length} ordered Maps results`);

    const validItems = items.filter(
      (item: any) => typeof item?.placeId === "string" && item.placeId.length > 0,
    );

    const orderedPlaceIds: string[] = validItems.map(
      (item: any) => item.placeId,
    );

    const orderedResults = validItems.map((item: any, idx: number) => ({
      placeId: item.placeId as string,
      name: (item.title || item.name || "") as string,
      position: idx + 1,
      rating: typeof item.totalScore === "number" ? item.totalScore : 0,
      reviewCount:
        typeof item.reviewsCount === "number" ? item.reviewsCount : 0,
      primaryType: (item.categoryName ||
        (Array.isArray(item.categories) ? item.categories[0] : "") ||
        "") as string,
      isClient: item.placeId === clientPlaceId,
    }));

    const index = orderedPlaceIds.indexOf(clientPlaceId);
    if (index >= 0) {
      const position = index + 1;
      log(`Search-position: client found at position ${position}`);
      return {
        position,
        status: "ok",
        resultCount: orderedPlaceIds.length,
        orderedPlaceIds,
        retryAttempts: attempts,
        orderedResults,
      };
    }

    log(
      `Search-position: client placeId not in top ${orderedPlaceIds.length} results`,
    );
    return {
      position: null,
      status: "not_in_top_20",
      resultCount: orderedPlaceIds.length,
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

/**
 * Discover competitors by searching Google Maps
 * @param searchQuery - Search query (e.g., "orthodontist")
 * @param limit - Maximum number of results (default 20)
 * @param locationParams - Optional location parameters from Identifier Agent (county, state, postalCode, city)
 */
export async function discoverCompetitors(
  searchQuery: string,
  limit: number = 20,
  locationParams?: LocationParams,
): Promise<CompetitorSearchResult[]> {
  if (!APIFY_API_TOKEN) {
    throw new Error("APIFY_TOKEN environment variable is not set");
  }

  log(`Discovering competitors for: "${searchQuery}" (limit: ${limit})`);
  if (locationParams) {
    log(
      `  Location params: city=${locationParams.city}, state=${locationParams.state}, county=${locationParams.county}, postalCode=${locationParams.postalCode}`,
    );
  }

  try {
    // Build input payload, only including non-null location params
    const inputPayload: Record<string, any> = {
      searchStringsArray: [searchQuery],
      maxCrawledPlacesPerSearch: limit,
    };

    // Add location parameters only if they have non-null values
    if (locationParams?.county) inputPayload.county = locationParams.county;
    if (locationParams?.state) inputPayload.state = locationParams.state;
    if (locationParams?.postalCode)
      inputPayload.postalCode = locationParams.postalCode;
    if (locationParams?.city) inputPayload.city = locationParams.city;

    log(`  Apify input: ${JSON.stringify(inputPayload)}`);

    // Start the Google Maps scraper actor (using compass/crawler-google-places input format)
    const runResponse = await axios.post(
      `${APIFY_API_BASE}/acts/${GOOGLE_MAPS_ACTOR}/runs`,
      inputPayload,
      {
        headers: {
          Authorization: `Bearer ${APIFY_API_TOKEN}`,
          "Content-Type": "application/json",
        },
      },
    );

    const runId = runResponse.data.data.id;
    log(`Started actor run: ${runId}`);

    // Wait for completion
    const runResult = await waitForActorRun(runId);

    if (!runResult.datasetId) {
      throw new Error("No dataset ID returned from actor run");
    }

    // Fetch results
    const items = await fetchDatasetItems(runResult.datasetId);
    log(`Fetched ${items.length} competitor results`);

    // Transform to our format
    const competitors: CompetitorSearchResult[] = items.map((item) => ({
      placeId: item.placeId,
      name: item.title || item.name,
      address: item.address,
      category: item.categoryName || item.categories?.[0] || "Unknown",
      totalScore: item.totalScore ?? 0,
      reviewsCount: item.reviewsCount ?? 0,
      url: item.url,
      website: item.website,
      phone: item.phone,
      location: item.location
        ? {
            lat: item.location.lat,
            lng: item.location.lng,
          }
        : undefined,
    }));

    // Sort competitors deterministically for consistent results:
    // 1. By review count (descending) - more established businesses first
    // 2. By rating (descending) - higher quality
    // 3. By placeId (alphabetical) - deterministic tiebreaker
    competitors.sort((a, b) => {
      // Primary sort: review count (descending)
      if (b.reviewsCount !== a.reviewsCount) {
        return b.reviewsCount - a.reviewsCount;
      }
      // Secondary sort: rating (descending)
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      // Tertiary sort: placeId (alphabetical) for deterministic tiebreaker
      return a.placeId.localeCompare(b.placeId);
    });

    log(`Sorted ${competitors.length} competitors by reviews/rating/placeId`);

    return competitors;
  } catch (error: any) {
    log(`Error discovering competitors: ${error.message}`);
    throw error;
  }
}

/**
 * Get detailed data for specific places (deep scrape)
 * @param placeIds - Array of Google Place IDs to scrape
 */
export async function getCompetitorDetails(
  placeIds: string[],
  specialtyKeywords: string[] = [],
): Promise<CompetitorDetailedData[]> {
  if (!APIFY_API_TOKEN) {
    throw new Error("APIFY_TOKEN environment variable is not set");
  }

  log(`Getting detailed data for ${placeIds.length} competitors`);

  try {
    const { value: items, attempts } = await runWithRetry(
      async () => {
        const runResponse = await axios.post(
          `${APIFY_API_BASE}/acts/${GOOGLE_MAPS_ACTOR}/runs`,
          {
            startUrls: placeIds.map((id) => ({
              url: `https://www.google.com/maps/place/?q=place_id:${id}`,
            })),
            language: "en",
            maxReviews: 10,
          },
          {
            headers: {
              Authorization: `Bearer ${APIFY_API_TOKEN}`,
              "Content-Type": "application/json",
            },
          },
        );

        const runId = runResponse.data.data.id;
        log(`Started detail scrape actor run: ${runId}`);

        const runResult = await waitForActorRun(runId);

        if (!runResult.datasetId) {
          throw new Error("No dataset ID returned from actor run");
        }

        return fetchDatasetItems(runResult.datasetId);
      },
      {
        label: `Apify competitor details (${placeIds.length})`,
        maxAttempts: 3,
        logger: log,
        shouldRetry: isRetryableExternalError,
      },
    );
    log(`Fetched detailed data for ${items.length} competitors`);
    log(`Detail scrape retry summary: ${summarizeRetryAttempts(attempts)}`);

    // Transform to our format
    const competitors: CompetitorDetailedData[] = items.map((item) => {
      const name = item.title || item.name || "";
      const hasKeywordInName = specialtyKeywords.some((keyword) =>
        name.toLowerCase().includes(keyword.toLowerCase()),
      );

      // Calculate reviews in last 30/90 days from recent reviews if available
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      let reviewsLast30d = 0;
      let reviewsLast90d = 0;

      if (item.reviews && Array.isArray(item.reviews)) {
        item.reviews.forEach((review: any) => {
          const reviewDate = new Date(review.publishedAtDate);
          if (reviewDate >= thirtyDaysAgo) reviewsLast30d++;
          if (reviewDate >= ninetyDaysAgo) reviewsLast90d++;
        });
      }

      // Log raw item data for debugging photo count issues
      const photosCount =
        item.imageCount || item.imagesCount || item.images?.length || 0;
      if (photosCount === 0) {
        log(
          `[${name}] Photo fields: imageCount=${item.imageCount}, imagesCount=${item.imagesCount}, images.length=${item.images?.length}`,
        );
      }

      return {
        placeId: item.placeId,
        name: name,
        address: item.address || "",
        categories: item.categories || [],
        primaryCategory: item.categoryName || item.categories?.[0] || "Unknown",
        totalReviews: item.reviewsCount ?? 0,
        averageRating: item.totalScore ?? 0,
        reviewsLast30d,
        reviewsLast90d,
        photosCount: photosCount,
        postsLast90d: 0, // GBP posts not available via scraping
        hasWebsite: !!item.website,
        hasPhone: !!item.phone,
        hasHours: !!item.openingHours,
        hoursComplete: item.openingHours
          ? Object.keys(item.openingHours).length >= 7
          : false,
        descriptionLength: item.description?.length || 0,
        hasKeywordInName,
        website: item.website,
        phone: item.phone,
        openingHours: item.openingHours,
        reviewsDistribution: item.reviewsDistribution
          ? {
              oneStar: item.reviewsDistribution.oneStar || 0,
              twoStar: item.reviewsDistribution.twoStar || 0,
              threeStar: item.reviewsDistribution.threeStar || 0,
              fourStar: item.reviewsDistribution.fourStar || 0,
              fiveStar: item.reviewsDistribution.fiveStar || 0,
            }
          : undefined,
        recentReviews: item.reviews?.slice(0, 10).map((review: any) => ({
          author: review.name || "Anonymous",
          rating: review.stars || 0,
          text: review.text || "",
          publishedAtDate: review.publishedAtDate,
        })),
      };
    });

    (competitors as any).retryAttempts = attempts;
    return competitors;
  } catch (error: any) {
    log(`Error getting competitor details: ${error.message}`);
    throw error;
  }
}

// Google Places API configuration (for enriching review counts when Apify returns null)
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API;
const PLACES_API_BASE = "https://places.googleapis.com/v1";
const REVIEW_COUNT_FIELD_MASK = "rating,userRatingCount";

/**
 * Enrich competitor data with accurate review counts from Google Places API.
 * Called when Apify returns reviewsCount: null (actor regression).
 * Only fetches for competitors missing review data to minimize API calls.
 */
export async function enrichCompetitorReviewCounts(
  competitors: CompetitorDetailedData[],
): Promise<CompetitorDetailedData[]> {
  if (!GOOGLE_PLACES_API_KEY) {
    log("Google Places API key not configured, skipping review count enrichment");
    return competitors;
  }

  const needsEnrichment = competitors.filter(
    (c) => c.placeId && c.totalReviews === 0,
  );

  if (needsEnrichment.length === 0) {
    log("All competitors have review data, skipping enrichment");
    return competitors;
  }

  log(
    `Enriching ${needsEnrichment.length} competitors with Google Places API review counts`,
  );

  const enriched = await Promise.allSettled(
    needsEnrichment.map(async (comp) => {
      try {
        const response = await axios.get(
          `${PLACES_API_BASE}/places/${comp.placeId}`,
          {
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
              "X-Goog-FieldMask": REVIEW_COUNT_FIELD_MASK,
            },
          },
        );

        const data = response.data;
        return {
          placeId: comp.placeId,
          userRatingCount: data.userRatingCount ?? null,
          rating: data.rating ?? null,
        };
      } catch (error: any) {
        log(
          `[${comp.name}] Google Places API lookup failed: ${error.message}`,
        );
        return { placeId: comp.placeId, userRatingCount: null, rating: null };
      }
    }),
  );

  // Patch competitors with enriched data
  let enrichedCount = 0;
  for (const result of enriched) {
    if (result.status !== "fulfilled") continue;
    const { placeId, userRatingCount, rating } = result.value;
    if (userRatingCount === null && rating === null) continue;

    const comp = competitors.find((c) => c.placeId === placeId);
    if (!comp) continue;

    if (userRatingCount !== null) {
      comp.totalReviews = userRatingCount;
    }
    if (rating !== null) {
      comp.averageRating = rating;
    }
    enrichedCount++;
    log(
      `Enriched: ${comp.name} — ${comp.totalReviews} reviews, ${comp.averageRating} rating`,
    );
  }

  log(
    `Enrichment complete: ${enrichedCount}/${needsEnrichment.length} competitors updated`,
  );

  return competitors;
}

/**
 * Get specialty-specific keywords for name matching
 */
export function getSpecialtyKeywords(specialty: string): string[] {
  const normalizedSpecialty =
    {
      orthodontist: "orthodontics",
      orthodontists: "orthodontics",
      endodontist: "endodontics",
      endodontists: "endodontics",
      periodontist: "periodontics",
      periodontists: "periodontics",
      "oral surgeon": "oral_surgery",
      "oral surgeons": "oral_surgery",
      oral_surgeon: "oral_surgery",
      "pediatric dentist": "pediatric",
      "pediatric dentists": "pediatric",
      pediatric_dentist: "pediatric",
      prosthodontist: "prosthodontics",
      prosthodontists: "prosthodontics",
    }[specialty.toLowerCase().trim()] || specialty.toLowerCase().trim();

  const keywordMap: Record<string, string[]> = {
    orthodontics: ["orthodont", "braces", "invisalign", "ortho"],
    endodontics: ["endodont", "root canal", "endo"],
    periodontics: ["periodont", "gum", "perio"],
    oral_surgery: ["oral surgery", "oral surgeon", "maxillofacial"],
    pediatric: ["pediatric", "kids", "children", "pedo"],
    prosthodontics: ["prosthodont", "dentures", "implants", "crowns"],
  };

  return keywordMap[normalizedSpecialty] || [];
}

export default {
  discoverCompetitors,
  getCompetitorDetails,
  getSpecialtyKeywords,
};
