/**
 * Ranking Service
 *
 * Shared logic for Practice Ranking Analysis.
 * Used by:
 * - src/routes/practiceRanking.ts (Admin Trigger)
 * - src/routes/agentsV2.ts (Automated API Run)
 */

import { db } from "../../../database/connection";
import { getValidOAuth2Client } from "../../../auth/oauth2Helper";
import { fetchGBPDataForRange } from "../../../utils/dataAggregation/dataAggregator";
import {
  getCompetitorDetails,
  enrichCompetitorReviewCounts,
  auditWebsite,
  getSpecialtyKeywords,
  getSearchPositionViaApifyMaps,
} from "./service.apify";
import {
  discoverCompetitorsViaPlaces,
  filterBySpecialty,
  getClientPhotosViaPlaces,
} from "./service.places-competitor-discovery";
import {
  getCachedCompetitors,
  setCachedCompetitors,
} from "./service.competitor-cache";
import { resolveCompetitorsForRanking } from "./service.competitor-source-resolver";
import {
  calculateRankingScore,
  rankPractices,
  calculateBenchmarks,
  PracticeData,
  FACTOR_WEIGHTS,
} from "./service.ranking-algorithm";
import { createNotification } from "../../../utils/core/notificationHelper";
import { listLocalPostsInRange } from "../../../routes/gbp";
import { runRankingAnalysis, RankingLlmPayload } from "./service.ranking-llm";
import { DEFAULT_COMPETITOR_DISCOVERY_RADIUS_METERS } from "../feature-utils/util.competitor-validator";

// Batch processing configuration
export const MAX_RETRIES = 3;
export const RETRY_DELAY_MS = 5000;

export interface StatusDetail {
  currentStep: string;
  message: string;
  progress: number;
  stepsCompleted: string[];
  timestamps: Record<string, string>;
}

export interface LocationRankingResult {
  rankingId: number;
  gbpLocationId: string;
  gbpLocationName: string;
  rankScore: number;
  rankPosition: number;
}

// Location parameters for competitor discovery (from Identifier Agent)
export interface LocationParams {
  county?: string | null;
  state?: string | null;
  postalCode?: string | null;
  city?: string | null;
}

interface SearchResultPayloadEntry {
  placeId: string;
  name: string;
  position: number;
  rating: number;
  reviewCount: number;
  primaryType: string;
  types: string[];
  isClient: boolean;
}

type SelectedCompetitorMapsStatus =
  | "measured"
  | "not_in_top_20"
  | "not_measured";

interface SelectedCompetitorMapsContext {
  selected_order: number;
  place_id: string;
  name: string;
  maps_position: number | null;
  maps_status: SelectedCompetitorMapsStatus;
  rating: number | null;
  review_count: number | null;
  primary_type: string | null;
}

function buildSelectedCompetitorMapsContext(
  competitors: any[],
  searchResults: SearchResultPayloadEntry[],
  searchStatus: "ok" | "not_in_top_20" | "bias_unavailable" | "api_error",
): SelectedCompetitorMapsContext[] {
  const searchByPlaceId = new Map(
    searchResults
      .filter((entry) => entry.placeId)
      .map((entry) => [entry.placeId, entry]),
  );

  return competitors.map((competitor, index) => {
    const match = searchByPlaceId.get(competitor.placeId);
    const mapsStatus: SelectedCompetitorMapsStatus = match
      ? "measured"
      : searchStatus === "api_error" || searchStatus === "bias_unavailable"
        ? "not_measured"
        : "not_in_top_20";
    return {
      selected_order: index + 1,
      place_id: competitor.placeId,
      name: competitor.name,
      maps_position: match?.position ?? null,
      maps_status: mapsStatus,
      rating: match?.rating ?? competitor.totalScore ?? null,
      review_count: match?.reviewCount ?? competitor.reviewsCount ?? null,
      primary_type: match?.primaryType ?? competitor.primaryType ?? null,
    };
  });
}

/**
 * Sum values from GBP performance time series data
 */
function sumPerformanceMetric(
  performanceSeries: any[],
  metricName: string,
): number {
  if (!performanceSeries || !Array.isArray(performanceSeries)) return 0;

  for (const multiSeries of performanceSeries) {
    const dailyMetricList = multiSeries?.dailyMetricTimeSeries || [];
    for (const series of dailyMetricList) {
      if (series.dailyMetric === metricName) {
        const datedValues = series?.timeSeries?.datedValues || [];
        return datedValues.reduce((sum: number, dv: any) => {
          const value = dv?.value !== undefined ? parseInt(dv.value, 10) : 0;
          return sum + (isNaN(value) ? 0 : value);
        }, 0);
      }
    }
  }
  return 0;
}

/**
 * Extract performance metrics from GBP data
 */
function extractPerformanceMetrics(gbpData: any): {
  calls: number;
  directions: number;
  clicks: number;
} {
  const performanceSeries = gbpData?.performance?.series || [];
  return {
    calls: sumPerformanceMetric(performanceSeries, "CALL_CLICKS"),
    directions: sumPerformanceMetric(
      performanceSeries,
      "BUSINESS_DIRECTION_REQUESTS",
    ),
    clicks: sumPerformanceMetric(performanceSeries, "WEBSITE_CLICKS"),
  };
}

/**
 * Update ranking status in database
 */
export async function updateStatus(
  rankingId: number,
  status: string,
  step: string,
  message: string,
  progress: number,
  existingDetail?: StatusDetail,
  logger?: (msg: string) => void,
): Promise<void> {
  const detail: StatusDetail = existingDetail || {
    currentStep: step,
    message: message,
    progress: progress,
    stepsCompleted: [],
    timestamps: { started_at: new Date().toISOString() },
  };

  detail.currentStep = step;
  detail.message = message;
  detail.progress = progress;
  detail.timestamps[`${step}_at`] = new Date().toISOString();

  if (progress > 0 && !detail.stepsCompleted.includes(step)) {
    const steps = [
      "queued",
      "fetching_search_position",
      "fetching_client_gbp",
      "discovering_competitors",
      "scraping_competitors",
      "auditing_website",
      "calculating_scores",
      "awaiting_llm",
      "done",
    ];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      detail.stepsCompleted = steps.slice(0, currentIndex);
    }
  }

  await db("practice_rankings")
    .where({ id: rankingId })
    .update({
      status: status,
      status_detail: JSON.stringify(detail),
      updated_at: new Date(),
    });

  if (logger) {
    logger(
      `[RANKING] [${rankingId}] Status: ${status} - ${step} (${progress}%): ${message}`,
    );
  }
}

async function markRankingFailed(
  rankingId: number,
  step: string,
  message: string,
  error: unknown,
  existingDetail?: StatusDetail,
  logger?: (msg: string) => void,
): Promise<void> {
  const detail: StatusDetail = existingDetail || {
    currentStep: step,
    message,
    progress: 0,
    stepsCompleted: [],
    timestamps: { started_at: new Date().toISOString() },
  };
  const errorMessage = error instanceof Error ? error.message : String(error);

  detail.currentStep = step;
  detail.message = message;
  detail.timestamps[`${step}_failed_at`] = new Date().toISOString();

  await db("practice_rankings")
    .where({ id: rankingId })
    .update({
      status: "failed",
      status_detail: JSON.stringify(detail),
      error_message: errorMessage,
      updated_at: new Date(),
    });

  if (logger) {
    logger(`[RANKING] [${rankingId}] Failed at ${step}: ${errorMessage}`);
  }
}

/**
 * Process ranking analysis for a single location
 * @param rankingId - Database ID for this ranking record
 * @param googleAccountId - Google account ID
 * @param gbpAccountId - GBP account ID
 * @param gbpLocationId - GBP location ID
 * @param gbpLocationName - Display name of the location
 * @param specialty - Practice specialty type
 * @param marketLocation - Market location string
 * @param domain - Practice domain name
 * @param batchId - Batch ID for grouping
 * @param logger - Optional logging function
 * @param keywords - Optional custom keywords from Identifier Agent for scoring
 * @param locationParams - Optional location parameters from Identifier Agent for Apify search
 */
export async function processLocationRanking(
  rankingId: number,
  googleAccountId: number,
  gbpAccountId: string,
  gbpLocationId: string,
  gbpLocationName: string,
  specialty: string,
  marketLocation: string,
  domain: string,
  batchId: string,
  logger?: (msg: string) => void,
  keywords?: string[],
  locationParams?: LocationParams,
): Promise<LocationRankingResult> {
  const startTime = Date.now();
  const log = logger || console.log;

  log(
    `[RANKING] [${rankingId}] START: ${gbpLocationName} (${specialty} in ${marketLocation})`,
  );

  let statusDetail: StatusDetail = {
    currentStep: "queued",
    message: "Analysis queued",
    progress: 0,
    stepsCompleted: [],
    timestamps: { started_at: new Date().toISOString() },
  };

  // Get account details
  const account = await db("google_connections")
    .where({ id: googleAccountId })
    .first();

  if (!account) {
    throw new Error(`Account ${googleAccountId} not found`);
  }

  const rankingRunContext = await db("practice_rankings as pr")
    .leftJoin("locations as l", "l.id", "pr.location_id")
    .where("pr.id", rankingId)
    .select(
      "pr.location_id",
      "pr.competitor_discovery_radius_meters as ranking_discovery_radius",
      "l.competitor_discovery_radius_meters as location_discovery_radius",
    )
    .first();
  const competitorDiscoveryRadiusMeters = Number(
    rankingRunContext?.ranking_discovery_radius ??
      rankingRunContext?.location_discovery_radius ??
      DEFAULT_COMPETITOR_DISCOVERY_RADIUS_METERS,
  );

  const propertyIds =
    typeof account.google_property_ids === "string"
      ? JSON.parse(account.google_property_ids)
      : account.google_property_ids;

  // Get OAuth client
  let oauth2Client = await getValidOAuth2Client(googleAccountId);

  // Get date range (last 30 days)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  const startDateStr = startDate.toISOString().split("T")[0];
  const endDateStr = endDate.toISOString().split("T")[0];

  // ========== STEP 0: Search Position (live Google data) ==========
  // Fetch the client's position in Google Places for "{specialty} in {marketLocation}",
  // using the practice's own coordinates as the location bias. The same competitor
  // set drives Practice Health scoring (Option A — see spec).
  // Spec: plans/04122026-no-ticket-practice-health-search-position-split/spec.md
  await updateStatus(
    rankingId,
    "processing",
    "fetching_search_position",
    `Looking up ${gbpLocationName} on Google...`,
    5,
    statusDetail,
    log,
  );

  const searchQuery = `${specialty} in ${marketLocation}`;

  let clientVantage: { lat: number; lng: number } | null = null;
  let clientPlaceId: string | null = null;
  let clientPhotosCountFromStep0 = 0;
  let searchStatus: "ok" | "not_in_top_20" | "bias_unavailable" | "api_error" = "ok";
  let searchPosition: number | null = null;
  let discoveredCompetitors: any[] = [];

  // Sub-step 1: Resolve client vantage point via Places lookup
  try {
    const clientLookup = await getClientPhotosViaPlaces(
      gbpLocationName,
      marketLocation,
    );
    if (
      clientLookup.placeId &&
      clientLookup.lat !== null &&
      clientLookup.lng !== null
    ) {
      clientVantage = { lat: clientLookup.lat, lng: clientLookup.lng };
      clientPlaceId = clientLookup.placeId;
      clientPhotosCountFromStep0 = clientLookup.photosCount;
      log(
        `[RANKING] [${rankingId}] Step 0: client vantage = ${clientVantage.lat.toFixed(4)},${clientVantage.lng.toFixed(4)} (placeId=${clientPlaceId})`,
      );
    } else {
      log(
        `[RANKING] [${rankingId}] Step 0: client lookup did not return coordinates — proceeding without location bias`,
      );
      searchStatus = "bias_unavailable";
    }
  } catch (err: any) {
    log(
      `[RANKING] [${rankingId}] Step 0: client lookup failed: ${err.message}`,
    );
    searchStatus = "bias_unavailable";
  }

  // Sub-step 2: Location-biased competitor search via Places API
  try {
    discoveredCompetitors = await discoverCompetitorsViaPlaces(
      specialty,
      marketLocation,
      20,
      clientVantage
        ? {
            lat: clientVantage.lat,
            lng: clientVantage.lng,
            radiusMeters: competitorDiscoveryRadiusMeters,
          }
        : undefined,
    );
    log(
      `[RANKING] [${rankingId}] Step 0: ${discoveredCompetitors.length} competitors from Places searchText`,
    );
  } catch (err: any) {
    log(
      `[RANKING] [${rankingId}] Step 0: Places searchText failed: ${err.message}. Falling back to unbiased discovery so Practice Health still has data.`,
    );
    searchStatus = "api_error";
    try {
      discoveredCompetitors = await discoverCompetitorsViaPlaces(
        specialty,
        marketLocation,
        20,
      );
    } catch (fallbackErr: any) {
      log(
        `[RANKING] [${rankingId}] Step 0: fallback discovery also failed: ${fallbackErr.message}`,
      );
      discoveredCompetitors = [];
    }
  }

  // Sub-step 2.5: Photos-count freshening — independent of position source.
  // The searchText field mask returns a photos count we may want to prefer over
  // the Step 0 lookup. Keep this even after the Apify swap so Practice Health
  // scoring continues to see the freshest photos count.
  if (clientPlaceId) {
    const clientFromDiscovery = discoveredCompetitors.find(
      (c: any) => c.placeId === clientPlaceId,
    );
    if (
      clientFromDiscovery &&
      (clientFromDiscovery.photosCount ?? 0) > clientPhotosCountFromStep0
    ) {
      clientPhotosCountFromStep0 = clientFromDiscovery.photosCount;
    }
  }

  // Sub-step 3: Live Google Maps position lookup via Apify.
  // The Maps panel ordering for "{specialty} in {marketLocation}" — what a real
  // searcher in the area sees — is what users perceive as "Live Google Rank".
  // This is a different surface from the Places API `searchText` ranking used
  // above for competitor discovery; the two coexist intentionally.
  // Spec: plans/04282026-no-ticket-live-google-rank-apify-maps-swap/spec.md (T2)
  let searchPositionSource: "apify_maps" | "places_text" | null = null;
  let apifyOrderedResults: Array<{
    placeId: string;
    name: string;
    position: number;
    rating: number;
    reviewCount: number;
    primaryType: string;
    isClient: boolean;
  }> | null = null;

  if (clientPlaceId) {
    // Pass the Identifier Agent's resolved city/state/county/postalCode straight
    // through to Apify so the Maps query is scoped correctly even when the
    // composite marketLocation string is a placeholder like "Unknown, XX".
    const apifyResult = await getSearchPositionViaApifyMaps(
      searchQuery,
      clientPlaceId,
      locationParams,
    );

    if (apifyResult.status === "ok") {
      searchPosition = apifyResult.position;
      searchStatus = "ok";
      searchPositionSource = "apify_maps";
      apifyOrderedResults = apifyResult.orderedResults;
      log(
        `[RANKING] [${rankingId}] Step 0: Apify Maps position = ${searchPosition} of ${apifyResult.resultCount}`,
      );
    } else if (apifyResult.status === "not_in_top_20") {
      searchPosition = null;
      searchStatus = "not_in_top_20";
      searchPositionSource = "apify_maps";
      apifyOrderedResults = apifyResult.orderedResults;
      log(
        `[RANKING] [${rankingId}] Step 0: Apify Maps returned ${apifyResult.resultCount} results, client not in top set`,
      );
    } else {
      // Apify failed — leave searchStatus as it was set by Sub-step 1/2 (which
      // may already be "bias_unavailable" or "api_error"). If Sub-step 2 still
      // succeeded with a placeId match in the Places API result set, fall back
      // to that for continuity.
      log(
        `[RANKING] [${rankingId}] Step 0: Apify Maps failed — falling back to Places API position if available`,
      );
      const clientIndex = discoveredCompetitors.findIndex(
        (c: any) => c.placeId === clientPlaceId,
      );
      if (clientIndex >= 0) {
        searchPosition = clientIndex + 1;
        searchStatus = "ok";
        searchPositionSource = "places_text";
        log(
          `[RANKING] [${rankingId}] Step 0: Places API fallback position = ${searchPosition}`,
        );
      } else {
        searchStatus = "api_error";
        searchPositionSource = null;
      }
    }
  } else {
    log(
      `[RANKING] [${rankingId}] Step 0: skipping Apify Maps lookup (no clientPlaceId)`,
    );
  }

  // Sub-step 4: Build search_results jsonb. Prefer the Apify ordered list so
  // the rankings UI table reflects the Maps panel that the Live Google Rank
  // number measures. Fall back to Places API discoveries when Apify did not
  // produce results, so the table still has *something* to render.
  const searchResultsPayload: SearchResultPayloadEntry[] =
    apifyOrderedResults !== null && apifyOrderedResults.length > 0
      ? apifyOrderedResults.map((r) => ({
          placeId: r.placeId,
          name: r.name,
          position: r.position,
          rating: r.rating,
          reviewCount: r.reviewCount,
          primaryType: r.primaryType,
          types: [] as string[],
          isClient: r.isClient,
        }))
      : discoveredCompetitors.map((c: any, idx: number) => ({
          placeId: c.placeId,
          name: c.name,
          position: idx + 1,
          rating: c.totalScore ?? 0,
          reviewCount: c.reviewsCount ?? 0,
          primaryType: c.primaryType ?? "",
          types: c.types ?? [],
          isClient: clientPlaceId !== null && c.placeId === clientPlaceId,
        }));

  // Sub-step 5: Persist Step 0 fields immediately so they survive later-step failures
  await db("practice_rankings")
    .where({ id: rankingId })
    .update({
      search_position: searchPosition,
      search_query: searchQuery,
      search_lat: clientVantage?.lat ?? null,
      search_lng: clientVantage?.lng ?? null,
      search_radius_meters: clientVantage ? competitorDiscoveryRadiusMeters : null,
      search_results: JSON.stringify(searchResultsPayload),
      competitor_discovery_radius_meters: competitorDiscoveryRadiusMeters,
      search_checked_at: new Date(),
      search_status: searchStatus,
      search_position_source: searchPositionSource,
      updated_at: new Date(),
    });

  log(
    `[RANKING] [${rankingId}] Step 0 complete: status=${searchStatus}, position=${
      searchPosition ?? "n/a"
    }, source=${searchPositionSource ?? "n/a"}, places_api_competitors=${discoveredCompetitors.length}`,
  );

  // ========== STEP 0.5: Competitor Source Resolution (v2) ==========
  // For finalized locations (user has curated their competitor list), swap
  // discoveredCompetitors with the curated set so Practice Health scoring runs
  // against the user's chosen comparison group. Search Position above is
  // unaffected — it always uses raw Google top-N.
  // Spec: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
  const resolved = await resolveCompetitorsForRanking(
    rankingId,
    discoveredCompetitors,
    log,
  );
  discoveredCompetitors = resolved.competitors;
  await db("practice_rankings")
    .where({ id: rankingId })
    .update({
      competitor_source: resolved.source,
      updated_at: new Date(),
    });
  log(
    `[RANKING] [${rankingId}] Competitor source resolved: ${resolved.source}, ${discoveredCompetitors.length} competitors used for Practice Health`,
  );
  const selectedCompetitorMapsContext = buildSelectedCompetitorMapsContext(
    discoveredCompetitors,
    searchResultsPayload,
    searchStatus,
  );

  // ========== STEP 1: Fetch GBP Data ==========
  await updateStatus(
    rankingId,
    "processing",
    "fetching_client_gbp",
    `Fetching GBP data for ${gbpLocationName}...`,
    10,
    statusDetail,
    log,
  );

  const targetLocation = propertyIds?.gbp?.find(
    (loc: any) =>
      loc.locationId === gbpLocationId && loc.accountId === gbpAccountId,
  );

  if (!targetLocation) {
    throw new Error(
      `GBP location ${gbpLocationId} not found in account ${googleAccountId}`,
    );
  }

  let clientGbpData: any;
  try {
    clientGbpData = await fetchGBPDataForRange(
      oauth2Client,
      [targetLocation],
      startDateStr,
      endDateStr,
      {
        refreshOAuth2Client: async () => {
          oauth2Client = await getValidOAuth2Client(googleAccountId, {
            forceRefresh: true,
          });
          return oauth2Client;
        },
        throwOnLocationError: true,
      },
    );
  } catch (error: any) {
    const message =
      "Google Business Profile data could not be loaded. Reconnect Google or retry the ranking after token refresh.";
    await markRankingFailed(
      rankingId,
      "fetching_client_gbp",
      message,
      error,
      statusDetail,
      log,
    );
    throw error;
  }

  if (!clientGbpData?.locations?.[0]?.data) {
    const error = new Error(
      `GBP data missing for ${gbpLocationName} (${gbpLocationId})`,
    );
    await markRankingFailed(
      rankingId,
      "fetching_client_gbp",
      "Google Business Profile data is missing, so Practice Health cannot be calculated safely.",
      error,
      statusDetail,
      log,
    );
    throw error;
  }

  // ========== STEP 2: Discover Competitors ==========
  // The competitor list was already fetched in Step 0 via location-biased Places
  // searchText. We trust Google's ordering verbatim — no filterBySpecialty
  // post-filter (per spec: Option A, "trust Google, no post-filter"). The same
  // unfiltered set drives both the Search Position display and Practice Health
  // scoring downstream.
  //
  // The legacy competitor_cache module is intentionally bypassed on this path —
  // its (specialty + marketLocation) key is incompatible with per-practice
  // location bias. The cache module stays in place for any other callers.
  await updateStatus(
    rankingId,
    "processing",
    "discovering_competitors",
    `Using ${discoveredCompetitors.length} competitors from Google Places`,
    30,
    statusDetail,
    log,
  );

  const usedCache = false;

  // ========== STEP 3: Deep Scrape Competitors ==========
  await updateStatus(
    rankingId,
    "processing",
    "scraping_competitors",
    `Scraping ${discoveredCompetitors.length} competitors...`,
    50,
    statusDetail,
    log,
  );

  // Use custom keywords from Identifier Agent if provided, otherwise fallback to hardcoded
  const specialtyKeywords =
    keywords && keywords.length > 0
      ? keywords
      : getSpecialtyKeywords(specialty);
  log(
    `[RANKING] [${rankingId}] Using ${specialtyKeywords.length} keywords (source: ${keywords && keywords.length > 0 ? "Identifier Agent" : "hardcoded"})`,
  );
  let competitorDetails: any[] = [];

  try {
    const competitorPlaceIds = discoveredCompetitors.map((c) => c.placeId);
    competitorDetails = await getCompetitorDetails(
      competitorPlaceIds,
      specialtyKeywords,
    );
    const withReviews = competitorDetails.filter((c) => c.totalReviews > 0).length;
    const withRatings = competitorDetails.filter((c) => c.averageRating > 0).length;
    log(
      `[RANKING] [${rankingId}] Deep scrape: ${competitorDetails.length} competitors, ${withReviews} with review data, ${withRatings} with ratings`,
    );
  } catch (error: any) {
    log(
      `[RANKING] [${rankingId}] Detailed scrape failed, using discovery fallback: ${error.message}`,
    );
    competitorDetails = discoveredCompetitors.map((comp) => {
      const hasKeywordInName = specialtyKeywords.some((keyword) =>
        comp.name.toLowerCase().includes(keyword.toLowerCase()),
      );
      return {
        placeId: comp.placeId,
        name: comp.name,
        address: comp.address,
        categories: [comp.category],
        primaryCategory: comp.category,
        totalReviews: comp.reviewsCount,
        averageRating: comp.totalScore,
        reviewsLast30d: 0,
        reviewsLast90d: 0,
        photosCount: 0,
        postsLast90d: 0,
        hasWebsite: !!comp.website,
        hasPhone: !!comp.phone,
        hasHours: true,
        hoursComplete: true,
        descriptionLength: 0,
        hasKeywordInName,
        website: comp.website,
        phone: comp.phone,
      };
    });
  }

  // Enrich competitors with accurate review counts from Google Places API
  // (Apify actor regression: reviewsCount returns null, reviews array capped at maxReviews=10)
  try {
    competitorDetails = await enrichCompetitorReviewCounts(competitorDetails);
  } catch (error: any) {
    log(
      `[RANKING] [${rankingId}] Review count enrichment failed, continuing with Apify data: ${error.message}`,
    );
  }

  // Filter client out of competitors by exact placeId (when available from Step 0).
  // Falls back to fuzzy name match only if Step 0 couldn't resolve the client's placeId
  // (bias_unavailable / api_error states).
  if (clientPlaceId) {
    competitorDetails = competitorDetails.filter(
      (comp) => comp.placeId !== clientPlaceId,
    );
  } else {
    const clientNameLower = gbpLocationName.toLowerCase().trim();
    competitorDetails = competitorDetails.filter((comp) => {
      const compNameLower = (comp.name || "").toLowerCase().trim();
      if (compNameLower === clientNameLower) return false;
      if (
        compNameLower.includes(clientNameLower) ||
        clientNameLower.includes(compNameLower)
      ) {
        const shorterLength = Math.min(
          compNameLower.length,
          clientNameLower.length,
        );
        const longerLength = Math.max(
          compNameLower.length,
          clientNameLower.length,
        );
        if (shorterLength / longerLength > 0.5) return false;
      }
      return true;
    });
  }

  // ========== STEP 4: Website Audit ==========
  await updateStatus(
    rankingId,
    "processing",
    "auditing_website",
    "Auditing client website...",
    60,
    statusDetail,
    log,
  );

  let websiteAudit = null;
  const clientWebsite = targetLocation?.website || `https://${domain}`;
  try {
    websiteAudit = await auditWebsite(clientWebsite);
  } catch (error: any) {
    log(`[RANKING] [${rankingId}] Website audit failed: ${error.message}`);
  }

  // ========== STEP 5: Calculate Scores ==========
  await updateStatus(
    rankingId,
    "processing",
    "calculating_scores",
    "Calculating ranking scores...",
    80,
    statusDetail,
    log,
  );

  const clientLocation = clientGbpData?.locations?.[0];
  const gbpData = clientLocation?.data;
  const profileData = gbpData?.profile;

  // Fetch local posts for last 30 days via GBP API
  let postsLast30d = 0;
  try {
    const postsEndDate = new Date();
    const postsStartDate = new Date();
    postsStartDate.setDate(postsStartDate.getDate() - 30);
    const postsStart = postsStartDate.toISOString().split("T")[0];
    const postsEnd = postsEndDate.toISOString().split("T")[0];

    log(
      `[RANKING] [${rankingId}] Fetching posts for ${gbpAccountId}/${gbpLocationId} from ${postsStart} to ${postsEnd}`,
    );

    const localPosts = await listLocalPostsInRange(
      oauth2Client,
      gbpAccountId,
      gbpLocationId,
      postsStart,
      postsEnd,
      50,
    );
    postsLast30d = localPosts.length;
    log(
      `[RANKING] [${rankingId}] ✓ Fetched ${postsLast30d} posts from last 30 days`,
    );
  } catch (error: any) {
    log(`[RANKING] [${rankingId}] ✗ Failed to fetch posts: ${error.message}`);
    // Continue with postsLast30d = 0 if fetch fails
  }

  // Reuse the client photos count captured in Step 0 — no extra Places API call needed.
  // Step 0 already looked the client up via Places, and the searchText field mask
  // includes places.photos. Falls back to a fresh lookup only if Step 0 didn't resolve
  // the client (clientPlaceId is null).
  let clientPhotosCount = clientPhotosCountFromStep0;
  if (!clientPlaceId) {
    try {
      log(
        `[RANKING] [${rankingId}] Step 0 had no client placeId — fetching client photos directly: "${gbpLocationName}" in "${marketLocation}"`,
      );
      const clientPhotosResult = await getClientPhotosViaPlaces(
        gbpLocationName,
        marketLocation,
      );
      clientPhotosCount = clientPhotosResult.photosCount;
      if (clientPhotosResult.placeId) {
        log(
          `[RANKING] [${rankingId}] ✓ Client photos: ${clientPhotosCount} (Place ID: ${clientPhotosResult.placeId})`,
        );
      } else {
        log(
          `[RANKING] [${rankingId}] ✗ Could not match client in Places API results`,
        );
      }
    } catch (error: any) {
      log(
        `[RANKING] [${rankingId}] ✗ Failed to fetch client photos: ${error.message}`,
      );
      // Continue with clientPhotosCount = 0 if fetch fails
    }
  }

  const clientPracticeData: PracticeData = {
    name: gbpLocationName || profileData?.title || domain,
    primaryCategory: profileData?.primaryCategory || "Dentist",
    secondaryCategories: profileData?.additionalCategories || [],
    totalReviews: gbpData?.reviews?.allTime?.totalReviewCount || 0,
    averageRating: gbpData?.reviews?.allTime?.averageRating || 0,
    reviewsLast30d: gbpData?.reviews?.window?.newReviews || 0,
    postsLast30d: postsLast30d,
    hasWebsite: !!profileData?.websiteUri,
    hasPhone: !!profileData?.phoneNumber,
    hasHours: !!profileData?.hasHours,
    hoursComplete: profileData?.hasHours || false,
    descriptionLength: profileData?.description?.length || 0,
    photosCount: clientPhotosCount,
  };

  // Pass keywords to ranking algorithm for the "keyword in name" scoring factor
  const clientRanking = calculateRankingScore(
    clientPracticeData,
    specialty,
    specialtyKeywords,
  );

  const competitorsForRanking = competitorDetails.map((comp) => ({
    id: comp.placeId,
    data: {
      name: comp.name,
      primaryCategory: comp.primaryCategory,
      secondaryCategories: comp.categories,
      totalReviews: comp.totalReviews,
      averageRating: comp.averageRating,
      reviewsLast30d: comp.reviewsLast30d || 0,
      postsLast30d: comp.postsLast90d || 0,
      hasWebsite: comp.hasWebsite,
      hasPhone: comp.hasPhone,
      hasHours: comp.hasHours,
      hoursComplete: comp.hoursComplete,
      descriptionLength: comp.descriptionLength,
      photosCount: comp.photosCount,
    } as PracticeData,
  }));

  const allPractices = [
    { id: "client", data: clientPracticeData },
    ...competitorsForRanking,
  ];

  // Rank by 6-factor competitive score (excludes velocity + activity which are client-only)
  const rankedPractices = rankPractices(
    allPractices,
    specialty,
    specialtyKeywords,
    "competitive",
  );
  const clientRankResult = rankedPractices.find((p) => p.id === "client");

  const benchmarks = calculateBenchmarks(
    competitorDetails.map((c) => ({
      totalReviews: c.totalReviews,
      averageRating: c.averageRating,
      reviewsLast30d: c.reviewsLast30d,
    })),
  );

  const performanceMetrics = extractPerformanceMetrics(gbpData);

  const rawData = {
    client_gbp: {
      totalReviewCount: clientPracticeData.totalReviews,
      averageRating: clientPracticeData.averageRating,
      primaryCategory: clientPracticeData.primaryCategory,
      reviewsLast30d: clientPracticeData.reviewsLast30d,
      postsLast30d: clientPracticeData.postsLast30d,
      photosCount: clientPracticeData.photosCount || 0,
      hasWebsite: clientPracticeData.hasWebsite,
      hasPhone: clientPracticeData.hasPhone,
      hasHours: clientPracticeData.hasHours,
      performance: performanceMetrics,
      gbpLocationId,
      gbpAccountId,
      gbpLocationName,
      _raw: clientGbpData,
    },
    competitors: rankedPractices
      .filter((p) => p.id !== "client")
      .slice(0, 20)
      .map((p) => {
        const details = competitorDetails.find((c) => c.placeId === p.id);
        return {
          name: details?.name || "Unknown",
          placeId: p.id,
          rankScore: p.competitiveScore,
          rankPosition: p.rankPosition,
          totalReviews: details?.totalReviews || 0,
          averageRating: details?.averageRating || 0,
          reviewsLast30d: details?.reviewsLast30d || 0,
          primaryCategory: details?.primaryCategory || "Unknown",
          hasKeywordInName: details?.hasKeywordInName || false,
          photosCount: details?.photosCount || 0,
          postsLast90d: details?.postsLast90d || 0,
        };
      }),
    competitors_discovered: competitorDetails.length,
    competitors_from_cache: usedCache,
    competitor_discovery_radius_meters: competitorDiscoveryRadiusMeters,
    website_audit: websiteAudit,
  };

  const rankingFactors = {
    category_match: {
      score:
        clientRanking.factors.categoryMatch.score /
        clientRanking.factors.categoryMatch.max,
      weighted: clientRanking.factors.categoryMatch.score,
      weight: FACTOR_WEIGHTS.categoryMatch,
      details: clientRanking.factors.categoryMatch.details,
    },
    review_count: {
      score:
        clientRanking.factors.reviewCount.score /
        clientRanking.factors.reviewCount.max,
      weighted: clientRanking.factors.reviewCount.score,
      weight: FACTOR_WEIGHTS.reviewCount,
      value: clientPracticeData.totalReviews,
      details: clientRanking.factors.reviewCount.details,
    },
    star_rating: {
      score:
        clientRanking.factors.starRating.score /
        clientRanking.factors.starRating.max,
      weighted: clientRanking.factors.starRating.score,
      weight: FACTOR_WEIGHTS.starRating,
      value: clientPracticeData.averageRating,
      details: clientRanking.factors.starRating.details,
    },
    keyword_name: {
      score:
        clientRanking.factors.keywordName.score /
        clientRanking.factors.keywordName.max,
      weighted: clientRanking.factors.keywordName.score,
      weight: FACTOR_WEIGHTS.keywordName,
      details: clientRanking.factors.keywordName.details,
    },
    review_velocity: {
      score:
        clientRanking.factors.reviewVelocity.score /
        clientRanking.factors.reviewVelocity.max,
      weighted: clientRanking.factors.reviewVelocity.score,
      weight: FACTOR_WEIGHTS.reviewVelocity,
      value: clientPracticeData.reviewsLast30d,
      details: clientRanking.factors.reviewVelocity.details,
    },
    nap_consistency: {
      score:
        clientRanking.factors.napConsistency.score /
        clientRanking.factors.napConsistency.max,
      weighted: clientRanking.factors.napConsistency.score,
      weight: FACTOR_WEIGHTS.napConsistency,
      details: clientRanking.factors.napConsistency.details,
    },
    gbp_activity: {
      score:
        clientRanking.factors.gbpActivity.score /
        clientRanking.factors.gbpActivity.max,
      weighted: clientRanking.factors.gbpActivity.score,
      weight: FACTOR_WEIGHTS.gbpActivity,
      value: clientPracticeData.postsLast30d,
      details: clientRanking.factors.gbpActivity.details,
    },
    sentiment: {
      score:
        clientRanking.factors.sentiment.score /
        clientRanking.factors.sentiment.max,
      weighted: clientRanking.factors.sentiment.score,
      weight: FACTOR_WEIGHTS.sentiment,
      details: clientRanking.factors.sentiment.details,
    },
  };

  await db("practice_rankings")
    .where({ id: rankingId })
    .update({
      rank_score:
        clientRankResult?.competitiveScore || clientRanking.totalScore,
      rank_position: clientRankResult?.rankPosition || 1,
      total_competitors: competitorDetails.length + 1,
      ranking_factors: JSON.stringify(rankingFactors),
      raw_data: JSON.stringify(rawData),
      updated_at: new Date(),
    });

  // ========== STEP 6: Send to LLM ==========
  await updateStatus(
    rankingId,
    "processing",
    "awaiting_llm",
    "Sending to AI for gap analysis...",
    90,
    statusDetail,
    log,
  );

  // Get the ranking record for task creation context
  const ranking = await db("practice_rankings")
    .where({ id: rankingId })
    .first();

  // Build Search Position context for the LLM (Practice Health + Search Position split).
  // Includes the live Google query, the client's position, and the top 5 with isClient flags.
  const top5SearchResults = searchResultsPayload.slice(0, 5).map((entry) => ({
    rank: entry.position,
    name: entry.name,
    review_count: entry.reviewCount,
    rating: entry.rating,
    is_client: entry.isClient,
  }));

  const llmPayload: RankingLlmPayload = {
    additional_data: {
      practice_ranking_id: rankingId,
      batch_id: batchId,
      client: {
        domain,
        practice_name: gbpLocationName,
        specialty,
        location: marketLocation,
        gbp_location_id: gbpLocationId,
        gbp_account_id: gbpAccountId,
        rank_score: clientRanking.totalScore,
        rank_position: clientRankResult?.rankPosition || 1,
        total_competitors: competitorDetails.length,
        factors: rankingFactors,
        gbp_data: {
          business_name: clientPracticeData.name,
          total_reviews: clientPracticeData.totalReviews,
          average_rating: clientPracticeData.averageRating,
          reviews_last_30d: clientPracticeData.reviewsLast30d,
          primary_category: clientPracticeData.primaryCategory,
        },
        website_audit: websiteAudit,
      },
      competitors: rawData.competitors.slice(0, 5),
      benchmarks,
      search_position: {
        query: searchQuery,
        position: searchPosition,
        status: searchStatus,
        not_in_top_20: searchStatus === "not_in_top_20",
        top_5: top5SearchResults,
        selected_competitors: selectedCompetitorMapsContext,
        discovery_radius_meters: competitorDiscoveryRadiusMeters,
      },
    },
  };

  await runRankingAnalysis(rankingId, llmPayload, ranking, statusDetail, log);

  log(
    `[RANKING] [${rankingId}] COMPLETE in ${(
      (Date.now() - startTime) /
      1000
    ).toFixed(1)}s`,
  );

  return {
    rankingId,
    gbpLocationId,
    gbpLocationName,
    rankScore:
      clientRankResult?.competitiveScore || clientRanking.totalScore,
    rankPosition: clientRankResult?.rankPosition || 1,
  };
}
