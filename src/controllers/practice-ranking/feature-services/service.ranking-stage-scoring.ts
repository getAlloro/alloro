/**
 * Ranking Pipeline Stage: Score Calculation
 *
 * Step 5 of processLocationRanking, extracted verbatim: fetch posts + client
 * photos, build the client PracticeData, rank against competitors, compute
 * benchmarks + factors, assemble raw_data, and persist scores.
 *
 * Behavior-preserving: identical status writes, fetch fallbacks, ranking calls,
 * curated review-velocity enrichment, raw_data/ranking_factors shapes, the
 * scores DB write, and pipeline-timing records.
 */

import { listLocalPostsInRange } from "../../../routes/gbp";
import { getClientPhotosViaPlaces } from "./service.places-competitor-discovery";
import {
  calculateRankingScore,
  rankPractices,
  calculateBenchmarks,
  PracticeData,
  FACTOR_WEIGHTS,
} from "./service.ranking-algorithm";
import { enrichSelectedCompetitorReviewVelocity } from "./service.ranking-stage-gbp-competitors";
import { updateStatus, StatusDetail } from "./service.ranking-status";
import { PracticeRankingModel } from "../../../models/PracticeRankingModel";
import { buildClientGbpDisplayFields } from "../feature-utils/util.client-gbp-display";
import {
  beginPipelineTiming,
  finishPipelineTiming,
  PipelineTimingRecord,
} from "../feature-utils/util.ranking-pipeline-timing";
import {
  extractPerformanceMetrics,
  finiteNumber,
} from "../feature-utils/util.ranking-pipeline-helpers";

export interface ScoringStageInput {
  rankingId: number;
  gbpAccountId: string;
  gbpLocationId: string;
  gbpLocationName: string;
  domain: string;
  specialty: string;
  marketLocation: string;
  oauth2Client: any;
  clientPlaceId: string | null;
  clientPhotosCountFromStep0: number;
  competitorDiscoveryRadiusMeters: number;
  specialtyKeywords: string[];
  competitorDetails: any[];
  gbpData: any;
  profileData: any;
  clientGbpData: any;
  websiteAudit: any;
  usedCache: boolean;
  resolvedSource: string;
  rankingRunContext: any;
  statusDetail: StatusDetail;
  log: (msg: string) => void;
  pipelineTimings: PipelineTimingRecord[];
}

export interface ScoringStageResult {
  competitorDetails: any[];
  clientPracticeData: PracticeData;
  clientRanking: ReturnType<typeof calculateRankingScore>;
  clientRankResult: ReturnType<typeof rankPractices>[number] | undefined;
  benchmarks: ReturnType<typeof calculateBenchmarks>;
  rawData: any;
  rankingFactors: any;
}

/**
 * Run Step 5 (score calculation). Returns the scoring artifacts the LLM stage
 * and the final result need; the (possibly re-enriched) competitorDetails is
 * returned so the orchestrator keeps threading the same array.
 */
export async function runScoringStage(
  input: ScoringStageInput,
): Promise<ScoringStageResult> {
  const {
    rankingId,
    gbpAccountId,
    gbpLocationId,
    gbpLocationName,
    domain,
    specialty,
    marketLocation,
    oauth2Client,
    clientPlaceId,
    clientPhotosCountFromStep0,
    competitorDiscoveryRadiusMeters,
    specialtyKeywords,
    gbpData,
    profileData,
    clientGbpData,
    websiteAudit,
    usedCache,
    resolvedSource,
    rankingRunContext,
    statusDetail,
    log,
    pipelineTimings,
  } = input;
  let competitorDetails = input.competitorDetails;

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

  // Fetch local posts for last 30 days via GBP API
  const postsTiming = beginPipelineTiming("posts");
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
    finishPipelineTiming(
      pipelineTimings,
      postsTiming,
      "success",
      `posts=${postsLast30d}`,
    );
  } catch (error: any) {
    finishPipelineTiming(pipelineTimings, postsTiming, "failed", error.message);
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

  const scoreCalculationTiming = beginPipelineTiming("score_calculation");
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

  if (resolvedSource === "curated") {
    competitorDetails = await enrichSelectedCompetitorReviewVelocity({
      rankingId,
      locationId: rankingRunContext?.location_id ?? null,
      competitorDetails,
      specialtyKeywords,
      pipelineTimings,
      log,
    });
  }

  const benchmarks = calculateBenchmarks(
    competitorDetails.map((c) => ({
      totalReviews: c.totalReviews,
      averageRating: c.averageRating,
      reviewsLast30d: c.reviewsLast30d,
    })),
  );

  const performanceMetrics = extractPerformanceMetrics(gbpData);

  // Persist the REAL nullable review figures for DISPLAY, not the algorithm's
  // coerced numbers — see util.client-gbp-display. The scoring input
  // (clientPracticeData) still coerces to 0 for the ranking math; only the
  // dashboard-facing fields become nullable. Historical rows keep their baked-in
  // 0 — this is a forward fix.
  const clientGbpDisplay = buildClientGbpDisplayFields(gbpData);
  const rawData = {
    client_gbp: {
      totalReviewCount: clientGbpDisplay.totalReviewCount,
      averageRating: clientGbpDisplay.averageRating,
      primaryCategory: clientPracticeData.primaryCategory,
      reviewsLast30d: clientGbpDisplay.reviewsLast30d,
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
        const reviewsLast30d = finiteNumber(details?.reviewsLast30d);
        const reviewsLast90d = finiteNumber(details?.reviewsLast90d);
        return {
          name: details?.name || "Unknown",
          placeId: p.id,
          address: details?.address || null,
          rankScore: p.competitiveScore,
          rankPosition: p.rankPosition,
          totalReviews: details?.totalReviews || 0,
          averageRating: details?.averageRating || 0,
          reviewsLast30d,
          reviewsLast90d,
          reviewVelocitySource:
            details?.reviewVelocitySource || "not_measured",
          reviewVelocityMeasuredAt: details?.reviewVelocityMeasuredAt || null,
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
    pipeline_timings: pipelineTimings,
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
  finishPipelineTiming(
    pipelineTimings,
    scoreCalculationTiming,
    "success",
    `score=${clientRanking.totalScore};rank=${clientRankResult?.rankPosition ?? "unmatched"}`,
  );

  await PracticeRankingModel.updateByIdRaw(rankingId, {
    rank_score: clientRankResult?.competitiveScore || clientRanking.totalScore,
    rank_position: clientRankResult?.rankPosition ?? null,
    total_competitors: competitorDetails.length + 1,
    ranking_factors: JSON.stringify(rankingFactors),
    raw_data: JSON.stringify(rawData),
    updated_at: new Date(),
  });

  return {
    competitorDetails,
    clientPracticeData,
    clientRanking,
    clientRankResult,
    benchmarks,
    rawData,
    rankingFactors,
  };
}
