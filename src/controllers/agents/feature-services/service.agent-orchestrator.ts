/**
 * Agent Orchestrator Service
 *
 * Core orchestration logic for multi-agent sequential execution.
 * Contains processDailyAgent, processMonthlyAgents, processGBPOptimizerAgent,
 * and processClient with 3-attempt retry logic.
 *
 * This is the heart of the agent processing system.
 */

import { db } from "../../../database/connection";
import {
  getValidOAuth2Client,
} from "../../../auth/oauth2Helper";
import {
  fetchAllServiceData,
  GooglePropertyIds,
} from "../../../utils/dataAggregation/dataAggregator";
import { aggregatePmsData } from "../../../utils/pms/pmsAggregator";
import { log, logError, delay, isValidAgentOutput, logAgentOutput } from "../feature-utils/agentLogger";
import { getDailyDates, getPreviousMonthRange, getCurrentMonthRange, shouldRunMonthlyAgents } from "../feature-utils/dateHelpers";
import {
  callAgentWebhook,
  COPY_COMPANION_WEBHOOK,
} from "./service.webhook-orchestrator";
import { v4 as uuidv4 } from "uuid";
import { loadPrompt } from "../../../agents/service.prompt-loader";
import { runAgent } from "../../../agents/service.llm-runner";
import {
  buildProoflinePayload,
  buildSummaryPayload,
  buildReferralEnginePayload,
  buildOpportunityPayload,
  buildCroOptimizerPayload,
  buildCopyCompanionPayload,
  flattenDailyGbpData,
} from "./service.agent-input-builder";
import {
  createTasksFromOpportunityOutput,
  createTasksFromCroOptimizerOutput,
  createTasksFromReferralEngineOutput,
} from "./service.task-creator";
import { resolveLocationId } from "../../../utils/locationResolver";
import { GooglePropertyModel } from "../../../models/GooglePropertyModel";
import { fetchRybbitDailyComparison, fetchRybbitMonthlyComparison } from "../../../utils/rybbit/service.rybbit-data";
import type {
  SummaryAgentOutput,
  OpportunityAgentOutput,
  CroOptimizerAgentOutput,
  ReferralEngineAgentOutput,
} from "../types/agent-output-schemas";

// =====================================================================
// DAILY AGENT PROCESSING
// =====================================================================

/**
 * Process daily agent (Proofline) for a single client
 * Returns output in memory without saving to DB
 */
export async function processDailyAgent(
  account: any,
  oauth2Client: any,
  dates: ReturnType<typeof getDailyDates>,
  locationId?: number | null,
): Promise<{
  success: boolean;
  output?: any;
  payload?: any;
  rawData?: any;
  error?: string;
}> {
  const { id: googleAccountId, domain_name: domain, organization_id: organizationId } = account;

  log(`  [DAILY] Processing Proofline agent for ${domain} (location: ${locationId || "primary"})`);

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
        log(`  [DAILY] Scoped GBP to location ${locationId} (${gbpProps.length} properties)`);
      }
    }
    // Fallback: if no location-scoped properties, parse from JSON blob
    if (!propertyIds.gbp || propertyIds.gbp.length === 0) {
      propertyIds = typeof account.google_property_ids === "string"
        ? JSON.parse(account.google_property_ids)
        : (account.google_property_ids || {});
      log(`  [DAILY] Using full JSON blob for GBP (${propertyIds.gbp?.length || 0} properties)`);
    }

    // Fetch data for day before yesterday (single day)
    log(
      `  [DAILY] Fetching data for ${dates.dayBeforeYesterday} (day before yesterday)`,
    );
    const dayBeforeYesterdayData = await fetchAllServiceData(
      oauth2Client,
      googleAccountId,
      domain,
      propertyIds,
      dates.dayBeforeYesterday,
      dates.dayBeforeYesterday,
    );

    // Fetch data for yesterday (single day)
    log(`  [DAILY] Fetching data for ${dates.yesterday} (yesterday)`);
    const yesterdayData = await fetchAllServiceData(
      oauth2Client,
      googleAccountId,
      domain,
      propertyIds,
      dates.yesterday,
      dates.yesterday,
    );

    // Fetch Rybbit website analytics (optional, non-blocking)
    log(`  [DAILY] Fetching Rybbit website analytics for org ${organizationId}`);
    const websiteAnalytics = await fetchRybbitDailyComparison(
      organizationId,
      dates.yesterday,
      dates.dayBeforeYesterday,
    );
    if (websiteAnalytics) {
      log(`  [DAILY] ✓ Rybbit data available`);
    } else {
      log(`  [DAILY] ⚠ No Rybbit data — proceeding with GBP only`);
    }

    // Build payload and call Proofline agent
    const locationDisplayName = propertyIds.gbp?.[0]?.displayName || null;
    const payload = buildProoflinePayload({
      domain,
      googleAccountId,
      dates,
      dayBeforeYesterdayData,
      yesterdayData,
      locationName: locationDisplayName,
      websiteAnalytics,
    });

    log(`  [DAILY] Running Proofline agent via Claude directly`);
    const systemPrompt = loadPrompt("dailyAgents/Proofline");
    const userMessage = JSON.stringify(payload, null, 2);

    // Proofline runs once per organization per day. Within a single batch
    // run (one cron tick processing many orgs), the system prompt is byte
    // identical across calls; opt in to ephemeral prompt caching so each
    // org after the first reads the cached system block at 10 percent of
    // the normal input-token cost.
    const result = await runAgent({
      systemPrompt,
      userMessage,
      maxTokens: 4096,
      cacheSystem: true,
    });

    log(
      `  [DAILY] ✓ Proofline responded (${result.inputTokens} in / ${result.outputTokens} out)`
    );

    const agentOutput = result.parsed;

    // Log and validate output
    logAgentOutput("Proofline", agentOutput);

    // Handle skip case
    if (agentOutput?.skipped) {
      log(`  [DAILY] Proofline skipped: ${agentOutput.reason}`);
      return {
        success: false,
        error: `Proofline skipped: ${agentOutput.reason}`,
      };
    }

    const isValid = isValidAgentOutput(agentOutput, "Proofline");

    if (!isValid) {
      return {
        success: false,
        error: "Agent returned empty or invalid output",
      };
    }

    // Prepare flat raw data for google_data_store
    const rawData = {
      organization_id: organizationId,
      location_id: locationId || null,
      domain,
      date_start: dates.dayBeforeYesterday,
      date_end: dates.yesterday,
      run_type: "daily",
      gbp_data: flattenDailyGbpData(yesterdayData, dayBeforeYesterdayData),
      created_at: new Date(),
      updated_at: new Date(),
    };

    log(`  [DAILY] \u2713 Proofline completed successfully`);
    return {
      success: true,
      output: agentOutput,
      payload,
      rawData,
    };
  } catch (error: any) {
    logError("processDailyAgent", error);
    return { success: false, error: error?.message || String(error) };
  }
}

// =====================================================================
// MONTHLY AGENTS: DIRECT LLM CALL + PERSIST
// =====================================================================

/**
 * Run a monthly agent via Claude directly (no n8n), then persist the
 * result to agent_results. Returns the same shape that fireWebhookAndPoll
 * used to return so the rest of the orchestrator stays unchanged.
 */
async function runMonthlyAgent(opts: {
  promptPath: string;
  payload: any;
  agentName: string;
  meta: {
    organizationId: number;
    locationId: number | null;
    agentType: string;
    dateStart: string;
    dateEnd: string;
  };
}): Promise<{ agentOutput: any; agentResultId: number }> {
  const systemPrompt = loadPrompt(opts.promptPath);
  const userMessage = JSON.stringify(opts.payload, null, 2);

  log(`  → Running ${opts.agentName} via Claude directly`);

  // Monthly agents (Summary, CRO, Opportunity, ReferralEngineAnalysis)
  // run once per organization per cycle. Within a single batch run, the
  // same agent's system prompt is byte identical across orgs; opt in to
  // ephemeral prompt caching so each org after the first reads the
  // cached system block at 10 percent of the normal input-token cost.
  const result = await runAgent({
    systemPrompt,
    userMessage,
    maxTokens: 16384,
    cacheSystem: true,
  });

  log(
    `  ✓ ${opts.agentName} responded (${result.inputTokens} in / ${result.outputTokens} out)`
  );

  if (!result.parsed) {
    throw new Error(`${opts.agentName} returned non-JSON output`);
  }

  // Persist to agent_results (replaces what n8n used to write)
  const runId = uuidv4();
  const [record] = await db("agent_results")
    .insert({
      run_id: runId,
      organization_id: opts.meta.organizationId,
      location_id: opts.meta.locationId,
      agent_type: opts.meta.agentType,
      date_start: opts.meta.dateStart,
      date_end: opts.meta.dateEnd,
      agent_input: userMessage.length > 50000 ? null : userMessage,
      agent_output: JSON.stringify(result.parsed),
      status: "success",
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning("id");

  const agentResultId = record.id ?? record;

  log(`  ✓ ${opts.agentName} result saved (ID: ${agentResultId}, run_id: ${runId})`);

  return {
    agentOutput: result.parsed,
    agentResultId,
  };
}

// =====================================================================
// MONTHLY AGENTS PROCESSING
// =====================================================================

/**
 * Process monthly agents (Summary + Referral Engine + Opportunity + CRO Optimizer) for a single client
 * Returns outputs in memory without saving to DB
 */
export async function processMonthlyAgents(
  account: any,
  oauth2Client: any,
  monthRange: ReturnType<typeof getPreviousMonthRange>,
  passedLocationId?: number | null,
  onProgress?: (subStep: string, message: string, agentCompleted?: string) => Promise<void>,
): Promise<{
  success: boolean;
  summaryOutput?: SummaryAgentOutput;
  referralEngineOutput?: ReferralEngineAgentOutput;
  opportunityOutput?: OpportunityAgentOutput;
  croOptimizerOutput?: CroOptimizerAgentOutput;
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

  log(
    `  [MONTHLY] Processing Summary + Opportunity + CRO Optimizer + Referral Engine for ${domain} (${startDate} to ${endDate})`,
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
    try {
      const aggregated = await aggregatePmsData(organizationId, locationId ?? undefined);

      if (aggregated.months.length > 0) {
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
        };
        log(
          `  [MONTHLY] \u2713 Aggregated PMS data found (${aggregated.months.length} months, ${aggregated.sources.length} sources, ${aggregated.patientRecords.length} patient records)`,
        );
      } else {
        log(`  [MONTHLY] \u26a0 No approved PMS data found`);
      }
    } catch (pmsError: any) {
      log(
        `  [MONTHLY] \u26a0 Error fetching aggregated PMS data: ${pmsError.message}`,
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

    // === STEP 1: Summary Agent (direct LLM call) ===
    if (onProgress) await onProgress("summary_agent", "Running Summary Agent...");
    log(`  [MONTHLY] Running Summary agent`);
    const summaryPayload = buildSummaryPayload({
      domain,
      googleAccountId,
      startDate,
      endDate,
      monthData,
      pmsData,
      websiteAnalytics: websiteAnalyticsMonthly,
    });

    const summaryResult = await runMonthlyAgent({
      promptPath: "monthlyAgents/Summary",
      payload: summaryPayload,
      agentName: "Summary",
      meta: { ...agentMeta, agentType: "summary" },
    });

    const summaryOutput: SummaryAgentOutput = summaryResult.agentOutput;
    logAgentOutput("Summary", summaryOutput);

    if (!isValidAgentOutput(summaryOutput, "Summary")) {
      return { success: false, error: "Summary agent returned empty or invalid output" };
    }
    log(`  [MONTHLY] \u2713 Summary completed successfully`);

    // === STEP 2: Opportunity Agent (depends on Summary output) ===
    if (onProgress) await onProgress("opportunity_agent", "Running Opportunity Agent...", "summary_agent");
    log(`  [MONTHLY] Running Opportunity agent`);
    const opportunityPayload = buildOpportunityPayload({
      domain,
      googleAccountId,
      startDate,
      endDate,
      summaryOutput,
    });

    const opportunityResult = await runMonthlyAgent({
      promptPath: "monthlyAgents/Opportunity",
      payload: opportunityPayload,
      agentName: "Opportunity",
      meta: { ...agentMeta, agentType: "opportunity" },
    });

    const opportunityOutput: OpportunityAgentOutput = opportunityResult.agentOutput;
    logAgentOutput("Opportunity", opportunityOutput);

    if (!isValidAgentOutput(opportunityOutput, "Opportunity")) {
      return { success: false, error: "Opportunity agent returned empty or invalid output" };
    }
    log(`  [MONTHLY] \u2713 Opportunity completed successfully`);

    // === STEP 3: CRO Optimizer Agent (depends on Summary output, with retry) ===
    if (onProgress) await onProgress("cro_optimizer", "Running CRO Optimizer Agent...", "opportunity_agent");
    log(`  [MONTHLY] Running CRO Optimizer agent (max 3 attempts)`);

    let croOptimizerOutput: CroOptimizerAgentOutput | undefined;
    let croOptimizerResultId: number | undefined;
    const MAX_CRO_ATTEMPTS = 3;

    for (let croAttempt = 1; croAttempt <= MAX_CRO_ATTEMPTS; croAttempt++) {
      if (croAttempt > 1) {
        log(`  [MONTHLY] \ud83d\udd04 CRO Optimizer retry attempt ${croAttempt}/${MAX_CRO_ATTEMPTS}`);
        log(`  [MONTHLY] Waiting 30 seconds before retry...`);
        if (onProgress) await onProgress("cro_optimizer", `Retrying CRO Optimizer (attempt ${croAttempt}/${MAX_CRO_ATTEMPTS})...`);
        await delay(30000);
      }

      try {
        const croPayload = buildCroOptimizerPayload({
          domain,
          googleAccountId,
          startDate,
          endDate,
          summaryOutput,
        });

        const croResult = await runMonthlyAgent({
          promptPath: "monthlyAgents/CRO",
          payload: croPayload,
          agentName: "CRO Optimizer",
          meta: { ...agentMeta, agentType: "cro_optimizer" },
        });

        croOptimizerOutput = croResult.agentOutput;
        croOptimizerResultId = croResult.agentResultId;
        logAgentOutput("CRO Optimizer", croOptimizerOutput);

        if (!isValidAgentOutput(croOptimizerOutput, "CRO Optimizer")) {
          throw new Error("CRO Optimizer agent returned empty or invalid output");
        }

        log(`  [MONTHLY] \u2713 CRO Optimizer completed successfully on attempt ${croAttempt}`);
        break;
      } catch (croError: any) {
        log(`  [MONTHLY] \u26a0 CRO Optimizer attempt ${croAttempt} failed: ${croError.message}`);
        if (croAttempt === MAX_CRO_ATTEMPTS) {
          return {
            success: false,
            error: `CRO Optimizer failed after ${MAX_CRO_ATTEMPTS} attempts: ${croError.message}`,
          };
        }
      }
    }

    // === STEP 4: Referral Engine (uses PMS data, runs last, with retry) ===
    if (onProgress) await onProgress("referral_engine", "Running Referral Engine Agent...", "cro_optimizer");
    log(`  [MONTHLY] Running Referral Engine agent (max 3 attempts)`);

    let referralEngineOutput: ReferralEngineAgentOutput | undefined;
    let referralEngineResultId: number | undefined;
    const MAX_REFERRAL_ATTEMPTS = 3;

    for (let refAttempt = 1; refAttempt <= MAX_REFERRAL_ATTEMPTS; refAttempt++) {
      if (refAttempt > 1) {
        log(`  [MONTHLY] \ud83d\udd04 Referral Engine retry attempt ${refAttempt}/${MAX_REFERRAL_ATTEMPTS}`);
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
          pmsData,
        });

        const referralResult = await runMonthlyAgent({
          promptPath: "monthlyAgents/ReferralEngineAnalysis",
          payload: referralPayload,
          agentName: "Referral Engine",
          meta: { ...agentMeta, agentType: "referral_engine" },
        });

        referralEngineOutput = referralResult.agentOutput;
        referralEngineResultId = referralResult.agentResultId;
        logAgentOutput("Referral Engine", referralEngineOutput);

        if (!isValidAgentOutput(referralEngineOutput, "Referral Engine")) {
          throw new Error("Referral Engine agent returned empty or invalid output");
        }

        log(`  [MONTHLY] \u2713 Referral Engine completed successfully on attempt ${refAttempt}`);
        break;
      } catch (refError: any) {
        log(`  [MONTHLY] \u26a0 Referral Engine attempt ${refAttempt} failed: ${refError.message}`);
        if (refAttempt === MAX_REFERRAL_ATTEMPTS) {
          return {
            success: false,
            error: `Referral Engine failed after ${MAX_REFERRAL_ATTEMPTS} attempts: ${refError.message}`,
          };
        }
      }
    }

    // === STEP 5: Create tasks from action items ===
    await createTasksFromOpportunityOutput(opportunityOutput, googleAccountId, organizationId, locationId);
    await createTasksFromCroOptimizerOutput(croOptimizerOutput!, googleAccountId, organizationId, locationId);
    await createTasksFromReferralEngineOutput(referralEngineOutput!, googleAccountId, organizationId, locationId);

    return {
      success: true,
      summaryOutput,
      referralEngineOutput,
      opportunityOutput,
      croOptimizerOutput,
      summaryPayload: summaryPayload,
      referralEnginePayload: null, // Payload built inside retry loop
      opportunityPayload,
      croOptimizerPayload: null, // Payload built inside retry loop
      rawData,
      agentResultIds: {
        summary: summaryResult.agentResultId,
        opportunity: opportunityResult.agentResultId,
        croOptimizer: croOptimizerResultId,
        referralEngine: referralEngineResultId,
      },
    };
  } catch (error: any) {
    logError("processMonthlyAgents", error);
    return { success: false, error: error?.message || String(error) };
  }
}

// =====================================================================
// GBP OPTIMIZER PROCESSING
// =====================================================================

/**
 * Process GBP Optimizer agent for a single client
 */
export async function processGBPOptimizerAgent(
  account: any,
  oauth2Client: any,
  monthRange: { startDate: string; endDate: string },
): Promise<{
  success: boolean;
  output?: any;
  payload?: any;
  rawData?: any;
  error?: string;
}> {
  const { id: googleAccountId, domain_name: domain } = account;

  log(`\n  [GBP-OPTIMIZER] Starting processing for ${domain}`);
  log(
    `  [GBP-OPTIMIZER] Date range: ${monthRange.startDate} to ${monthRange.endDate}`,
  );

  try {
    // Import getGBPTextSources
    const { getGBPTextSources } = require("../../../routes/gbp");

    log(`  [GBP-OPTIMIZER] Fetching GBP text sources...`);
    const gbpData = await getGBPTextSources(
      oauth2Client,
      googleAccountId,
      monthRange.startDate,
      monthRange.endDate,
    );

    if (!gbpData.locations || gbpData.locations.length === 0) {
      log(`  [GBP-OPTIMIZER] \u26a0 No GBP locations found`);
      return {
        success: false,
        error: "No GBP locations found for this account",
      };
    }

    log(`  [GBP-OPTIMIZER] \u2713 Found ${gbpData.locations.length} location(s)`);

    // Log location details
    gbpData.locations.forEach((loc: any, idx: number) => {
      log(
        `    [${idx + 1}] ${loc.meta?.businessName || "Unknown"}: ${
          loc.gbp_posts.length
        } posts`,
      );
    });

    // Transform to Copy Companion format
    const payload = buildCopyCompanionPayload(gbpData, domain, googleAccountId);

    log(`  [GBP-OPTIMIZER] Calling Copy Companion agent...`);
    log(`  [GBP-OPTIMIZER] Webhook: ${COPY_COMPANION_WEBHOOK}`);
    log(
      `  [GBP-OPTIMIZER] Sending ${payload.additional_data.text_sources.length} text sources`,
    );

    const agentOutput = await callAgentWebhook(
      COPY_COMPANION_WEBHOOK,
      payload,
      "Copy Companion",
    );

    // Log and validate output
    logAgentOutput("Copy Companion", agentOutput);
    const isValid = isValidAgentOutput(agentOutput, "Copy Companion");

    if (!isValid) {
      log(`  [GBP-OPTIMIZER] \u2717 Agent returned invalid output`);
      return {
        success: false,
        error: "Agent returned empty or invalid output",
      };
    }

    // Count recommendations
    const recommendations = agentOutput[0] || {};
    const recCount = Object.keys(recommendations).length;
    log(`  [GBP-OPTIMIZER] \u2713 Received ${recCount} recommendation(s)`);

    log(`  [GBP-OPTIMIZER] \u2713 Copy Companion completed successfully`);

    return {
      success: true,
      output: agentOutput,
      payload,
      rawData: gbpData,
    };
  } catch (error: any) {
    logError("processGBPOptimizerAgent", error);
    log(`  [GBP-OPTIMIZER] \u2717 Failed: ${error?.message || String(error)}`);
    return { success: false, error: error?.message || String(error) };
  }
}

// =====================================================================
// CLIENT PROCESSING WITH RETRY
// =====================================================================

/**
 * Process a single client account with retry mechanism
 * Retries up to 3 times if agent outputs are invalid
 * Only saves to database after ALL validations pass
 */
export async function processClient(
  account: any,
  referenceDate?: string,
): Promise<{
  success: boolean;
  daily?: any;
  monthly?: any;
  error?: string;
  attempts?: number;
}> {
  const { id: googleAccountId, domain_name: domain } = account;
  const MAX_ATTEMPTS = 3;

  log(`\n[${"=".repeat(60)}]`);
  log(`[CLIENT] Processing: ${domain} (Account ID: ${googleAccountId})`);
  log(`[${"=".repeat(60)}]`);

  // Try up to MAX_ATTEMPTS times
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      log(
        `\n[CLIENT] \ud83d\udd04 RETRY ATTEMPT ${attempt}/${MAX_ATTEMPTS} for ${domain}`,
      );
      log(`[CLIENT] Waiting 30 seconds before retry...`);
      await delay(30000); // Wait 30 seconds between retries
    }

    try {
      // Get valid OAuth2 client (handles refresh automatically if needed)
      log(`[CLIENT] Getting valid OAuth2 client`);
      const oauth2Client = await getValidOAuth2Client(googleAccountId);

      // Get date ranges
      const dailyDates = getDailyDates(referenceDate);
      const monthRange = getCurrentMonthRange();

      // Resolve location_id for this organization
      const locationId = await resolveLocationId(account.organization_id);

      // === STEP 1: Always run daily agent (collect in memory) ===
      log(`[CLIENT] Running daily agent (attempt ${attempt}/${MAX_ATTEMPTS})`);
      const dailyResult = await processDailyAgent(
        account,
        oauth2Client,
        dailyDates,
      );

      if (!dailyResult.success) {
        log(`[CLIENT] \u26a0 Daily agent failed: ${dailyResult.error}`);
        if (attempt < MAX_ATTEMPTS) {
          continue; // Retry
        }
        throw new Error(
          `Daily agent failed after ${MAX_ATTEMPTS} attempts: ${dailyResult.error}`,
        );
      }

      // === STEP 2: Conditionally run monthly agents (collect in memory) ===
      let monthlyResult: any = { skipped: true, reason: "conditions_not_met" };

      if (shouldRunMonthlyAgents(referenceDate)) {
        // Check for duplicate before running
        const existingSummary = await db("agent_results")
          .where({
            organization_id: account.organization_id,
            agent_type: "summary",
            date_start: monthRange.startDate,
            date_end: monthRange.endDate,
          })
          .whereIn("status", ["success", "pending"])
          .first();

        if (existingSummary) {
          log(`[CLIENT] Monthly agents already completed - skipping`);
          monthlyResult = { skipped: true, reason: "already_exists" };
        } else {
          log(
            `[CLIENT] Running monthly agents (attempt ${attempt}/${MAX_ATTEMPTS})`,
          );
          monthlyResult = await processMonthlyAgents(
            account,
            oauth2Client,
            monthRange,
            locationId,
          );

          if (!monthlyResult.success && !monthlyResult.skipped) {
            log(`[CLIENT] \u26a0 Monthly agents failed: ${monthlyResult.error}`);
            if (attempt < MAX_ATTEMPTS) {
              continue; // Retry
            }
            throw new Error(
              `Monthly agents failed after ${MAX_ATTEMPTS} attempts: ${monthlyResult.error}`,
            );
          }
        }
      } else {
        log(`[CLIENT] Monthly conditions not met - skipping monthly agents`);
      }

      // === STEP 3: ALL VALIDATIONS PASSED - Save to database ===
      log(`[CLIENT] \u2713 All agent outputs validated successfully`);
      log(`[CLIENT] Persisting results to database...`);

      // Check for duplicate daily result before inserting
      const existingDaily = await db("agent_results")
        .where({
          organization_id: account.organization_id,
          agent_type: "proofline",
          date_start: dailyDates.dayBeforeYesterday,
          date_end: dailyDates.yesterday,
        })
        .whereIn("status", ["success", "pending"])
        .first();

      if (!existingDaily) {
        // Save daily raw data
        await db("google_data_store").insert(dailyResult.rawData);

        // Save daily agent result
        const [dailyResultId] = await db("agent_results")
          .insert({
            organization_id: account.organization_id,
            location_id: locationId,
            agent_type: "proofline",
            date_start: dailyDates.dayBeforeYesterday,
            date_end: dailyDates.yesterday,
            agent_input: JSON.stringify(dailyResult.payload),
            agent_output: JSON.stringify(dailyResult.output),
            status: "success",
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning("id");

        log(`[CLIENT] \u2713 Daily result saved (ID: ${dailyResultId})`);
      } else {
        log(`[CLIENT] \u2139 Daily result already exists (ID: ${existingDaily.id})`);
      }

      // Monthly agent results already saved by n8n via fire-and-poll
      // Just save raw GBP data
      if (!monthlyResult.skipped && monthlyResult.success) {
        await db("google_data_store").insert(monthlyResult.rawData);
        log(`[CLIENT] \u2713 Monthly raw GBP data saved`);
        log(`[CLIENT] \u2713 Agent results written by n8n (IDs: ${JSON.stringify(monthlyResult.agentResultIds)})`);
      }

      log(
        `[CLIENT] \u2713 ${domain} processing completed successfully on attempt ${attempt}`,
      );

      return {
        success: true,
        daily: dailyResult,
        monthly: monthlyResult,
        attempts: attempt,
      };
    } catch (error: any) {
      logError(`processClient - ${domain} (attempt ${attempt})`, error);

      // If this was the last attempt, save error to database
      if (attempt === MAX_ATTEMPTS) {
        try {
          const errorLocationId = await resolveLocationId(
            account.organization_id
          );
          await db("agent_results").insert({
            organization_id: account.organization_id,
            location_id: errorLocationId,
            agent_type: "proofline",
            date_start: getDailyDates(referenceDate).dayBeforeYesterday,
            date_end: getDailyDates(referenceDate).yesterday,
            agent_input: null,
            agent_output: null,
            status: "error",
            error_message: `Failed after ${MAX_ATTEMPTS} attempts: ${
              error?.message || String(error)
            }`,
            created_at: new Date(),
            updated_at: new Date(),
          });
        } catch (dbError) {
          logError("Save error result to DB", dbError);
        }

        return {
          success: false,
          error: `Failed after ${MAX_ATTEMPTS} attempts: ${
            error?.message || String(error)
          }`,
          attempts: MAX_ATTEMPTS,
        };
      }

      // Not the last attempt, will retry
      log(`[CLIENT] \u26a0 Attempt ${attempt} failed, will retry...`);
    }
  }

  // Should never reach here, but just in case
  return {
    success: false,
    error: `Failed after ${MAX_ATTEMPTS} attempts`,
    attempts: MAX_ATTEMPTS,
  };
}
