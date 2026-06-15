/**
 * Ranking Pipeline Stage: Search Position + Competitor Resolution
 *
 * Steps 0 and 0.5 of processLocationRanking, extracted verbatim:
 *   - Step 0   live Google search-position lookup (Places + SerpApi Maps)
 *   - Step 0.5 competitor source resolution (curated vs discovered)
 *
 * Behavior-preserving: identical sub-step order, fallback chain, status writes,
 * search_results payload construction, and pipeline-timing records.
 */

import { getSearchPositionViaSerpApiMaps } from "./service.serpapi-maps";
import {
  discoverCompetitorsViaPlaces,
  getClientPhotosViaPlaces,
} from "./service.places-competitor-discovery";
import { resolveCompetitorsForRanking } from "./service.competitor-source-resolver";
import { summarizeRetryAttempts } from "./service.ranking-resilience";
import { updateStatus, StatusDetail } from "./service.ranking-status";
import { PracticeRankingModel } from "../../../models/PracticeRankingModel";
import {
  beginPipelineTiming,
  finishPipelineTiming,
  PipelineTimingRecord,
} from "../feature-utils/util.ranking-pipeline-timing";
import {
  buildSelectedCompetitorMapsContext,
  SearchResultPayloadEntry,
  SearchStatus,
  SelectedCompetitorMapsContext,
} from "../feature-utils/util.ranking-pipeline-helpers";

export interface SearchPositionStageInput {
  rankingId: number;
  gbpLocationName: string;
  marketLocation: string;
  specialty: string;
  competitorDiscoveryRadiusMeters: number;
  statusDetail: StatusDetail;
  log: (msg: string) => void;
  pipelineTimings: PipelineTimingRecord[];
}

export interface SearchPositionStageResult {
  clientVantage: { lat: number; lng: number } | null;
  clientPlaceId: string | null;
  clientPhotosCountFromStep0: number;
  searchStatus: SearchStatus;
  searchPosition: number | null;
  searchPositionSource: "serpapi_maps" | "apify_maps" | "places_text" | null;
  searchQuery: string;
  discoveredCompetitors: any[];
  searchResultsPayload: SearchResultPayloadEntry[];
  resolvedSource: string;
  selectedCompetitorMapsContext: SelectedCompetitorMapsContext[];
}

/**
 * Run Step 0 (search position) and Step 0.5 (competitor source resolution).
 *
 * `discoveredCompetitors` returned here is the post-resolution set used for
 * Practice Health scoring; `searchResultsPayload` reflects the live Maps panel.
 */
export async function runSearchPositionStage(
  input: SearchPositionStageInput,
): Promise<SearchPositionStageResult> {
  const {
    rankingId,
    gbpLocationName,
    marketLocation,
    specialty,
    competitorDiscoveryRadiusMeters,
    statusDetail,
    log,
    pipelineTimings,
  } = input;

  // ========== STEP 0: Search Position (live Google data) ==========
  // Fetch the client's position in Google Places for "{specialty} in {marketLocation}",
  // using the practice's own coordinates as the location bias. The same competitor
  // set drives Practice Health scoring (Option A — see spec).
  // Spec: plans/04122026-no-ticket-practice-health-search-position-split/spec.md
  const searchPositionTiming = beginPipelineTiming("search_position");
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
  let searchStatus: SearchStatus = "ok";
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

  // Sub-step 3: Live Google Maps position lookup via SerpApi.
  // The Maps panel ordering for "{specialty} in {marketLocation}" — what a real
  // searcher in the area sees — is what users perceive as "Live Google Rank".
  // This is a different surface from the Places API `searchText` ranking used
  // above for competitor discovery; the two coexist intentionally.
  // Spec: plans/05142026-no-ticket-serpapi-maps-rank-source/spec.md (T2)
  let searchPositionSource: "serpapi_maps" | "apify_maps" | "places_text" | null =
    null;
  let serpApiMapsRetrySummary = "serpapi_attempts=0";
  let mapsOrderedResults: Array<{
    placeId: string;
    name: string;
    position: number;
    rating: number;
    reviewCount: number;
    primaryType: string;
    isClient: boolean;
  }> | null = null;

  if (clientPlaceId && clientVantage) {
    const serpApiResult = await getSearchPositionViaSerpApiMaps(
      searchQuery,
      clientPlaceId,
      clientVantage,
    );
    serpApiMapsRetrySummary = summarizeRetryAttempts(
      serpApiResult.retryAttempts || [],
    ).replace(/^attempts=/, "serpapi_attempts=");

    if (serpApiResult.status === "ok") {
      searchPosition = serpApiResult.position;
      searchStatus = "ok";
      searchPositionSource = "serpapi_maps";
      mapsOrderedResults = serpApiResult.orderedResults;
      log(
        `[RANKING] [${rankingId}] Step 0: SerpApi Maps position = ${searchPosition} of ${serpApiResult.resultCount}`,
      );
    } else if (serpApiResult.status === "not_in_top_20") {
      searchPosition = null;
      searchStatus = "not_in_top_20";
      searchPositionSource = "serpapi_maps";
      mapsOrderedResults = serpApiResult.orderedResults;
      log(
        `[RANKING] [${rankingId}] Step 0: SerpApi Maps returned ${serpApiResult.resultCount} results, client not in top set`,
      );
    } else {
      // SerpApi failed — leave searchStatus as it was set by Sub-step 1/2
      // where possible. If Sub-step 2 still succeeded with a placeId match in
      // the Places API result set, fall back to that for continuity. Do not
      // silently fall back to Apify for this headline estimate.
      log(
        `[RANKING] [${rankingId}] Step 0: SerpApi Maps failed — falling back to Places API position if available`,
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
  } else if (clientPlaceId) {
    log(
      `[RANKING] [${rankingId}] Step 0: skipping SerpApi Maps lookup (no client coordinates)`,
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
    }
  } else {
    log(
      `[RANKING] [${rankingId}] Step 0: skipping SerpApi Maps lookup (no clientPlaceId)`,
    );
  }

  // Sub-step 4: Build search_results jsonb. Prefer the SerpApi ordered list so
  // the rankings UI table reflects the Maps panel that the Live Google Rank
  // number measures. Fall back to Places API discoveries when SerpApi did not
  // produce results, so the table still has *something* to render.
  const searchResultsPayload: SearchResultPayloadEntry[] =
    mapsOrderedResults !== null && mapsOrderedResults.length > 0
      ? mapsOrderedResults.map((r) => ({
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
  await PracticeRankingModel.updateByIdRaw(rankingId, {
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
  finishPipelineTiming(
    pipelineTimings,
    searchPositionTiming,
    "success",
    `status=${searchStatus};position=${searchPosition ?? "n/a"};source=${searchPositionSource ?? "n/a"};${serpApiMapsRetrySummary}`,
  );

  // ========== STEP 0.5: Competitor Source Resolution (v2) ==========
  // For finalized locations (user has curated their competitor list), swap
  // discoveredCompetitors with the curated set so Practice Health scoring runs
  // against the user's chosen comparison group. Search Position above is
  // unaffected — it always uses raw Google top-N.
  // Spec: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
  const competitorResolutionTiming = beginPipelineTiming(
    "competitor_resolution",
  );
  const resolved = await resolveCompetitorsForRanking(
    rankingId,
    discoveredCompetitors,
    log,
  );
  discoveredCompetitors = resolved.competitors;
  await PracticeRankingModel.updateByIdRaw(rankingId, {
    competitor_source: resolved.source,
    updated_at: new Date(),
  });
  log(
    `[RANKING] [${rankingId}] Competitor source resolved: ${resolved.source}, ${discoveredCompetitors.length} competitors used for Practice Health`,
  );
  finishPipelineTiming(
    pipelineTimings,
    competitorResolutionTiming,
    "success",
    `source=${resolved.source};competitors=${discoveredCompetitors.length}`,
  );
  const selectedCompetitorMapsContext = buildSelectedCompetitorMapsContext(
    discoveredCompetitors,
    searchResultsPayload,
    searchStatus,
  );

  return {
    clientVantage,
    clientPlaceId,
    clientPhotosCountFromStep0,
    searchStatus,
    searchPosition,
    searchPositionSource,
    searchQuery,
    discoveredCompetitors,
    searchResultsPayload,
    resolvedSource: resolved.source,
    selectedCompetitorMapsContext,
  };
}
