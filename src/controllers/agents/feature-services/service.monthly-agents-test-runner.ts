/**
 * Monthly Agents Test Runner Service
 *
 * Standalone TEST-mode execution of the monthly agents pipeline — decoupled
 * from HTTP context. Read-only: NO database writes, NO emails, NO notifications.
 *
 * Owns the full test pipeline: data fetch (GBP + aggregated PMS), the four
 * webhook agent calls (Summary, Referral Engine, Opportunity, CRO Optimizer),
 * and returns their outputs for inspection.
 *
 * The HTTP handler (AgentsController.runMonthlyAgentsTest) stays thin: it
 * forwards the request body and shapes the returned { status, body }.
 */

import { getValidOAuth2Client } from "../../../auth/oauth2Helper";
import {
  fetchAllServiceData,
  GooglePropertyIds,
} from "../../../utils/dataAggregation/dataAggregator";
import { aggregatePmsData } from "../../../utils/pms/pmsAggregator";
import { resolveLocationId } from "../../../utils/locationResolver";
import { GooglePropertyModel } from "../../../models/GooglePropertyModel";
import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import {
  log,
  logError,
  isValidAgentOutput,
  logAgentOutput,
} from "../feature-utils/agentLogger";
import { getPreviousMonthRange } from "../feature-utils/dateHelpers";
import {
  callAgentWebhook,
  SUMMARY_WEBHOOK,
  REFERRAL_ENGINE_WEBHOOK,
  OPPORTUNITY_WEBHOOK,
  CRO_OPTIMIZER_WEBHOOK,
} from "./service.webhook-orchestrator";
import {
  buildSummaryPayload,
  buildReferralEnginePayload,
  buildOpportunityPayload,
  buildCroOptimizerPayload,
} from "./service.agent-input-builder";

export interface MonthlyAgentsTestInput {
  // Values originate from req.body (untyped); kept `any` to preserve the
  // original handler's lack of narrowing at downstream call sites.
  googleAccountId?: any;
  domain?: string;
  startDate?: string;
  endDate?: string;
}

export interface MonthlyAgentsTestResult {
  status: number;
  body: Record<string, any>;
}

/**
 * Run the monthly agents pipeline in TEST mode (read-only). Returns the HTTP
 * status + body for the caller to relay. Persists nothing.
 */
export async function runMonthlyAgentsTest(
  input: MonthlyAgentsTestInput,
): Promise<MonthlyAgentsTestResult> {
  const startTime = Date.now();
  const { googleAccountId, domain } = input;

  log("\n" + "=".repeat(70));
  log("POST /api/agents/monthly-agents-run-test - STARTING");
  log("=".repeat(70));
  log(`[TEST MODE] Account ID: ${googleAccountId}`);
  log(`[TEST MODE] Domain: ${domain}`);
  log(`[TEST MODE] Timestamp: ${new Date().toISOString()}`);

  try {
    // Validate input
    if (!googleAccountId || !domain) {
      return {
        status: 400,
        body: {
          success: false,
          error: "MISSING_PARAMETERS",
          message: "googleAccountId and domain are required",
        },
      };
    }

    // Fetch account
    log(`\n[TEST-SETUP] Fetching account ${googleAccountId}...`);
    const account = await GoogleConnectionModel.findRawById(
      googleAccountId as any,
    );

    if (!account) {
      return {
        status: 404,
        body: {
          success: false,
          error: "ACCOUNT_NOT_FOUND",
          message: `Account ${googleAccountId} not found`,
        },
      };
    }

    // Get OAuth2 client
    log(`[TEST-SETUP] Setting up OAuth2 client...`);
    let oauth2Client;
    try {
      oauth2Client = await getValidOAuth2Client(googleAccountId as any);
    } catch (error: any) {
      return {
        status: 500,
        body: {
          success: false,
          error: "OAUTH_ERROR",
          message: error.message,
        },
      };
    }

    // Calculate month range (use provided dates or default to previous month)
    const monthRange =
      input.startDate && input.endDate
        ? { startDate: input.startDate, endDate: input.endDate }
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
        log(
          `[TEST-DATA] Scoped GBP to location ${locationId} (${gbpProps.length} properties)`,
        );
      }
    }
    // Fallback: if no location-scoped properties, parse from JSON blob
    if (!propertyIds.gbp || propertyIds.gbp.length === 0) {
      propertyIds =
        typeof account.google_property_ids === "string"
          ? JSON.parse(account.google_property_ids)
          : account.google_property_ids || {};
      log(
        `[TEST-DATA] Using full JSON blob for GBP (${propertyIds.gbp?.length || 0} properties)`,
      );
    }

    log(`[TEST-DATA] Fetching GBP data...`);
    const monthData = await fetchAllServiceData(
      oauth2Client,
      googleAccountId as any,
      domain,
      propertyIds,
      startDate,
      endDate,
    );

    // Fetch aggregated PMS data (read-only)
    log(
      `[TEST-DATA] Fetching aggregated PMS data for org ${account.organization_id}...`,
    );
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
          `[TEST-DATA] ✓ PMS data found (${aggregated.months.length} months)`,
        );
      } else {
        log(`[TEST-DATA] ⚠ No approved PMS data found`);
      }
    } catch (pmsError: any) {
      log(`[TEST-DATA] ⚠ Error fetching PMS data: ${pmsError.message}`);
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
      return {
        status: 500,
        body: {
          success: false,
          error: "SUMMARY_INVALID",
          message: "Summary agent returned invalid output",
        },
      };
    }
    log(`[TEST-SUMMARY] ✓ Summary completed`);

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
      return {
        status: 500,
        body: {
          success: false,
          error: "REFERRAL_ENGINE_INVALID",
          message: "Referral Engine agent returned invalid output",
        },
      };
    }
    log(`[TEST-REFERRAL] ✓ Referral Engine completed`);

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
      return {
        status: 500,
        body: {
          success: false,
          error: "OPPORTUNITY_INVALID",
          message: "Opportunity agent returned invalid output",
        },
      };
    }
    log(`[TEST-OPPORTUNITY] ✓ Opportunity completed`);

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
      return {
        status: 500,
        body: {
          success: false,
          error: "CRO_OPTIMIZER_INVALID",
          message: "CRO Optimizer agent returned invalid output",
        },
      };
    }
    log(`[TEST-CRO] ✓ CRO Optimizer completed`);

    const duration = Date.now() - startTime;

    log("\n" + "=".repeat(70));
    log(`[TEST-COMPLETE] ✓ Test run completed successfully`);
    log(`  - NO data was persisted to database`);
    log(`  - NO emails were sent`);
    log(`  - NO notifications were created`);
    log(`  - Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
    log("=".repeat(70) + "\n");

    return {
      status: 200,
      body: {
        success: true,
        duration: `${duration}ms`,
        testMode: true,
        note: "This was a TEST run - no data was persisted and no emails were sent",
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
      },
    };
  } catch (error: any) {
    logError("monthly-agents-run-test", error);
    const duration = Date.now() - startTime;
    log(`\n[TEST-FAILED] ❌ Test run failed after ${duration}ms`);
    log("=".repeat(70) + "\n");

    return {
      status: 500,
      body: {
        success: false,
        error: "TEST_RUN_ERROR",
        message: error?.message || "Test run failed",
        duration: `${duration}ms`,
      },
    };
  }
}
