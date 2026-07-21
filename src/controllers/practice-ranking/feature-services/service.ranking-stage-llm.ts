/**
 * Ranking Pipeline Stage: LLM Gap Analysis
 *
 * Step 6 of processLocationRanking, extracted verbatim: build the engagement
 * summary + Search Position context, assemble the LLM payload, run the analysis,
 * then persist the final raw_data (with completed pipeline timings).
 *
 * Behavior-preserving: identical status write, payload shape, runRankingAnalysis
 * call, timing record, and the final raw_data DB write.
 */

import { runRankingAnalysis, RankingLlmPayload } from "./service.ranking-llm";
import { summarizeRetryAttempts } from "./service.ranking-resilience";
import { updateStatus, StatusDetail } from "./service.ranking-status";
import { GbpLocalPostModel } from "../../../models/GbpLocalPostModel";
import { ReviewModel } from "../../../models/website-builder/ReviewModel";
import { PracticeRankingModel } from "../../../models/PracticeRankingModel";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { resolveOrgType } from "../../../config/orgLabels";
import {
  beginPipelineTiming,
  finishPipelineTiming,
  PipelineTimingRecord,
} from "../feature-utils/util.ranking-pipeline-timing";
import {
  daysSinceDate,
  POST_FRESHNESS_WINDOW_DAYS,
  SearchResultPayloadEntry,
  SearchStatus,
  SelectedCompetitorMapsContext,
} from "../feature-utils/util.ranking-pipeline-helpers";

async function buildRankingEngagementSummary(params: {
  organizationId: number | null;
  locationId: number | null;
  photosCount: number;
  log: (msg: string) => void;
}): Promise<
  RankingLlmPayload["additional_data"]["engagement_summary"] | null
> {
  const { organizationId, locationId, photosCount, log } = params;
  if (!organizationId || !locationId) return null;

  try {
    const [counts, posts] = await Promise.all([
      ReviewModel.getReplyabilityCounts(locationId),
      GbpLocalPostModel.listForLocation({
        organizationId,
        locationId,
        page: 1,
        limit: 1,
      }),
    ]);
    const latestPost = posts.data[0] ?? null;
    const latestPostAt =
      latestPost?.create_time || latestPost?.update_time || null;
    const latestPostAgeDays = daysSinceDate(latestPostAt);

    return {
      unanswered_reviews_total: counts.replyable_oauth,
      unanswered_reviews_last_30d: counts.replyable_oauth_last_30d,
      all_reviews_replied: counts.replyable_oauth === 0,
      published_posts_total: posts.total,
      latest_post_age_days: latestPostAgeDays,
      latest_post_at: latestPostAt
        ? new Date(latestPostAt).toISOString()
        : null,
      has_recent_post_15d:
        latestPostAgeDays !== null
          ? latestPostAgeDays <= POST_FRESHNESS_WINDOW_DAYS
          : false,
      post_freshness_window_days: POST_FRESHNESS_WINDOW_DAYS,
      photos_count: photosCount,
    };
  } catch (error: any) {
    log(`[RANKING] Failed to build engagement summary for LLM: ${error.message}`);
    return null;
  }
}

export interface LlmStageInput {
  rankingId: number;
  batchId: string;
  domain: string;
  gbpLocationName: string;
  specialty: string;
  marketLocation: string;
  gbpLocationId: string;
  gbpAccountId: string;
  competitorDiscoveryRadiusMeters: number;
  searchQuery: string;
  searchPosition: number | null;
  searchStatus: SearchStatus;
  searchResultsPayload: SearchResultPayloadEntry[];
  selectedCompetitorMapsContext: SelectedCompetitorMapsContext[];
  clientPracticeData: any;
  clientRanking: any;
  clientRankResult: any;
  competitorDetails: any[];
  rankingFactors: any;
  benchmarks: any;
  rawData: any;
  websiteAudit: any;
  account: any;
  rankingRunContext: any;
  statusDetail: StatusDetail;
  log: (msg: string) => void;
  pipelineTimings: PipelineTimingRecord[];
}

/**
 * Run Step 6 (LLM gap analysis). Persists the final raw_data with completed
 * pipeline timings. The headline result is unchanged — the orchestrator returns
 * the scoring artifacts it already holds.
 */
export async function runLlmStage(input: LlmStageInput): Promise<void> {
  const {
    rankingId,
    batchId,
    domain,
    gbpLocationName,
    specialty,
    marketLocation,
    gbpLocationId,
    gbpAccountId,
    competitorDiscoveryRadiusMeters,
    searchQuery,
    searchPosition,
    searchStatus,
    searchResultsPayload,
    selectedCompetitorMapsContext,
    clientPracticeData,
    clientRanking,
    clientRankResult,
    competitorDetails,
    rankingFactors,
    benchmarks,
    rawData,
    websiteAudit,
    account,
    rankingRunContext,
    statusDetail,
    log,
    pipelineTimings,
  } = input;

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

  // Get the ranking record for the persisted analysis context.
  const ranking = await PracticeRankingModel.findRawById(rankingId);

  // Build Search Position context for the LLM (Practice Health + Search Position split).
  // Includes the live Google query, the client's position, and the top 5 with isClient flags.
  const top5SearchResults = searchResultsPayload.slice(0, 5).map((entry) => ({
    rank: entry.position,
    name: entry.name,
    review_count: entry.reviewCount,
    rating: entry.rating,
    is_client: entry.isClient,
  }));
  const ownerVisibleScore = Math.round(clientRanking.totalScore);
  const rawOrganizationIdForEngagement = Number(
    rankingRunContext?.organization_id ?? account.organization_id ?? 0,
  );
  const organizationIdForEngagement =
    Number.isFinite(rawOrganizationIdForEngagement) &&
    rawOrganizationIdForEngagement > 0
      ? rawOrganizationIdForEngagement
      : null;
  const engagementSummary = await buildRankingEngagementSummary({
    organizationId: organizationIdForEngagement,
    locationId: rankingRunContext?.location_id ?? null,
    photosCount: clientPracticeData.photosCount || 0,
    log,
  });

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
        rank_score: ownerVisibleScore,
        visible_local_search_score: ownerVisibleScore,
        rank_position: clientRankResult?.rankPosition ?? null,
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
      engagement_summary: engagementSummary ?? undefined,
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

  const orgType = resolveOrgType(
    organizationIdForEngagement
      ? (await OrganizationModel.findById(organizationIdForEngagement))
          ?.organization_type
      : null,
  );

  const llmTiming = beginPipelineTiming("llm");
  const llmResult = await runRankingAnalysis(
    rankingId,
    llmPayload,
    ranking,
    statusDetail,
    orgType,
    log,
  );
  finishPipelineTiming(
    pipelineTimings,
    llmTiming,
    llmResult.success ? "success" : "failed",
    llmResult.success
      ? `tokens=${llmResult.inputTokens ?? "n/a"}/${llmResult.outputTokens ?? "n/a"};${summarizeRetryAttempts(
          llmResult.retryAttempts || [],
        )}`
      : `${llmResult.error};${summarizeRetryAttempts(
          llmResult.retryAttempts || [],
        )}`,
  );
  rawData.pipeline_timings = pipelineTimings;
  await PracticeRankingModel.updateByIdRaw(rankingId, {
    raw_data: JSON.stringify(rawData),
    updated_at: new Date(),
  });
}
