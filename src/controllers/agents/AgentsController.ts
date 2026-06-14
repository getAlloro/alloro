/**
 * AgentsController
 *
 * HTTP handler layer for agent processing endpoints.
 * Named function exports (not class-based) per project convention.
 *
 * Thin controller that handles:
 * - Request parsing and validation
 * - Delegating business logic to feature services
 * - Response formatting
 * - Error handling
 *
 * 10 endpoints:
 * - POST /proofline-run          - Daily proofline agent for all clients
 * - POST /monthly-agents-run     - Monthly agents for a specific account
 * - POST /monthly-agents-run-test - Test endpoint (no DB writes)
 * - POST /gbp-optimizer-run      - Monthly GBP Copy Optimizer for all clients
 * - POST /ranking-run            - Automated practice ranking agent
 * - POST /guardian-governance-agents-run - Monthly Guardian & Governance agents
 * - POST /process-all            - DEPRECATED: use /proofline-run
 * - GET  /latest/:googleAccountId - Latest agent outputs for dashboard
 * - GET  /getLatestReferralEngineOutput/:googleAccountId - Latest Referral Engine output
 * - GET  /health                 - Health check
 */

import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getValidOAuth2Client } from "../../auth/oauth2Helper";
import {
  fetchAllServiceData,
  GooglePropertyIds,
  fetchGBPDataForRange,
} from "../../utils/dataAggregation/dataAggregator";
import { aggregatePmsData } from "../../utils/pms/pmsAggregator";
import {
  createNotification,
  notifyAdminsMonthlyAgentComplete,
} from "../../utils/core/notificationHelper";
import {
  processLocationRanking,
  MAX_RETRIES,
  RETRY_DELAY_MS,
} from "../practice-ranking/feature-services/service.ranking-pipeline";
import {
  updateAutomationStatus,
  completeAutomation,
  failAutomation,
  AutomationSummary,
  MonthlyAgentKey,
} from "../../utils/pms/pmsAutomationStatus";

import { log, logError, delay, isValidAgentOutput, logAgentOutput } from "./feature-utils/agentLogger";
import { getDailyDates, getPreviousMonthRange, formatDate } from "./feature-utils/dateHelpers";
import {
  processDailyAgent,
  processMonthlyAgents,
  processGBPOptimizerAgent,
  processClient,
} from "./feature-services/service.agent-orchestrator";
import {
  callAgentWebhook,
  PROOFLINE_WEBHOOK,
  SUMMARY_WEBHOOK,
  REFERRAL_ENGINE_WEBHOOK,
  OPPORTUNITY_WEBHOOK,
  CRO_OPTIMIZER_WEBHOOK,
  COPY_COMPANION_WEBHOOK,
  GUARDIAN_AGENT_WEBHOOK,
  GOVERNANCE_AGENT_WEBHOOK,
  identifyLocationMeta,
} from "./feature-services/service.webhook-orchestrator";
import {
  buildSummaryPayload,
  buildReferralEnginePayload,
  buildOpportunityPayload,
  buildCroOptimizerPayload,
} from "./feature-services/service.agent-input-builder";
import { executeProoflineAgent } from "./feature-services/service.proofline-executor";
import { setupRankingBatches, processRankingWork } from "./feature-services/service.ranking-executor";
import {
  createTasksFromCopyRecommendations,
  simulateTaskCreation,
} from "./feature-services/service.task-creator";
import { runGuardianGovernanceAgents } from "./feature-services/service.governance-validator";
import { resolveLocationId } from "../../utils/locationResolver";
import { AgentResultModel } from "../../models/AgentResultModel";
import { GooglePropertyModel } from "../../models/GooglePropertyModel";
import { LocationModel } from "../../models/LocationModel";
import { GoogleConnectionModel } from "../../models/GoogleConnectionModel";
import { GoogleDataStoreModel } from "../../models/GoogleDataStoreModel";
import { TaskModel } from "../../models/TaskModel";
import { PmsJobModel } from "../../models/PmsJobModel";

// =====================================================================
// POST /proofline-run
// =====================================================================

export async function runProoflineAgent(
  req: Request,
  res: Response,
): Promise<any> {
  const { referenceDate } = req.body || {};

  try {
    const result = await executeProoflineAgent(referenceDate);
    return res.json({
      success: true,
      message: `Processed ${result.summary.totalAccounts} account(s), ${result.summary.totalLocations} location(s)`,
      processed: result.summary.totalAccounts,
      locationsProcessed: result.summary.totalLocations,
      successful: result.summary.successful,
      duration: `${result.summary.durationMs}ms`,
      results: result.results,
    });
  } catch (error: any) {
    logError("proofline-run", error);
    return res.status(500).json({
      success: false,
      error: "PROOFLINE_RUN_ERROR",
      message: error?.message || "Failed to run proofline agent",
    });
  }
}

// =====================================================================
// POST /monthly-agents-run
// =====================================================================

export async function runMonthlyAgents(
  req: Request,
  res: Response,
): Promise<any> {
  const startTime = Date.now();
  const { googleAccountId, force = false, pmsJobId, locationId: requestLocationId } = req.body;

  log("\n" + "=".repeat(70));
  log("POST /api/agents/monthly-agents-run - STARTING");
  log("=".repeat(70));
  log(`Account ID: ${googleAccountId}`);
  log(`Force run: ${force}`);
  log(`PMS Job ID: ${pmsJobId || "N/A"}`);
  log(`Location ID: ${requestLocationId || "N/A (will resolve from org)"}`);
  log(`Timestamp: ${new Date().toISOString()}`);

  // Helper to update PMS automation status if pmsJobId is provided
  const updatePmsStatus = async (
    subStep: MonthlyAgentKey,
    customMessage?: string,
    agentCompleted?: MonthlyAgentKey,
  ) => {
    if (pmsJobId) {
      await updateAutomationStatus(pmsJobId, {
        step: "monthly_agents",
        stepStatus: "processing",
        subStep,
        customMessage,
        agentCompleted,
      });
    }
  };

  try {
    // Validate input
    if (!googleAccountId) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMETERS",
        message: "googleAccountId is required",
      });
    }

    // Fetch account (join with org for name/domain)
    log(`\n[SETUP] Fetching account ${googleAccountId}...`);
    const account = await GoogleConnectionModel.findByIdWithOrganizationDetails(
      googleAccountId
    );

    if (!account) {
      return res.status(404).json({
        success: false,
        error: "ACCOUNT_NOT_FOUND",
        message: `Account ${googleAccountId} not found`,
      });
    }

    log(`[SETUP] Account found: ${account.domain_name}`);

    if (account.org_archived_at) {
      const message = "Organization is archived; monthly agents will not run.";
      if (pmsJobId) {
        await failAutomation(Number(pmsJobId), "monthly_agents", message);
      }
      return res.status(423).json({
        success: false,
        error: "ORGANIZATION_ARCHIVED",
        message,
      });
    }

    // Use passed locationId if available, otherwise resolve from org
    const locationId = requestLocationId
      ? Number(requestLocationId)
      : await resolveLocationId(account.organization_id);
    log(`[SETUP] Using locationId: ${locationId}${requestLocationId ? ' (from request)' : ' (resolved from org)'}`);

    // Get month range
    const monthRange = getPreviousMonthRange();
    log(
      `[SETUP] Month range: ${monthRange.startDate} to ${monthRange.endDate}`,
    );

    // Removed duplicate check - always run monthly agents when called
    log(`[SETUP] Proceeding with monthly agents run`);

    // Get valid OAuth2 client
    log(`[CLIENT] Getting valid OAuth2 client`);
    const oauth2Client = await getValidOAuth2Client(googleAccountId);

    // Update status: data fetching
    await updatePmsStatus(
      "data_fetch",
      "Fetching GBP, PMS, and Clarity data...",
    );

    // Run monthly agents
    log(`[CLIENT] Running monthly agents (Summary + Opportunity)`);
    const monthlyResult = await processMonthlyAgents(
      account,
      oauth2Client,
      monthRange,
      locationId,
      async (subStep, message, agentCompleted) => {
        await updatePmsStatus(
          subStep as any,
          message,
          agentCompleted as any,
        );
      },
    );

    if (!monthlyResult.success) {
      // Update PMS status on failure
      if (pmsJobId) {
        await failAutomation(
          pmsJobId,
          "monthly_agents",
          monthlyResult.error || "Monthly agents failed",
        );
      }
      throw new Error(monthlyResult.error || "Monthly agents failed");
    }

    // Agent results saved by orchestrator (direct Claude calls)
    const summaryId = monthlyResult.agentResultIds?.summary || 0;
    const opportunityId = monthlyResult.agentResultIds?.opportunity || 0;
    const croOptimizerId = monthlyResult.agentResultIds?.croOptimizer || 0;
    const referralEngineId = monthlyResult.agentResultIds?.referralEngine || 0;
    log(`[CLIENT] Agent results saved (Summary: ${summaryId}, Opportunity: ${opportunityId}, CRO: ${croOptimizerId}, Referral: ${referralEngineId})`);

    // Save raw GBP data
    await GoogleDataStoreModel.insertRaw(monthlyResult.rawData);
    log(`[CLIENT] \u2713 Raw GBP data saved`);

    // Mark all agents complete and move to task creation
    await updatePmsStatus(
      "referral_engine",
      "All agents completed, creating tasks...",
      "referral_engine",
    );

    // Update status: Task creation
    if (pmsJobId) {
      await updateAutomationStatus(pmsJobId, {
        step: "task_creation",
        stepStatus: "processing",
        customMessage: "Creating tasks from agent recommendations...",
      });
    }

    // Create notification for completed monthly agents (also sends user email)
    try {
      await createNotification(
        account.organization_id,
        "Monthly Insights Ready",
        "Your monthly summary and opportunities are now available for review",
        "agent",
        {
          summaryId,
          referralEngineId,
          opportunityId,
          croOptimizerId,
          dateRange: `${monthRange.startDate} to ${monthRange.endDate}`,
        },
        { locationId },
      );
      log(`[CLIENT] \u2713 Notification created for completed monthly agents`);
    } catch (notificationError: any) {
      log(
        `[CLIENT] \u26a0 Failed to create notification: ${notificationError.message}`,
      );
      // Don't fail the entire operation if notification creation fails
    }

    const duration = Date.now() - startTime;

    // Count tasks created from database for this domain created during this run
    const tasksCreated = {
      user: 0,
      alloro: 0,
      total: 0,
    };

    try {
      const recentTasks = await TaskModel.findCategoriesByOrgSince(
        account.organization_id,
        new Date(startTime)
      );

      tasksCreated.total = recentTasks.length;
      tasksCreated.user = recentTasks.filter(
        (t: any) => t.category === "USER",
      ).length;
      tasksCreated.alloro = recentTasks.filter(
        (t: any) => t.category === "ALLORO",
      ).length;
    } catch (e) {
      log(`[CLIENT] Could not count tasks: ${e}`);
    }

    // Send admin email notification about monthly agent completion (after tasksCreated is populated)
    try {
      await notifyAdminsMonthlyAgentComplete(
        account.practice_name || account.domain_name || "Unknown",
        { summaryId, referralEngineId, opportunityId, croOptimizerId },
        tasksCreated,
      );
      log(`[CLIENT] \u2713 Admin email sent for monthly agents completion`);
    } catch (adminEmailError: any) {
      log(
        `[CLIENT] \u26a0 Failed to send admin email: ${adminEmailError.message}`,
      );
      // Don't fail the entire operation if admin email fails
    }

    // Complete the PMS automation status
    if (pmsJobId) {
      const automationSummary: AutomationSummary = {
        tasksCreated,
        agentResults: {
          summary: { success: true, resultId: summaryId },
          referral_engine: { success: true, resultId: referralEngineId },
          opportunity: { success: true, resultId: opportunityId },
          cro_optimizer: { success: true, resultId: croOptimizerId },
        },
        duration: `${(duration / 1000).toFixed(1)}s`,
      };

      await completeAutomation(pmsJobId, automationSummary);
      log(`[CLIENT] \u2713 PMS automation status marked as complete`);
    }

    log("\n" + "=".repeat(70));
    log(`[COMPLETE] \u2713 Monthly agents completed successfully`);
    log(`  - Summary ID: ${summaryId}`);
    log(`  - Referral Engine ID: ${referralEngineId}`);
    log(`  - Opportunity ID: ${opportunityId}`);
    log(`  - CRO Optimizer ID: ${croOptimizerId}`);
    log(
      `  - Tasks created: ${tasksCreated.total} (${tasksCreated.user} USER, ${tasksCreated.alloro} ALLORO)`,
    );
    log(`  - Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
    log("=".repeat(70) + "\n");

    return res.json({
      success: true,
      message: "Monthly agents completed successfully",
      summaryId,
      referralEngineId,
      opportunityId,
      croOptimizerId,
      duration: `${duration}ms`,
    });
  } catch (error: any) {
    logError("monthly-agents-run", error);
    const duration = Date.now() - startTime;
    log(`\n[FAILED] \u274c Monthly agents failed after ${duration}ms`);
    log("=".repeat(70) + "\n");

    // Mark PMS automation as failed
    if (pmsJobId) {
      await failAutomation(
        pmsJobId,
        "monthly_agents",
        error?.message || "Monthly agents failed",
      );
    }

    return res.status(500).json({
      success: false,
      error: "MONTHLY_AGENTS_ERROR",
      message: error?.message || "Failed to run monthly agents",
      duration: `${duration}ms`,
    });
  }
}

// =====================================================================
// POST /monthly-agents-run-test
// =====================================================================

export async function runMonthlyAgentsTest(
  req: Request,
  res: Response,
): Promise<any> {
  const startTime = Date.now();
  const { googleAccountId, domain } = req.body;

  log("\n" + "=".repeat(70));
  log("POST /api/agents/monthly-agents-run-test - STARTING");
  log("=".repeat(70));
  log(`[TEST MODE] Account ID: ${googleAccountId}`);
  log(`[TEST MODE] Domain: ${domain}`);
  log(`[TEST MODE] Timestamp: ${new Date().toISOString()}`);

  try {
    // Validate input
    if (!googleAccountId || !domain) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMETERS",
        message: "googleAccountId and domain are required",
      });
    }

    // Fetch account
    log(`\n[TEST-SETUP] Fetching account ${googleAccountId}...`);
    const account = await GoogleConnectionModel.findRawById(googleAccountId);

    if (!account) {
      return res.status(404).json({
        success: false,
        error: "ACCOUNT_NOT_FOUND",
        message: `Account ${googleAccountId} not found`,
      });
    }

    // Get OAuth2 client
    log(`[TEST-SETUP] Setting up OAuth2 client...`);
    let oauth2Client;
    try {
      oauth2Client = await getValidOAuth2Client(googleAccountId);
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: "OAUTH_ERROR",
        message: error.message,
      });
    }

    // Calculate month range (use provided dates or default to previous month)
    const monthRange =
      req.body.startDate && req.body.endDate
        ? { startDate: req.body.startDate, endDate: req.body.endDate }
        : getPreviousMonthRange();

    const { startDate, endDate } = monthRange;

    log(
      `[TEST-AGENTS] Running all monthly agents for ${startDate} to ${endDate}...`,
    );
    log(
      `[TEST-AGENTS] NOTE: This is a TEST run - NO data will be persisted to database`,
    );

    // === FETCH DATA (read-only) ===
    // Resolve location for this account
    const locationId = await resolveLocationId(account.organization_id);

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
        log(`[TEST-DATA] Scoped GBP to location ${locationId} (${gbpProps.length} properties)`);
      }
    }
    // Fallback: if no location-scoped properties, parse from JSON blob
    if (!propertyIds.gbp || propertyIds.gbp.length === 0) {
      propertyIds = typeof account.google_property_ids === "string"
        ? JSON.parse(account.google_property_ids)
        : (account.google_property_ids || {});
      log(`[TEST-DATA] Using full JSON blob for GBP (${propertyIds.gbp?.length || 0} properties)`);
    }

    log(`[TEST-DATA] Fetching GBP data...`);
    const monthData = await fetchAllServiceData(
      oauth2Client,
      googleAccountId,
      domain,
      propertyIds,
      startDate,
      endDate,
    );

    // Fetch aggregated PMS data (read-only)
    log(`[TEST-DATA] Fetching aggregated PMS data for org ${account.organization_id}...`);
    let pmsData = null;
    try {
      const aggregated = await aggregatePmsData(account.organization_id);

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
          `[TEST-DATA] \u2713 PMS data found (${aggregated.months.length} months)`,
        );
      } else {
        log(`[TEST-DATA] \u26a0 No approved PMS data found`);
      }
    } catch (pmsError: any) {
      log(`[TEST-DATA] \u26a0 Error fetching PMS data: ${pmsError.message}`);
    }

    // === STEP 1: Run Summary Agent (webhook only, NO DB) ===
    log(`[TEST-SUMMARY] Calling Summary agent webhook...`);
    const summaryPayload = buildSummaryPayload({
      domain,
      googleAccountId,
      startDate,
      endDate,
      monthData,
      pmsData,
    });

    const summaryOutput = await callAgentWebhook(
      SUMMARY_WEBHOOK,
      summaryPayload,
      "Summary",
    );

    logAgentOutput("Summary", summaryOutput);
    if (!isValidAgentOutput(summaryOutput, "Summary")) {
      return res.status(500).json({
        success: false,
        error: "SUMMARY_INVALID",
        message: "Summary agent returned invalid output",
      });
    }
    log(`[TEST-SUMMARY] \u2713 Summary completed`);

    // === STEP 2: Run Referral Engine Agent (webhook only, NO DB) ===
    log(`[TEST-REFERRAL] Calling Referral Engine agent webhook...`);
    const referralEnginePayload = buildReferralEnginePayload({
      domain,
      googleAccountId,
      startDate,
      endDate,
      pmsData,
    });

    const referralEngineOutput = await callAgentWebhook(
      REFERRAL_ENGINE_WEBHOOK,
      referralEnginePayload,
      "Referral Engine",
    );

    logAgentOutput("Referral Engine", referralEngineOutput);
    if (!isValidAgentOutput(referralEngineOutput, "Referral Engine")) {
      return res.status(500).json({
        success: false,
        error: "REFERRAL_ENGINE_INVALID",
        message: "Referral Engine agent returned invalid output",
      });
    }
    log(`[TEST-REFERRAL] \u2713 Referral Engine completed`);

    // === STEP 3: Run Opportunity Agent (webhook only, NO DB) ===
    log(`[TEST-OPPORTUNITY] Calling Opportunity agent webhook...`);
    const opportunityPayload = buildOpportunityPayload({
      domain,
      googleAccountId,
      startDate,
      endDate,
      summaryOutput,
    });

    const opportunityOutput = await callAgentWebhook(
      OPPORTUNITY_WEBHOOK,
      opportunityPayload,
      "Opportunity",
    );

    logAgentOutput("Opportunity", opportunityOutput);
    if (!isValidAgentOutput(opportunityOutput, "Opportunity")) {
      return res.status(500).json({
        success: false,
        error: "OPPORTUNITY_INVALID",
        message: "Opportunity agent returned invalid output",
      });
    }
    log(`[TEST-OPPORTUNITY] \u2713 Opportunity completed`);

    // === STEP 4: Run CRO Optimizer Agent (webhook only, NO DB) ===
    log(`[TEST-CRO] Calling CRO Optimizer agent webhook...`);
    const croOptimizerPayload = buildCroOptimizerPayload({
      domain,
      googleAccountId,
      startDate,
      endDate,
      summaryOutput,
    });

    const croOptimizerOutput = await callAgentWebhook(
      CRO_OPTIMIZER_WEBHOOK,
      croOptimizerPayload,
      "CRO Optimizer",
    );

    logAgentOutput("CRO Optimizer", croOptimizerOutput);
    if (!isValidAgentOutput(croOptimizerOutput, "CRO Optimizer")) {
      return res.status(500).json({
        success: false,
        error: "CRO_OPTIMIZER_INVALID",
        message: "CRO Optimizer agent returned invalid output",
      });
    }
    log(`[TEST-CRO] \u2713 CRO Optimizer completed`);

    // === SIMULATE TASK CREATION (NO DB INSERTS) ===
    log(`[TEST-TASKS] Simulating task creation (NO database writes)...`);
    const tasksToBeCreated = simulateTaskCreation({
      opportunityOutput,
      croOptimizerOutput,
      referralEngineOutput,
    });

    const duration = Date.now() - startTime;

    log("\n" + "=".repeat(70));
    log(`[TEST-COMPLETE] \u2713 Test run completed successfully`);
    log(`  - NO data was persisted to database`);
    log(`  - NO emails were sent`);
    log(`  - NO notifications were created`);
    log(
      `  - Opportunity tasks (simulated): ${tasksToBeCreated.from_opportunity.length}`,
    );
    log(
      `  - CRO Optimizer tasks (simulated): ${tasksToBeCreated.from_cro_optimizer.length}`,
    );
    log(
      `  - Referral Engine tasks (simulated): ${tasksToBeCreated.from_referral_engine.alloro.length} ALLORO, ${tasksToBeCreated.from_referral_engine.user.length} USER`,
    );
    log(`  - Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
    log("=".repeat(70) + "\n");

    return res.json({
      success: true,
      duration: `${duration}ms`,
      testMode: true,
      note: "This was a TEST run - no data was persisted, no emails sent, no tasks created",
      agents: {
        summary: {
          input: summaryPayload,
          output: summaryOutput,
        },
        opportunity: {
          input: opportunityPayload,
          output: opportunityOutput,
        },
        referral_engine: {
          input: referralEnginePayload,
          output: referralEngineOutput,
        },
        cro_optimizer: {
          input: croOptimizerPayload,
          output: croOptimizerOutput,
        },
      },
      tasksToBeCreated,
    });
  } catch (error: any) {
    logError("monthly-agents-run-test", error);
    const duration = Date.now() - startTime;
    log(`\n[TEST-FAILED] \u274c Test run failed after ${duration}ms`);
    log("=".repeat(70) + "\n");

    return res.status(500).json({
      success: false,
      error: "TEST_RUN_ERROR",
      message: error?.message || "Test run failed",
      duration: `${duration}ms`,
    });
  }
}

// =====================================================================
// POST /gbp-optimizer-run
// =====================================================================

export async function runGbpOptimizer(
  req: Request,
  res: Response,
): Promise<any> {
  const startTime = Date.now();
  const { referenceDate } = req.body || {};

  log("\n" + "=".repeat(70));
  log("POST /api/agents/gbp-optimizer-run - STARTING");
  log("=".repeat(70));
  if (referenceDate) log(`Reference Date: ${referenceDate}`);
  log(`Timestamp: ${new Date().toISOString()}`);
  log(`Webhook: ${COPY_COMPANION_WEBHOOK || "NOT CONFIGURED"}`);

  try {
    // Validate webhook configuration
    if (!COPY_COMPANION_WEBHOOK) {
      throw new Error(
        "COPY_COMPANION_AGENT_WEBHOOK not configured in environment",
      );
    }

    // Fetch all onboarded Google accounts (join with organizations for name/domain)
    log("\n[SETUP] Fetching all onboarded Google accounts...");
    const accounts = await GoogleConnectionModel.findOnboardedConnectionsWithOrganization();

    if (!accounts || accounts.length === 0) {
      log("[SETUP] No onboarded accounts found");
      return res.json({
        success: true,
        message: "No accounts to process",
        processed: 0,
        results: [],
      });
    }

    log(`[SETUP] Found ${accounts.length} total account(s)`);

    // Filter accounts that have GBP configured
    log("[SETUP] Filtering accounts with GBP configured...");
    const gbpAccounts = accounts.filter((account: any) => {
      const propertyIds =
        typeof account.google_property_ids === "string"
          ? JSON.parse(account.google_property_ids)
          : account.google_property_ids;
      return (
        propertyIds?.gbp &&
        Array.isArray(propertyIds.gbp) &&
        propertyIds.gbp.length > 0
      );
    });

    if (gbpAccounts.length === 0) {
      log("[SETUP] \u26a0 No accounts with GBP configured");
      return res.json({
        success: true,
        message: "No accounts with GBP to process",
        processed: 0,
        results: [],
      });
    }

    log(
      `[SETUP] \u2713 Found ${gbpAccounts.length} account(s) with GBP configured`,
    );

    // Log account details
    gbpAccounts.forEach((acc: any, idx: number) => {
      const propertyIds =
        typeof acc.google_property_ids === "string"
          ? JSON.parse(acc.google_property_ids)
          : acc.google_property_ids;
      const locationCount = propertyIds?.gbp?.length || 0;
      log(
        `  [${idx + 1}] ${acc.domain_name} (${locationCount} location${
          locationCount !== 1 ? "s" : ""
        })`,
      );
    });

    // Get previous month date range
    const monthRange = getPreviousMonthRange(referenceDate);
    log(
      `\n[SETUP] Month range: ${monthRange.startDate} to ${monthRange.endDate}`,
    );

    // Process each client sequentially
    const results: any[] = [];

    for (const account of gbpAccounts) {
      const { id: googleAccountId, domain_name: domain, organization_id: organizationId } = account;
      const accountIndex = gbpAccounts.indexOf(account) + 1;

      log(`\n[${"=".repeat(60)}]`);
      log(
        `[CLIENT ${accountIndex}/${gbpAccounts.length}] Processing: ${domain} (ID: ${googleAccountId})`,
      );
      log(`[${"=".repeat(60)}]`);

      try {
        // Resolve location for this account
        const locationId = await resolveLocationId(organizationId);

        // Check for duplicate before running
        log(`[CLIENT] Checking for existing results...`);
        const existingResult = await AgentResultModel.findExistingByConditions(
          {
            organization_id: account.organization_id,
            agent_type: "gbp_optimizer",
            date_start: monthRange.startDate,
            date_end: monthRange.endDate,
          },
          ["success", "pending"],
        );

        if (existingResult) {
          log(
            `[CLIENT] \u2139 GBP Optimizer already run for this period (Result ID: ${existingResult.id})`,
          );
          log(`[CLIENT] Skipping ${domain}`);
          results.push({
            googleAccountId,
            domain,
            success: true,
            skipped: true,
            reason: "already_exists",
            existingResultId: existingResult.id,
          });
          continue;
        }

        log(`[CLIENT] No existing results found - proceeding`);

        // Get valid OAuth2 client
        log(
          `[CLIENT] Getting valid OAuth2 client for account ${googleAccountId}`,
        );
        const oauth2Client = await getValidOAuth2Client(googleAccountId);

        // Run GBP Optimizer agent
        log(`\n[CLIENT] Running GBP Optimizer agent...`);
        const result = await processGBPOptimizerAgent(
          account,
          oauth2Client,
          monthRange,
        );

        if (!result.success) {
          throw new Error(result.error || "GBP Optimizer agent failed");
        }

        // Save agent result to database
        log(`\n[CLIENT] Saving results to database...`);
        const resultId = await AgentResultModel.insertReturningId({
          organization_id: account.organization_id,
          location_id: locationId,
          agent_type: "gbp_optimizer",
          date_start: monthRange.startDate,
          date_end: monthRange.endDate,
          agent_input: JSON.stringify(result.payload),
          agent_output: JSON.stringify(result.output),
          status: "success",
          created_at: new Date(),
          updated_at: new Date(),
        });
        log(`[CLIENT] \u2713 Agent result saved (ID: ${resultId})`);

        // Create tasks from recommendations
        await createTasksFromCopyRecommendations(
          result.output,
          googleAccountId,
          organizationId,
          locationId,
        );

        results.push({
          googleAccountId,
          domain,
          success: true,
          resultId,
          recommendationCount: Object.keys(result.output[0] || {}).length,
        });

        log(`\n[CLIENT] \u2713 ${domain} completed successfully`);
      } catch (error: any) {
        logError(`GBP Optimizer for ${domain}`, error);
        log(
          `[CLIENT] \u2717 ${domain} failed: ${error?.message || String(error)}`,
        );

        results.push({
          googleAccountId,
          domain,
          success: false,
          error: error?.message || String(error),
        });
      }
    }

    const duration = Date.now() - startTime;
    const successfulClients = results.filter(
      (r) => r.success && !r.skipped,
    ).length;
    const skippedClients = results.filter((r) => r.skipped).length;
    const failedClients = results.filter((r) => !r.success).length;

    log("\n" + "=".repeat(70));
    log(`[COMPLETE] \u2713 GBP Optimizer run completed`);
    log(`  - Total accounts: ${gbpAccounts.length}`);
    log(`  - Successful: ${successfulClients}`);
    log(`  - Skipped: ${skippedClients}`);
    log(`  - Failed: ${failedClients}`);
    log(`  - Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
    log("=".repeat(70) + "\n");

    return res.json({
      success: true,
      message: `Processed ${gbpAccounts.length} account(s)`,
      processed: gbpAccounts.length,
      successful: successfulClients,
      skipped: skippedClients,
      failed: failedClients,
      duration: `${duration}ms`,
      results,
    });
  } catch (error: any) {
    logError("gbp-optimizer-run", error);
    const duration = Date.now() - startTime;
    log(`\n[FAILED] \u274c GBP Optimizer run failed after ${duration}ms`);
    log(`  Error: ${error?.message || String(error)}`);
    log("=".repeat(70) + "\n");

    return res.status(500).json({
      success: false,
      error: "GBP_OPTIMIZER_RUN_ERROR",
      message: error?.message || "Failed to run GBP optimizer agent",
      duration: `${duration}ms`,
    });
  }
}

// =====================================================================
// POST /ranking-run
// =====================================================================

export async function runRankingAgent(
  req: Request,
  res: Response,
): Promise<any> {
  const startTime = Date.now();
  const { googleAccountId } = req.body || {};

  log("\n" + "=".repeat(70));
  log("POST /api/agents/ranking-run - STARTING");
  log("=".repeat(70));
  if (googleAccountId) log(`Connection ID filter: ${googleAccountId}`);
  log(`Timestamp: ${new Date().toISOString()}`);

  try {
    const { batches, workItems, totalLocations } = await setupRankingBatches(googleAccountId);

    if (batches.length === 0) {
      return res.json({ success: true, message: "No orgs with GBP locations found", batches: [] });
    }

    // Kick off background processing and return immediately
    setImmediate(() => {
      processRankingWork(workItems)
        .then(() => {
          const duration = Date.now() - startTime;
          log("\n" + "=".repeat(70));
          log(`[COMPLETE] Ranking run completed in ${(duration / 1000).toFixed(1)}s`);
          log("=".repeat(70) + "\n");
        })
        .catch((err) => {
          logError("ranking-run background processing", err);
        });
    });

    return res.json({
      success: true,
      message: `Queued ${batches.length} org(s) for ranking analysis`,
      totalLocations,
      batches,
    });
  } catch (error: any) {
    logError("ranking-run", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// =====================================================================
// POST /guardian-governance-agents-run
// =====================================================================

export async function runGuardianGovernance(
  req: Request,
  res: Response,
): Promise<any> {
  const startTime = Date.now();
  const { month, referenceDate } = req.body || {};

  log("\n" + "=".repeat(70));
  log("POST /api/agents/guardian-governance-agents-run - STARTING");
  log("=".repeat(70));
  if (month) log(`Month: ${month}`);
  if (referenceDate) log(`Reference Date: ${referenceDate}`);
  log(`Timestamp: ${new Date().toISOString()}`);

  try {
    const result = await runGuardianGovernanceAgents(month, referenceDate);

    if (result.skipped) {
      return res.json({
        success: true,
        message: result.message,
        skipped: true,
        existingResultId: result.existingResultId,
      });
    }

    if (result.processed === 0 && !result.guardianResultId) {
      return res.json({
        success: true,
        message: result.message || "No agent results to process",
        processed: 0,
        guardianResultId: null,
        governanceResultId: null,
      });
    }

    const duration = Date.now() - startTime;

    log("\n" + "=".repeat(70));
    log(`[GUARDIAN-GOV] \u2713 COMPLETED SUCCESSFULLY`);
    log(`  - Total groups: ${result.groupsProcessed}`);
    log(`  - Successful: ${result.successfulGroups}`);
    log(`  - Failed: ${result.failedGroups}`);
    log(`  - Guardian ID: ${result.guardianResultId}`);
    log(`  - Governance ID: ${result.governanceResultId}`);
    log(`  - Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
    log("=".repeat(70) + "\n");

    return res.json({
      success: true,
      message: "Guardian and Governance agents completed",
      guardianResultId: result.guardianResultId,
      governanceResultId: result.governanceResultId,
      groupsProcessed: result.groupsProcessed,
      successfulGroups: result.successfulGroups,
      failedGroups: result.failedGroups,
      groupDetails: result.groupDetails,
      duration: `${duration}ms`,
    });
  } catch (error: any) {
    logError("guardian-governance-agents-run", error);
    const duration = Date.now() - startTime;
    log(
      `\n[GUARDIAN-GOV] \u274c Guardian/Governance run failed after ${duration}ms`,
    );
    log(`  Error: ${error?.message || String(error)}`);
    log("=".repeat(70) + "\n");

    return res.status(500).json({
      success: false,
      error: "GUARDIAN_GOVERNANCE_RUN_ERROR",
      message: error?.message || "Failed to run guardian/governance agents",
      duration: `${duration}ms`,
    });
  }
}

// =====================================================================
// POST /process-all (DEPRECATED)
// =====================================================================

export async function processAllDeprecated(
  req: Request,
  res: Response,
): Promise<any> {
  const startTime = Date.now();
  const { referenceDate } = req.body || {};

  log("\n" + "=".repeat(70));
  log("POST /api/agents/process-all - STARTING");
  log("=".repeat(70));
  if (referenceDate) log(`Reference Date: ${referenceDate}`);
  log(`Timestamp: ${new Date().toISOString()}`);
  log(`Max retries per client: 3`);

  try {
    // Fetch all onboarded Google accounts (join with organizations for name/domain)
    log("\n[SETUP] Fetching all onboarded Google accounts...");
    const accounts = await GoogleConnectionModel.findOnboardedConnectionsWithOrganization();

    if (!accounts || accounts.length === 0) {
      log("[SETUP] No onboarded accounts found");
      return res.json({
        success: true,
        message: "No accounts to process",
        processed: 0,
        results: [],
      });
    }

    log(`[SETUP] Found ${accounts.length} account(s) to process`);

    // Process each client sequentially with retry mechanism
    const results: any[] = [];
    let totalRetries = 0;

    for (const account of accounts) {
      const result = await processClient(account, referenceDate);

      // Track retry statistics
      if (result.attempts && result.attempts > 1) {
        totalRetries += result.attempts - 1;
        log(
          `[STATS] Client ${account.domain_name} required ${result.attempts} attempt(s)`,
        );
      }

      results.push({
        googleAccountId: account.id,
        domain: account.domain_name,
        ...result,
      });

      // Stop on first error after all retries exhausted
      if (!result.success) {
        log(
          `\n[ERROR] \u274c Stopping processing - ${account.domain_name} failed after ${result.attempts} attempts`,
        );
        throw new Error(
          `Processing failed for ${account.domain_name} after ${result.attempts} attempts: ${result.error}`,
        );
      }
    }

    const duration = Date.now() - startTime;
    const successfulClients = results.filter((r) => r.success).length;

    log("\n" + "=".repeat(70));
    log(`[COMPLETE] \u2713 All clients processed successfully`);
    log(`  - Total clients: ${accounts.length}`);
    log(`  - Successful: ${successfulClients}`);
    log(`  - Total retries: ${totalRetries}`);
    log(`  - Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
    log("=".repeat(70) + "\n");

    return res.json({
      success: true,
      message: `Processed ${accounts.length} account(s) successfully`,
      processed: accounts.length,
      successful: successfulClients,
      totalRetries,
      duration: `${duration}ms`,
      results,
    });
  } catch (error: any) {
    logError("process-all", error);
    const duration = Date.now() - startTime;
    log(`\n[FAILED] \u274c Processing failed after ${duration}ms`);
    log("=".repeat(70) + "\n");

    return res.status(500).json({
      success: false,
      error: "PROCESSING_ERROR",
      message: error?.message || "Failed to process agents",
      duration: `${duration}ms`,
    });
  }
}

// =====================================================================
// GET /latest/:googleAccountId
// =====================================================================

export async function getLatestOutputs(
  req: Request,
  res: Response,
): Promise<any> {
  const { googleAccountId } = req.params;
  const scopedReq = req as any;

  try {
    // Prefer organizationId from RBAC middleware
    const organizationId = scopedReq.organizationId || parseInt(googleAccountId, 10);
    const locationId = scopedReq.locationId || (req.query.locationId ? parseInt(req.query.locationId as string, 10) : null);

    log(`\n[GET /latest] Fetching latest agent outputs for org: ${organizationId}, location: ${locationId || "all"}`);

    if (isNaN(organizationId)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_ACCOUNT_ID",
        message: "Invalid account ID provided",
      });
    }

    // Fetch latest successful result for each agent type
    const agentTypes = ["proofline", "summary", "opportunity"];
    const agents: any = {};

    for (const agentType of agentTypes) {
      const result = await AgentResultModel.findLatestByOrganizationAndAgent(
        organizationId,
        agentType,
        locationId,
      );

      if (result) {
        let parsedOutput = result.agent_output;

        agents[agentType] = {
          results: parsedOutput,
          lastUpdated: result.created_at,
          dateStart: result.date_start,
          dateEnd: result.date_end,
          resultId: result.id,
        };
      } else {
        agents[agentType] = null;
      }
    }

    log(
      `  [SUCCESS] Retrieved latest outputs for org ${organizationId}`,
    );

    return res.json({
      success: true,
      googleAccountId: organizationId,
      organizationId,
      agents,
    });
  } catch (error: any) {
    logError(`GET /latest/${googleAccountId}`, error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch latest agent outputs",
    });
  }
}

// =====================================================================
// GET /getLatestReferralEngineOutput/:googleAccountId
// =====================================================================

export async function getLatestReferralEngineOutput(
  req: Request,
  res: Response,
): Promise<any> {
  const { googleAccountId } = req.params;
  const scopedReq = req as any;

  try {
    // Prefer organizationId from RBAC middleware
    const organizationId = scopedReq.organizationId || parseInt(googleAccountId, 10);
    const locationId = scopedReq.locationId || (req.query.locationId ? parseInt(req.query.locationId as string, 10) : null);

    log(
      `\n[GET /getLatestReferralEngineOutput] Fetching for org: ${organizationId}, location: ${locationId || "all"}`,
    );

    if (isNaN(organizationId)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_ACCOUNT_ID",
        message: "Invalid account ID provided",
      });
    }

    // Check for active automation (monthly agents processing)
    const activeAutomation = await PmsJobModel.findActiveMonthlyAgentsAutomation(
      organizationId,
      locationId,
    );

    if (activeAutomation) {
      log(
        `  [PENDING] Active automation found for org ${organizationId} - PMS Job ID: ${activeAutomation.id}`,
      );
      return res.json({
        success: true,
        pending: true,
        message: "Monthly insights are being generated...",
        googleAccountId: organizationId,
        organizationId,
        data: null,
        metadata: {
          pmsJobId: activeAutomation.id,
          automationStatus: "processing",
        },
      });
    }

    // Fetch latest successful referral_engine result
    const result = await AgentResultModel.findLatestByOrganizationAndAgent(
      organizationId,
      "referral_engine",
      locationId,
    );

    if (!result) {
      log(
        `  [NO DATA] No referral engine results found for org ${organizationId}`,
      );
      return res.status(404).json({
        success: false,
        error: "NO_DATA",
        message: "No referral engine data available yet",
      });
    }

    log(
      `  [SUCCESS] Retrieved referral engine output for org ${organizationId}`,
    );
    log(`  - Result ID: ${result.id}`);
    log(`  - Date range: ${result.date_start} to ${result.date_end}`);
    log(`  - Created: ${result.created_at}`);

    return res.json({
      success: true,
      pending: false,
      googleAccountId: organizationId,
      organizationId,
      data: result.agent_output,
      metadata: {
        resultId: result.id,
        dateStart: result.date_start,
        dateEnd: result.date_end,
        lastUpdated: result.created_at,
      },
    });
  } catch (error: any) {
    logError(`GET /getLatestReferralEngineOutput/${googleAccountId}`, error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch referral engine output",
    });
  }
}

// =====================================================================
// GET /health
// =====================================================================

export function healthCheck(_req: Request, res: Response): void {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    webhooks: {
      proofline: !!PROOFLINE_WEBHOOK,
      summary: !!SUMMARY_WEBHOOK,
      referral_engine: !!REFERRAL_ENGINE_WEBHOOK,
      opportunity: !!OPPORTUNITY_WEBHOOK,
      cro_optimizer: !!CRO_OPTIMIZER_WEBHOOK,
      copy_companion: !!COPY_COMPANION_WEBHOOK,
      guardian: !!GUARDIAN_AGENT_WEBHOOK,
      governance: !!GOVERNANCE_AGENT_WEBHOOK,
    },
  });
}
