/**
 * Ranking Pipeline Stage: Client GBP + Competitor Scrape
 *
 * Steps 1-3 of processLocationRanking, extracted verbatim:
 *   - Step 1 fetch client GBP data (prefetch reuse or retrying fetch)
 *   - Step 2 discover competitors (status-only; set already resolved in Step 0.5)
 *   - Step 3 deep-scrape competitor details + review-count enrichment + client filter
 *
 * Also owns the selected-competitor review-velocity enrichment helpers, which the
 * scoring stage calls for curated runs.
 *
 * Behavior-preserving: identical retry/backoff, OAuth refresh, markRankingFailed
 * paths, fallbacks, and pipeline-timing records. The OAuth client is threaded in
 * and the (possibly-refreshed) client returned so later stages reuse the token.
 */

import { getValidOAuth2Client } from "../../../auth/oauth2Helper";
import { fetchGBPDataForRange } from "../../../utils/dataAggregation/dataAggregator";
import {
  getCompetitorDetails,
  enrichCompetitorReviewCounts,
  getSpecialtyKeywords,
} from "./service.apify";
import {
  isRetryableExternalError,
  runWithRetry,
  summarizeRetryAttempts,
} from "./service.ranking-resilience";
import { updateStatus, markRankingFailed, StatusDetail } from "./service.ranking-status";
import { PracticeRankingModel } from "../../../models/PracticeRankingModel";
import { parseJsonField } from "../feature-utils/util.json-parser";
import {
  beginPipelineTiming,
  finishPipelineTiming,
  PipelineTimingRecord,
} from "../feature-utils/util.ranking-pipeline-timing";
import {
  buildClientGbpDataFromPrefetch,
  buildCompetitorDetailFromDiscovery,
  finiteNumber,
  hasFreshCuratedCompetitorMetadata,
  hasMeasuredReviewVelocity,
  isMatchingPrefetchedClientGbpData,
  markVelocityMeasured,
  markVelocityNotMeasured,
  ProcessLocationRankingOptions,
  ReviewVelocityMeasurement,
  ReviewVelocitySource,
  SELECTED_COMPETITOR_VELOCITY_CACHE_MS,
} from "../feature-utils/util.ranking-pipeline-helpers";

// Match the original pipeline, where the OAuth client flowed untyped (`any`).
// Inferred from getValidOAuth2Client so the type stays in lockstep with the helper.
type RankingOAuth2Client = Awaited<ReturnType<typeof getValidOAuth2Client>>;

async function loadCachedSelectedCompetitorVelocity(
  rankingId: number,
  locationId: number,
  placeIds: string[],
): Promise<Map<string, ReviewVelocityMeasurement>> {
  const remaining = new Set(placeIds);
  const measurements = new Map<string, ReviewVelocityMeasurement>();
  if (remaining.size === 0) return measurements;

  const minObservedAt = new Date(
    Date.now() - SELECTED_COMPETITOR_VELOCITY_CACHE_MS,
  );
  const rows = await PracticeRankingModel.findRecentRawDataByLocation(
    locationId,
    rankingId,
    minObservedAt,
  );

  for (const row of rows) {
    const rawData = parseJsonField(row.raw_data);
    const competitors = Array.isArray(rawData?.competitors)
      ? rawData.competitors
      : [];
    const observedAt =
      row.observed_at instanceof Date
        ? row.observed_at
        : new Date(row.observed_at);

    for (const competitor of competitors) {
      const placeId =
        typeof competitor?.placeId === "string" ? competitor.placeId : null;
      if (!placeId || !remaining.has(placeId)) continue;

      const reviewsLast30d = finiteNumber(competitor.reviewsLast30d);
      if (reviewsLast30d === null) continue;

      const source = competitor.reviewVelocitySource;
      const hasExplicitMeasuredSource =
        source === "apify" || source === "cache";
      if (!hasExplicitMeasuredSource && reviewsLast30d <= 0) continue;

      const measuredAt = parseVelocityMeasuredAtLocal(
        competitor.reviewVelocityMeasuredAt,
        observedAt,
      );
      if (
        !measuredAt ||
        Date.now() - measuredAt.getTime() >
          SELECTED_COMPETITOR_VELOCITY_CACHE_MS
      ) {
        continue;
      }

      measurements.set(placeId, {
        reviewsLast30d,
        reviewsLast90d: finiteNumber(competitor.reviewsLast90d),
        source: "cache",
        measuredAt: measuredAt.toISOString(),
      });
      remaining.delete(placeId);
    }

    if (remaining.size === 0) break;
  }

  return measurements;
}

function parseVelocityMeasuredAtLocal(
  value: unknown,
  fallback: Date,
): Date | null {
  const measuredAt =
    typeof value === "string" && value.trim() ? new Date(value) : fallback;
  return Number.isNaN(measuredAt.getTime()) ? null : measuredAt;
}

export async function enrichSelectedCompetitorReviewVelocity({
  rankingId,
  locationId,
  competitorDetails,
  specialtyKeywords,
  pipelineTimings,
  log,
}: {
  rankingId: number;
  locationId: number | null;
  competitorDetails: any[];
  specialtyKeywords: string[];
  pipelineTimings: PipelineTimingRecord[];
  log: (message: string) => void;
}): Promise<any[]> {
  const velocityTiming = beginPipelineTiming("selected_competitor_velocity");
  if (!locationId || competitorDetails.length === 0) {
    finishPipelineTiming(
      pipelineTimings,
      velocityTiming,
      "skipped",
      "no_selected_competitors",
    );
    return competitorDetails;
  }

  try {
    const placeIds = competitorDetails
      .map((detail) => detail?.placeId)
      .filter((placeId): placeId is string => typeof placeId === "string");
    const alreadyMeasured = competitorDetails.filter(
      hasMeasuredReviewVelocity,
    ).length;
    const cache = await loadCachedSelectedCompetitorVelocity(
      rankingId,
      locationId,
      placeIds,
    );
    let cachedCount = 0;

    let enriched = competitorDetails.map((detail) => {
      if (hasMeasuredReviewVelocity(detail)) return detail;
      const cached = cache.get(detail?.placeId);
      if (!cached) return markVelocityNotMeasured(detail);
      cachedCount++;
      return {
        ...detail,
        reviewsLast30d: cached.reviewsLast30d,
        reviewsLast90d: cached.reviewsLast90d,
        reviewVelocitySource: cached.source,
        reviewVelocityMeasuredAt: cached.measuredAt,
      };
    });

    const missingPlaceIds = enriched
      .filter((detail) => !hasMeasuredReviewVelocity(detail))
      .map((detail) => detail?.placeId)
      .filter((placeId): placeId is string => typeof placeId === "string");
    let scrapedCount = 0;
    let scrapeError: string | null = null;

    if (missingPlaceIds.length > 0) {
      const measuredAt = new Date().toISOString();
      try {
        const scrapedDetails = await getCompetitorDetails(
          missingPlaceIds,
          specialtyKeywords,
        );
        scrapedCount = scrapedDetails.length;
        const scrapedByPlaceId = new Map(
          scrapedDetails.map((detail) => [detail.placeId, detail]),
        );

        enriched = enriched.map((detail) => {
          const scraped = scrapedByPlaceId.get(detail?.placeId);
          if (!scraped) return detail;
          return {
            ...detail,
            reviewsLast30d: finiteNumber(scraped.reviewsLast30d) ?? 0,
            reviewsLast90d: finiteNumber(scraped.reviewsLast90d),
            reviewVelocitySource: "apify" as ReviewVelocitySource,
            reviewVelocityMeasuredAt: measuredAt,
          };
        });
      } catch (error: any) {
        scrapeError = error.message;
        log(
          `[RANKING] [${rankingId}] Selected competitor velocity scrape failed: ${error.message}`,
        );
      }
    }

    const unknownCount = enriched.filter(
      (detail) => !hasMeasuredReviewVelocity(detail),
    ).length;
    finishPipelineTiming(
      pipelineTimings,
      velocityTiming,
      scrapeError
        ? "failed"
        : cachedCount > 0 || scrapedCount > 0
          ? "success"
          : "skipped",
      `already_measured=${alreadyMeasured};cached=${cachedCount};scraped=${scrapedCount};unknown=${unknownCount}${
        scrapeError ? `;scrape_error=${scrapeError}` : ""
      }`,
    );
    log(
      `[RANKING] [${rankingId}] Selected competitor velocity: already_measured=${alreadyMeasured}, cached=${cachedCount}, scraped=${scrapedCount}, unknown=${unknownCount}`,
    );
    return enriched;
  } catch (error: any) {
    finishPipelineTiming(
      pipelineTimings,
      velocityTiming,
      "failed",
      error.message,
    );
    log(
      `[RANKING] [${rankingId}] Selected competitor velocity unavailable: ${error.message}`,
    );
    return competitorDetails.map((detail) =>
      hasMeasuredReviewVelocity(detail)
        ? detail
        : markVelocityNotMeasured(detail),
    );
  }
}

export interface GbpCompetitorsStageInput {
  rankingId: number;
  googleAccountId: number;
  gbpAccountId: string;
  gbpLocationId: string;
  gbpLocationName: string;
  propertyIds: any;
  oauth2Client: RankingOAuth2Client;
  startDateStr: string;
  endDateStr: string;
  options: ProcessLocationRankingOptions;
  specialty: string;
  keywords: string[] | undefined;
  resolvedSource: string;
  clientPlaceId: string | null;
  discoveredCompetitors: any[];
  statusDetail: StatusDetail;
  log: (msg: string) => void;
  pipelineTimings: PipelineTimingRecord[];
}

export interface GbpCompetitorsStageResult {
  oauth2Client: RankingOAuth2Client;
  clientGbpData: any;
  specialtyKeywords: string[];
  competitorDetails: any[];
  usedCache: boolean;
  clientLocation: any;
  gbpData: any;
  profileData: any;
}

/**
 * Run Step 1 (client GBP fetch), Step 2 (discover — status only), and Step 3
 * (deep scrape + enrichment + client filter). Throws (after markRankingFailed)
 * when client GBP data cannot be loaded, matching the original behavior.
 */
export async function runGbpCompetitorsStage(
  input: GbpCompetitorsStageInput,
): Promise<GbpCompetitorsStageResult> {
  const {
    rankingId,
    googleAccountId,
    gbpAccountId,
    gbpLocationId,
    gbpLocationName,
    propertyIds,
    startDateStr,
    endDateStr,
    options,
    specialty,
    keywords,
    resolvedSource,
    clientPlaceId,
    discoveredCompetitors,
    statusDetail,
    log,
    pipelineTimings,
  } = input;
  let oauth2Client = input.oauth2Client;

  // ========== STEP 1: Fetch GBP Data ==========
  const clientGbpTiming = beginPipelineTiming("client_gbp");
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
  let clientGbpSource: "prefetch" | "fetched" = "fetched";
  let clientGbpRetrySummary = "attempts=0";
  try {
    if (
      isMatchingPrefetchedClientGbpData(
        options.prefetchedClientGbpData,
        targetLocation,
        startDateStr,
        endDateStr,
      )
    ) {
      clientGbpData = buildClientGbpDataFromPrefetch(
        options.prefetchedClientGbpData,
      );
      clientGbpSource = "prefetch";
      log(
        `[RANKING] [${rankingId}] Step 1: reused pre-fetched GBP payload for ${gbpAccountId}/${gbpLocationId}`,
      );
    } else {
      const gbpFetchResult = await runWithRetry(
        () =>
          fetchGBPDataForRange(
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
          ),
        {
          label: `GBP data fetch ${gbpAccountId}/${gbpLocationId}`,
          maxAttempts: 3,
          logger: log,
          shouldRetry: isRetryableExternalError,
        },
      );
      clientGbpData = gbpFetchResult.value;
      clientGbpRetrySummary = summarizeRetryAttempts(gbpFetchResult.attempts);
      log(
        `[RANKING] [${rankingId}] Step 1: GBP fetch ${clientGbpRetrySummary}`,
      );
      clientGbpSource = "fetched";
    }
  } catch (error: any) {
    finishPipelineTiming(
      pipelineTimings,
      clientGbpTiming,
      "failed",
      `${error.message};${summarizeRetryAttempts(error.retryAttempts || [])}`,
    );
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
    finishPipelineTiming(
      pipelineTimings,
      clientGbpTiming,
      "failed",
      error.message,
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
  finishPipelineTiming(
    pipelineTimings,
    clientGbpTiming,
    "success",
    `source=${clientGbpSource};${clientGbpRetrySummary}`,
  );

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
  const competitorDetailsTiming = beginPipelineTiming("competitor_details");

  try {
    if (resolvedSource === "curated") {
      const reusableDetails = new Map<string, any>();
      const staleCompetitors: any[] = [];

      for (const competitor of discoveredCompetitors) {
        if (hasFreshCuratedCompetitorMetadata(competitor)) {
          reusableDetails.set(
            competitor.placeId,
            buildCompetitorDetailFromDiscovery(competitor, specialtyKeywords),
          );
        } else {
          staleCompetitors.push(competitor);
        }
      }

      const scrapedVelocityMeasuredAt = new Date().toISOString();
      const scrapedDetails =
        staleCompetitors.length > 0
          ? await getCompetitorDetails(
              staleCompetitors.map((c) => c.placeId),
              specialtyKeywords,
            )
          : [];
      const scrapedByPlaceId = new Map(
        scrapedDetails.map((detail) => [
          detail.placeId,
          markVelocityMeasured(detail, "apify", scrapedVelocityMeasuredAt),
        ]),
      );

      competitorDetails = discoveredCompetitors
        .map((competitor) => {
          return (
            reusableDetails.get(competitor.placeId) ||
            scrapedByPlaceId.get(competitor.placeId)
          );
        })
        .filter(Boolean);

      log(
        `[RANKING] [${rankingId}] Curated competitor details: reused ${reusableDetails.size}, scraped ${scrapedDetails.length}`,
      );
      finishPipelineTiming(
        pipelineTimings,
        competitorDetailsTiming,
        staleCompetitors.length > 0 ? "success" : "skipped",
        `reused=${reusableDetails.size};scraped=${scrapedDetails.length};${summarizeRetryAttempts(
          (scrapedDetails as any).retryAttempts || [],
        )}`,
      );
    } else {
      const competitorPlaceIds = discoveredCompetitors.map((c) => c.placeId);
      const scrapedVelocityMeasuredAt = new Date().toISOString();
      competitorDetails = (
        await getCompetitorDetails(competitorPlaceIds, specialtyKeywords)
      ).map((detail) =>
        markVelocityMeasured(detail, "apify", scrapedVelocityMeasuredAt),
      );
      finishPipelineTiming(
        pipelineTimings,
        competitorDetailsTiming,
        "success",
        `scraped=${competitorDetails.length};${summarizeRetryAttempts(
          (competitorDetails as any).retryAttempts || [],
        )}`,
      );
    }

    const withReviews = competitorDetails.filter(
      (c) => c.totalReviews > 0,
    ).length;
    const withRatings = competitorDetails.filter(
      (c) => c.averageRating > 0,
    ).length;
    log(
      `[RANKING] [${rankingId}] Competitor details: ${competitorDetails.length} competitors, ${withReviews} with review data, ${withRatings} with ratings`,
    );
  } catch (error: any) {
    finishPipelineTiming(
      pipelineTimings,
      competitorDetailsTiming,
      "failed",
      `${error.message};${summarizeRetryAttempts(error.retryAttempts || [])}`,
    );
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
        reviewsLast30d: null,
        reviewsLast90d: null,
        reviewVelocitySource: "not_measured",
        reviewVelocityMeasuredAt: null,
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

  const clientLocation = clientGbpData?.locations?.[0];
  const gbpData = clientLocation?.data;
  const profileData = gbpData?.profile;

  return {
    oauth2Client,
    clientGbpData,
    specialtyKeywords,
    competitorDetails,
    usedCache,
    clientLocation,
    gbpData,
    profileData,
  };
}
