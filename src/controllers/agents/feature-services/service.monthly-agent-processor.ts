/**
 * Monthly Agent Processor
 *
 * Monthly agents pipeline (Plan 1: RE → dashboard-metrics → Summary v2) for a
 * single client. Owns GBP/PMS/Rybbit data fetch, the Referral Engine and
 * Summary v2 retry loops (3 attempts each), the deterministic dashboard-metrics
 * compute between them and post-Zod Summary validators. Returns outputs + raw
 * data in memory for persistence by the caller.
 *
 * Split out of service.agent-orchestrator.ts in the decomposition pass —
 * behavior identical. Re-exported from service.agent-orchestrator.ts to
 * preserve the existing import surface.
 */

import {
  fetchAllServiceData,
  GooglePropertyIds,
} from "../../../utils/dataAggregation/dataAggregator";
import { aggregatePmsData } from "../../../utils/pms/pmsAggregator";
import { log, delay, isValidAgentOutput, logError, logAgentOutput } from "../feature-utils/agentLogger";
import { getPreviousMonthRange } from "../feature-utils/dateHelpers";
import {
  buildSummaryPayload,
  buildReferralEnginePayload,
} from "./service.agent-input-builder";
import { resolveLocationId } from "../../../utils/locationResolver";
import { GooglePropertyModel } from "../../../models/GooglePropertyModel";
import { fetchRybbitMonthlyComparison } from "../../../utils/rybbit/service.rybbit-data";
import type {
  OpportunityAgentOutput,
  CroOptimizerAgentOutput,
  ReferralEngineAgentOutput,
  SummaryV2Output,
} from "../types/agent-output-schemas";
import {
  ReferralEngineAgentOutputSchema,
  SummaryV2OutputSchema,
} from "../types/agent-output-schemas";
// Plan 1: dashboard-metrics service runs between RE and Summary
import { computeDashboardMetrics } from "../../../utils/dashboard-metrics/service.dashboard-metrics";
import { fetchLatestRankingRecommendations } from "./service.ranking-recommendations";
import type { DashboardMetrics } from "../../../utils/dashboard-metrics/types";
import { runMonthlyAgent } from "./service.monthly-agent-runner-core";
import {
  validateSummarySupportingMetrics,
  validateSummaryHighlights,
} from "../feature-utils/summaryV2Validators";

/**
 * Process monthly agents (Plan 1: RE → dashboard-metrics → Summary v2) for a single client.
 *
 * Order changed in Plan 1: RE runs first to produce specialist analysis;
 * dashboard-metrics computes the deterministic dictionary (consuming RE's output);
 * Summary v2 runs last as Chief-of-Staff with full context (PMS, GBP, analytics,
 * referral_engine_output, dashboard_metrics) and writes the practice's monthly
 * top_actions[]. Opportunity and CRO Optimizer are disabled (preserved on disk).
 */
export async function processMonthlyAgents(
  account: any,
  oauth2Client: any,
  monthRange: ReturnType<typeof getPreviousMonthRange>,
  passedLocationId?: number | null,
  onProgress?: (subStep: string, message: string, agentCompleted?: string) => Promise<void>,
): Promise<{
  success: boolean;
  summaryOutput?: SummaryV2Output;
  referralEngineOutput?: ReferralEngineAgentOutput;
  /** @deprecated Disabled in Plan 1; always undefined. */
  opportunityOutput?: OpportunityAgentOutput;
  /** @deprecated Disabled in Plan 1; always undefined. */
  croOptimizerOutput?: CroOptimizerAgentOutput;
  dashboardMetrics?: DashboardMetrics;
  summaryPayload?: any;
  referralEnginePayload?: any;
  opportunityPayload?: any;
  croOptimizerPayload?: any;
  rawData?: any;
  skipped?: boolean;
  error?: string;
  agentResultIds?: {
    summary?: number;
    opportunity?: number;
    croOptimizer?: number;
    referralEngine?: number;
  };
}> {
  const { id: googleAccountId, domain_name: domain, organization_id: organizationId } = account;
  const { startDate, endDate } = monthRange;

  const monthlyStartTime = Date.now();
  log(
    `  [MONTHLY] Processing monthly agents for ${domain} (${startDate} to ${endDate})`,
  );

  // Use passed locationId if available, otherwise resolve from org
  const locationId = passedLocationId ?? await resolveLocationId(organizationId);
  log(`  [MONTHLY] Using locationId: ${locationId}${passedLocationId ? ' (from request)' : ' (resolved from org)'}`);

  // Shared meta for all agents
  const agentMeta = {
    organizationId,
    locationId: locationId || null,
    dateStart: startDate,
    dateEnd: endDate,
  };

  try {
    // Scope GBP data to the active location only
    let propertyIds: GooglePropertyIds = {};
    if (locationId) {
      const gbpProps = await GooglePropertyModel.findByLocationId(locationId);
      if (gbpProps.length > 0) {
        propertyIds = {
          gbp: gbpProps.map((p) => ({
            accountId: p.account_id || "",
            locationId: p.external_id,
            displayName: p.display_name || "",
          })),
        };
        log(`  [MONTHLY] Scoped GBP to location ${locationId} (${gbpProps.length} properties)`);
      }
    }
    // Fallback: if no location-scoped properties, parse from JSON blob
    if (!propertyIds.gbp || propertyIds.gbp.length === 0) {
      propertyIds = typeof account.google_property_ids === "string"
        ? JSON.parse(account.google_property_ids)
        : (account.google_property_ids || {});
      log(`  [MONTHLY] Using full JSON blob for GBP (${propertyIds.gbp?.length || 0} properties)`);
    }

    // Fetch month data (GBP)
    log(`  [MONTHLY] Fetching GBP data for ${startDate} to ${endDate}`);
    const monthData = await fetchAllServiceData(
      oauth2Client,
      googleAccountId,
      domain,
      propertyIds,
      startDate,
      endDate,
    );

    // Fetch aggregated PMS data across all approved submissions
    log(`  [MONTHLY] Fetching aggregated PMS data for org ${organizationId}`);
    let pmsData = null;
    let pmsDataForRE = null;
    try {
      const aggregated = await aggregatePmsData(organizationId, locationId ?? undefined);

      if (aggregated.months.length > 0) {
        // Full shape for Summary (includes per-month sources for narrative context)
        pmsData = {
          monthly_rollup: aggregated.months.map((month) => ({
            month: month.month,
            self_referrals: month.selfReferrals,
            doctor_referrals: month.doctorReferrals,
            total_referrals: month.totalReferrals,
            production_total: month.productionTotal,
            sources: month.sources,
          })),
          sources_summary: aggregated.sources,
          totals: aggregated.totals,
          patient_records: aggregated.patientRecords,
          data_quality_flags: aggregated.dataQualityFlags,
        };

        // Leaner shape for RE: pre-computed trends + dedup candidates
        // instead of raw per-month source arrays. O(1) on Claude input.
        pmsDataForRE = {
          monthly_totals: aggregated.months.map((month) => ({
            month: month.month,
            self_referrals: month.selfReferrals,
            doctor_referrals: month.doctorReferrals,
            total_referrals: month.totalReferrals,
            production_total: month.productionTotal,
          })),
          sources_summary: aggregated.sources,
          source_trends: aggregated.sourceTrends,
          dedup_candidates: aggregated.dedupCandidates,
          totals: aggregated.totals,
          data_quality_flags: aggregated.dataQualityFlags,
        };

        log(
          `  [MONTHLY] ✓ Aggregated PMS data found (${aggregated.months.length} months, ${aggregated.sources.length} sources, ${aggregated.sourceTrends.length} trends, ${aggregated.dedupCandidates.length} dedup candidates)`,
        );
      } else {
        log(`  [MONTHLY] ⚠ No approved PMS data found`);
      }
    } catch (pmsError: any) {
      log(
        `  [MONTHLY] ⚠ Error fetching aggregated PMS data: ${pmsError.message}`,
      );
    }

    // Fetch Rybbit website analytics (optional, non-blocking)
    log(`  [MONTHLY] Fetching Rybbit website analytics for org ${organizationId}`);
    let websiteAnalyticsMonthly = null;
    try {
      const prevStart = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() - 1, 1);
      const prevEnd = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth(), 0);
      const prevStartDate = prevStart.toISOString().split("T")[0];
      const prevEndDate = prevEnd.toISOString().split("T")[0];

      websiteAnalyticsMonthly = await fetchRybbitMonthlyComparison(
        organizationId,
        startDate,
        endDate,
        prevStartDate,
        prevEndDate,
      );

      if (websiteAnalyticsMonthly) {
        log(`  [MONTHLY] ✓ Rybbit data available (${prevStartDate}–${prevEndDate} vs ${startDate}–${endDate})`);
      } else {
        log(`  [MONTHLY] ⚠ No Rybbit data — proceeding with GBP + PMS only`);
      }
    } catch (rybbitError: any) {
      log(`  [MONTHLY] ⚠ Error fetching Rybbit data: ${rybbitError.message}`);
    }

    // Prepare raw data for potential DB storage
    const rawData = {
      organization_id: organizationId,
      location_id: locationId || null,
      domain,
      date_start: startDate,
      date_end: endDate,
      run_type: "monthly",
      gbp_data: monthData.gbpData,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const dataFetchDuration = Date.now() - monthlyStartTime;
    log(`  [MONTHLY] Data fetch complete (${dataFetchDuration}ms) — PMS: ${pmsData ? 'yes' : 'no'}, Rybbit: ${websiteAnalyticsMonthly ? 'yes' : 'no'}`);

    // === STEP 1: Referral Engine (Plan 1: now runs first to feed Summary as input) ===
    if (onProgress) await onProgress("referral_engine", "Running Referral Engine Agent...");
    const reStartTime = Date.now();
    log(`  [MONTHLY] Running Referral Engine agent (max 3 attempts)`);

    let referralEngineOutput: ReferralEngineAgentOutput | undefined;
    let referralEngineResultId: number | undefined;
    const MAX_REFERRAL_ATTEMPTS = 3;

    for (let refAttempt = 1; refAttempt <= MAX_REFERRAL_ATTEMPTS; refAttempt++) {
      if (refAttempt > 1) {
        log(`  [MONTHLY] 🔄 Referral Engine retry attempt ${refAttempt}/${MAX_REFERRAL_ATTEMPTS}`);
        log(`  [MONTHLY] Waiting 30 seconds before retry...`);
        if (onProgress) await onProgress("referral_engine", `Retrying Referral Engine (attempt ${refAttempt}/${MAX_REFERRAL_ATTEMPTS})...`);
        await delay(30000);
      }

      try {
        const referralPayload = buildReferralEnginePayload({
          domain,
          googleAccountId,
          startDate,
          endDate,
          pmsData: pmsDataForRE,
          websiteAnalytics: websiteAnalyticsMonthly,
        });

        const referralResult = await runMonthlyAgent({
          promptPath: "monthlyAgents/ReferralEngineAnalysis",
          payload: referralPayload,
          agentName: "Referral Engine",
          meta: { ...agentMeta, agentType: "referral_engine" },
          enableCache: true,
          outputSchema: ReferralEngineAgentOutputSchema,
          model: process.env.RE_AGENT_MODEL || undefined,
          maxTokens: 65536,
        });

        referralEngineOutput = referralResult.agentOutput;
        referralEngineResultId = referralResult.agentResultId;
        logAgentOutput("Referral Engine", referralEngineOutput);

        if (!isValidAgentOutput(referralEngineOutput, "Referral Engine")) {
          throw new Error("Referral Engine agent returned empty or invalid output");
        }

        const reDuration = Date.now() - reStartTime;
        log(`  [MONTHLY] ✓ Referral Engine completed on attempt ${refAttempt} (${reDuration}ms, ${referralEngineOutput?.doctor_referral_matrix?.length || 0} doctor rows, ${referralEngineOutput?.non_doctor_referral_matrix?.length || 0} non-doctor rows)`);
        break;
      } catch (refError: any) {
        const apiStatus = refError?.status ?? refError?.response?.status ?? null;
        const errorType = apiStatus === 429 ? "rate_limit" : apiStatus === 529 ? "overloaded" : apiStatus ? `api_${apiStatus}` : refError.message?.includes("non-JSON") ? "parse_failure" : "unknown";
        log(`  [MONTHLY] ⚠ Referral Engine attempt ${refAttempt}/${MAX_REFERRAL_ATTEMPTS} failed: type=${errorType} status=${apiStatus} message="${refError.message}"`);
        if (refError.stack) log(`  [MONTHLY] Stack: ${refError.stack.split("\n").slice(0, 3).join(" → ")}`);
        if (onProgress) await onProgress("referral_engine", `Referral Engine attempt ${refAttempt} failed (${errorType}). ${refAttempt < MAX_REFERRAL_ATTEMPTS ? "Retrying..." : "All attempts exhausted."}`);
        if (refAttempt === MAX_REFERRAL_ATTEMPTS) {
          return {
            success: false,
            error: `Referral Engine failed after ${MAX_REFERRAL_ATTEMPTS} attempts (last error: ${errorType}): ${refError.message}`,
          };
        }
      }
    }

    // === STEP 2: Compute deterministic dashboard metrics (Plan 1 NEW) ===
    // Note: no onProgress call here. dashboard_metrics is a sub-second
    // deterministic compute, not a real agent in MonthlyAgentKey /
    // MONTHLY_AGENT_CONFIG. A prior progress write here was throwing
    // "Cannot read properties of undefined (reading 'progressOffset')"
    // and crashing the entire monthly run between RE and Summary.
    log(`  [MONTHLY] Computing dashboard metrics`);
    let dashboardMetrics: DashboardMetrics | undefined;
    try {
      dashboardMetrics = await computeDashboardMetrics(
        organizationId,
        locationId ?? null,
        { start: startDate, end: endDate },
        referralEngineOutput ?? null,
      );
      log(`  [MONTHLY] ✓ Dashboard metrics computed`);
    } catch (metricsError: any) {
      log(`  [MONTHLY] ⚠ Dashboard metrics failed: ${metricsError.message}. Summary will run without metrics dictionary.`);
      dashboardMetrics = undefined;
    }

    // === STEP 3: Summary v2 — Chief-of-Staff (Plan 1: runs last with full context) ===
    // agentCompleted="referral_engine": flips RE's pill to ✓ in the FE
    // progress dropdown the moment Summary starts. Previous value
    // ("dashboard_metrics") was an invalid MonthlyAgentKey and got silently
    // dropped, leaving RE stuck at the clock icon throughout Summary.
    if (onProgress) await onProgress("summary_agent", "Running Summary v2 agent...", "referral_engine");
    const summaryStartTime = Date.now();
    log(`  [MONTHLY] Running Summary v2 agent (max 3 attempts)`);

    // Pull latest LLM-curated ranking recommendations for this org+location so
    // Summary can prioritize them alongside the other monthly signals.
    let rankingRecommendations: any[] | null = null;
    try {
      rankingRecommendations = await fetchLatestRankingRecommendations(
        organizationId,
        locationId ?? null,
      );
      if (rankingRecommendations) {
        log(`  [MONTHLY] ✓ Loaded ${rankingRecommendations.length} ranking recommendations`);
      } else {
        log(`  [MONTHLY] ℹ No completed ranking recommendations available`);
      }
    } catch (rankErr: any) {
      log(`  [MONTHLY] ⚠ Ranking recommendations fetch failed: ${rankErr.message}. Summary will run without them.`);
      rankingRecommendations = null;
    }

    const summaryPayload = buildSummaryPayload({
      domain,
      googleAccountId,
      startDate,
      endDate,
      monthData,
      pmsData,
      websiteAnalytics: websiteAnalyticsMonthly,
      referralEngineOutput,
      dashboardMetrics,
      rankingRecommendations,
    });

    let summaryOutput: SummaryV2Output | undefined;
    let summaryResultId: number | undefined;
    const MAX_SUMMARY_ATTEMPTS = 3;

    for (let summaryAttempt = 1; summaryAttempt <= MAX_SUMMARY_ATTEMPTS; summaryAttempt++) {
      if (summaryAttempt > 1) {
        log(`  [MONTHLY] 🔄 Summary v2 retry attempt ${summaryAttempt}/${MAX_SUMMARY_ATTEMPTS}`);
        log(`  [MONTHLY] Waiting 30 seconds before retry...`);
        if (onProgress) await onProgress("summary_agent", `Retrying Summary v2 (attempt ${summaryAttempt}/${MAX_SUMMARY_ATTEMPTS})...`);
        await delay(30000);
      }

      try {
        const summaryResult = await runMonthlyAgent({
          promptPath: "monthlyAgents/Summary",
          payload: summaryPayload,
          agentName: "Summary",
          meta: { ...agentMeta, agentType: "summary" },
          enableCache: true,
          outputSchema: SummaryV2OutputSchema,
        });

        summaryOutput = summaryResult.agentOutput as SummaryV2Output;
        summaryResultId = summaryResult.agentResultId;
        logAgentOutput("Summary", summaryOutput);

        // Plan 1 T10: post-Zod value validator. Each supporting_metrics[*].value
        // must match the dashboard_metrics dictionary at source_field. Throw on
        // mismatch to trigger outer retry.
        validateSummarySupportingMetrics(summaryOutput, dashboardMetrics ?? null);

        // Highlights validator: warn-only (mismatched entries dropped at render time).
        validateSummaryHighlights(summaryOutput);

        const summaryDuration = Date.now() - summaryStartTime;
        log(`  [MONTHLY] ✓ Summary v2 completed on attempt ${summaryAttempt} (${summaryDuration}ms, ${summaryOutput.top_actions.length} actions)`);
        log(`  [summary-v2] ${JSON.stringify({ event: "success", orgId: organizationId, locationId, n_actions: summaryOutput.top_actions.length, domains: summaryOutput.top_actions.map((a) => a.domain), attempt: summaryAttempt })}`);
        break;
      } catch (sumError: any) {
        const apiStatus = sumError?.status ?? sumError?.response?.status ?? null;
        const errorType = apiStatus === 429 ? "rate_limit" : apiStatus === 529 ? "overloaded" : apiStatus ? `api_${apiStatus}` : sumError.message?.includes("non-JSON") ? "parse_failure" : sumError.message?.includes("supporting_metrics") ? "metrics_validation" : "unknown";
        log(`  [MONTHLY] ⚠ Summary v2 attempt ${summaryAttempt}/${MAX_SUMMARY_ATTEMPTS} failed: type=${errorType} status=${apiStatus} message="${sumError.message}"`);
        if (sumError.stack) log(`  [MONTHLY] Stack: ${sumError.stack.split("\n").slice(0, 3).join(" → ")}`);
        if (onProgress) await onProgress("summary_agent", `Summary attempt ${summaryAttempt} failed (${errorType}). ${summaryAttempt < MAX_SUMMARY_ATTEMPTS ? "Retrying..." : "All attempts exhausted."}`);
        if (summaryAttempt === MAX_SUMMARY_ATTEMPTS) {
          return {
            success: false,
            error: `Summary v2 failed after ${MAX_SUMMARY_ATTEMPTS} attempts (last error: ${errorType}): ${sumError.message}`,
          };
        }
      }
    }

    const totalDuration = Date.now() - monthlyStartTime;
    log(`  [MONTHLY] ✓ All monthly agents complete for ${domain} (${totalDuration}ms / ${(totalDuration / 1000).toFixed(1)}s)`);

    return {
      success: true,
      summaryOutput,
      referralEngineOutput,
      opportunityOutput: undefined,
      croOptimizerOutput: undefined,
      dashboardMetrics,
      summaryPayload,
      referralEnginePayload: null, // Payload built inside retry loop
      opportunityPayload: undefined,
      croOptimizerPayload: undefined,
      rawData,
      agentResultIds: {
        summary: summaryResultId,
        opportunity: undefined,
        croOptimizer: undefined,
        referralEngine: referralEngineResultId,
      },
    };
  } catch (error: any) {
    logError("processMonthlyAgents", error);
    return { success: false, error: error?.message || String(error) };
  }
}
