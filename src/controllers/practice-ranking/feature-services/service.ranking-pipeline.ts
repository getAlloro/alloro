/**
 * Ranking Pipeline (orchestrator)
 *
 * Shared logic for Practice Ranking Analysis.
 * Used by:
 * - src/routes/practiceRanking.ts (Admin Trigger)
 * - src/routes/agentsV2.ts (Automated API Run)
 *
 * processLocationRanking sets up per-run context (account, OAuth, dates) then
 * runs the pipeline stages in order, threading state between them:
 *   Step 0/0.5  service.ranking-stage-search-position
 *   Step 1-3    service.ranking-stage-gbp-competitors
 *   Step 4      service.ranking-stage-audit
 *   Step 5      service.ranking-stage-scoring
 *   Step 6      service.ranking-stage-llm
 *
 * This file is a thin orchestrator: the stages own their logic verbatim, the DB
 * lives in models, and the public import surface (processLocationRanking,
 * MAX_RETRIES, RETRY_DELAY_MS, PrefetchedClientGbpData, updateStatus,
 * StatusDetail) stays importable from this path via re-exports below.
 */

// Aliased to avoid shadowing the optional `logger` PARAM used below.
import appLogger from "../../../lib/logger";
import { getValidOAuth2Client } from "../../../auth/oauth2Helper";
import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import { PracticeRankingModel } from "../../../models/PracticeRankingModel";
import { DEFAULT_COMPETITOR_DISCOVERY_RADIUS_METERS } from "../feature-utils/util.competitor-validator";
import { OrganizationLifecycleService } from "../../../services/OrganizationLifecycleService";
import { PipelineTimingRecord } from "../feature-utils/util.ranking-pipeline-timing";
import {
  LocationParams,
  LocationRankingResult,
  ProcessLocationRankingOptions,
} from "../feature-utils/util.ranking-pipeline-helpers";
import { StatusDetail } from "./service.ranking-status";
import { runSearchPositionStage } from "./service.ranking-stage-search-position";
import { runGbpCompetitorsStage } from "./service.ranking-stage-gbp-competitors";
import { runWebsiteAuditStage } from "./service.ranking-stage-audit";
import { runScoringStage } from "./service.ranking-stage-scoring";
import { runLlmStage } from "./service.ranking-stage-llm";

// Batch processing configuration
export const MAX_RETRIES = 3;
export const RETRY_DELAY_MS = 5000;

// Re-exported to preserve the historical import surface from this module path.
export { updateStatus } from "./service.ranking-status";
export type { StatusDetail } from "./service.ranking-status";
export type {
  PrefetchedClientGbpData,
  ProcessLocationRankingOptions,
  LocationParams,
  LocationRankingResult,
} from "../feature-utils/util.ranking-pipeline-helpers";
export type { PipelineTimingRecord } from "../feature-utils/util.ranking-pipeline-timing";

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
 * @param options - Optional execution context such as pre-fetched client GBP data
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
  options: ProcessLocationRankingOptions = {},
): Promise<LocationRankingResult> {
  const startTime = Date.now();
  const log = logger || ((msg: string) => appLogger.info(msg));
  const pipelineTimings: PipelineTimingRecord[] = [];

  log(
    `[RANKING] [${rankingId}] START: ${gbpLocationName} (${specialty} in ${marketLocation})`,
  );

  const statusDetail: StatusDetail = {
    currentStep: "queued",
    message: "Analysis queued",
    progress: 0,
    stepsCompleted: [],
    timestamps: { started_at: new Date().toISOString() },
  };

  // Get account details
  const account = await GoogleConnectionModel.findById(googleAccountId);

  if (!account) {
    throw new Error(`Account ${googleAccountId} not found`);
  }

  const rankingRunContext =
    await PracticeRankingModel.findRankingRunContext(rankingId);
  const competitorDiscoveryRadiusMeters = Number(
    rankingRunContext?.ranking_discovery_radius ??
      rankingRunContext?.location_discovery_radius ??
      DEFAULT_COMPETITOR_DISCOVERY_RADIUS_METERS,
  );

  const organizationId =
    rankingRunContext?.organization_id ?? account.organization_id;
  if (organizationId) {
    await OrganizationLifecycleService.assertActive(Number(organizationId));
  }

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

  // ========== STEP 0 + 0.5: Search Position + Competitor Resolution ==========
  const searchStage = await runSearchPositionStage({
    rankingId,
    gbpLocationName,
    marketLocation,
    specialty,
    competitorDiscoveryRadiusMeters,
    statusDetail,
    log,
    pipelineTimings,
  });

  // ========== STEP 1-3: Client GBP + Competitor Scrape ==========
  const competitorStage = await runGbpCompetitorsStage({
    rankingId,
    googleAccountId,
    gbpAccountId,
    gbpLocationId,
    gbpLocationName,
    propertyIds,
    oauth2Client,
    startDateStr,
    endDateStr,
    options,
    specialty,
    keywords,
    resolvedSource: searchStage.resolvedSource,
    clientPlaceId: searchStage.clientPlaceId,
    discoveredCompetitors: searchStage.discoveredCompetitors,
    statusDetail,
    log,
    pipelineTimings,
  });
  // The GBP fetch may have force-refreshed the OAuth client; reuse it downstream.
  oauth2Client = competitorStage.oauth2Client;

  // ========== STEP 4: Website Audit ==========
  const websiteAudit = await runWebsiteAuditStage({
    rankingId,
    domain,
    profileData: competitorStage.profileData,
    statusDetail,
    log,
    pipelineTimings,
  });

  // ========== STEP 5: Calculate Scores ==========
  const scoringStage = await runScoringStage({
    rankingId,
    gbpAccountId,
    gbpLocationId,
    gbpLocationName,
    domain,
    specialty,
    marketLocation,
    oauth2Client,
    clientPlaceId: searchStage.clientPlaceId,
    clientPhotosCountFromStep0: searchStage.clientPhotosCountFromStep0,
    competitorDiscoveryRadiusMeters,
    specialtyKeywords: competitorStage.specialtyKeywords,
    competitorDetails: competitorStage.competitorDetails,
    gbpData: competitorStage.gbpData,
    profileData: competitorStage.profileData,
    clientGbpData: competitorStage.clientGbpData,
    websiteAudit,
    usedCache: competitorStage.usedCache,
    resolvedSource: searchStage.resolvedSource,
    rankingRunContext,
    statusDetail,
    log,
    pipelineTimings,
  });

  // ========== STEP 6: Send to LLM ==========
  await runLlmStage({
    rankingId,
    batchId,
    domain,
    gbpLocationName,
    specialty,
    marketLocation,
    gbpLocationId,
    gbpAccountId,
    competitorDiscoveryRadiusMeters,
    searchQuery: searchStage.searchQuery,
    searchPosition: searchStage.searchPosition,
    searchStatus: searchStage.searchStatus,
    searchResultsPayload: searchStage.searchResultsPayload,
    selectedCompetitorMapsContext: searchStage.selectedCompetitorMapsContext,
    clientPracticeData: scoringStage.clientPracticeData,
    clientRanking: scoringStage.clientRanking,
    clientRankResult: scoringStage.clientRankResult,
    competitorDetails: scoringStage.competitorDetails,
    rankingFactors: scoringStage.rankingFactors,
    benchmarks: scoringStage.benchmarks,
    rawData: scoringStage.rawData,
    websiteAudit,
    account,
    rankingRunContext,
    statusDetail,
    log,
    pipelineTimings,
  });

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
      scoringStage.clientRankResult?.competitiveScore ||
      scoringStage.clientRanking.totalScore,
    rankPosition: scoringStage.clientRankResult?.rankPosition || 1,
  };
}
