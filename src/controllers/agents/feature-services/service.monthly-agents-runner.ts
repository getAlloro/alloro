/**
 * Monthly Agents Runner Service
 *
 * Standalone monthly-agents execution for a single account — decoupled from
 * HTTP context. Owns the full orchestration: validation, account fetch,
 * archived guard, location resolution, month range, OAuth, the monthly agents
 * call, raw-data persistence, notifications, admin email, and
 * PMS automation-status transitions.
 *
 * The HTTP handler (AgentsController.runMonthlyAgents) stays thin: it forwards
 * the request body and shapes the returned { status, body } into a response.
 */

import { getValidOAuth2Client } from "../../../auth/oauth2Helper";
import {
  createNotification,
  notifyAdminsMonthlyAgentComplete,
} from "../../../utils/core/notificationHelper";
import {
  updateAutomationStatus,
  completeAutomation,
  failAutomation,
  AutomationSummary,
  MonthlyAgentKey,
} from "../../../utils/pms/pmsAutomationStatus";
import { resolveLocationId } from "../../../utils/locationResolver";
import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import { GoogleDataStoreModel } from "../../../models/GoogleDataStoreModel";
import { log, logError } from "../feature-utils/agentLogger";
import { getPreviousMonthRange } from "../feature-utils/dateHelpers";
import { processMonthlyAgents } from "./service.agent-orchestrator";

export interface MonthlyAgentsRunInput {
  // Values originate from req.body (untyped); kept `any` to preserve the
  // original handler's lack of narrowing at the model/util call sites.
  googleAccountId?: any;
  force?: boolean;
  pmsJobId?: any;
  locationId?: any;
}

export interface MonthlyAgentsRunResult {
  status: number;
  body: Record<string, any>;
}

/**
 * Run the monthly agents pipeline for a single account.
 *
 * Returns the HTTP status + body for the caller to relay. All side effects
 * (notifications, admin email, PMS automation-status transitions) happen here
 * because they are business logic, not response shaping.
 */
export async function runMonthlyAgentsForAccount(
  input: MonthlyAgentsRunInput,
): Promise<MonthlyAgentsRunResult> {
  const startTime = Date.now();
  const {
    googleAccountId,
    force = false,
    pmsJobId,
    locationId: requestLocationId,
  } = input;

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
      return {
        status: 400,
        body: {
          success: false,
          error: "MISSING_PARAMETERS",
          message: "googleAccountId is required",
        },
      };
    }

    // Fetch account (join with org for name/domain)
    log(`\n[SETUP] Fetching account ${googleAccountId}...`);
    const account = await GoogleConnectionModel.findByIdWithOrganizationDetails(
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

    log(`[SETUP] Account found: ${account.domain_name}`);

    if (account.org_archived_at) {
      const message = "Organization is archived; monthly agents will not run.";
      if (pmsJobId) {
        await failAutomation(Number(pmsJobId), "monthly_agents", message);
      }
      return {
        status: 423,
        body: {
          success: false,
          error: "ORGANIZATION_ARCHIVED",
          message,
        },
      };
    }

    // Use passed locationId if available, otherwise resolve from org
    const locationId = requestLocationId
      ? Number(requestLocationId)
      : await resolveLocationId(account.organization_id);
    log(
      `[SETUP] Using locationId: ${locationId}${requestLocationId ? " (from request)" : " (resolved from org)"}`,
    );

    // Get month range
    const monthRange = getPreviousMonthRange();
    log(
      `[SETUP] Month range: ${monthRange.startDate} to ${monthRange.endDate}`,
    );

    // Removed duplicate check - always run monthly agents when called
    log(`[SETUP] Proceeding with monthly agents run`);

    // Get valid OAuth2 client
    log(`[CLIENT] Getting valid OAuth2 client`);
    const oauth2Client = await getValidOAuth2Client(googleAccountId as any);

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
    log(
      `[CLIENT] Agent results saved (Summary: ${summaryId}, Opportunity: ${opportunityId}, CRO: ${croOptimizerId}, Referral: ${referralEngineId})`,
    );

    // Save raw GBP data
    await GoogleDataStoreModel.insertRaw(monthlyResult.rawData);
    log(`[CLIENT] ✓ Raw GBP data saved`);

    // Mark all agents complete while finalizing the supported insight output.
    await updatePmsStatus(
      "referral_engine",
      "All agents completed. Finalizing insights...",
      "referral_engine",
    );

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
      log(`[CLIENT] ✓ Notification created for completed monthly agents`);
    } catch (notificationError: any) {
      log(
        `[CLIENT] ⚠ Failed to create notification: ${notificationError.message}`,
      );
      // Don't fail the entire operation if notification creation fails
    }

    const duration = Date.now() - startTime;

    // Send admin email notification about monthly agent completion.
    try {
      await notifyAdminsMonthlyAgentComplete(
        account.practice_name || account.domain_name || "Unknown",
      );
      log(`[CLIENT] ✓ Admin email sent for monthly agents completion`);
    } catch (adminEmailError: any) {
      log(
        `[CLIENT] ⚠ Failed to send admin email: ${adminEmailError.message}`,
      );
      // Don't fail the entire operation if admin email fails
    }

    // Complete the PMS automation status
    if (pmsJobId) {
      const automationSummary: AutomationSummary = {
        agentResults: {
          summary: { success: true, resultId: summaryId },
          referral_engine: { success: true, resultId: referralEngineId },
          opportunity: { success: true, resultId: opportunityId },
          cro_optimizer: { success: true, resultId: croOptimizerId },
        },
        duration: `${(duration / 1000).toFixed(1)}s`,
      };

      await completeAutomation(pmsJobId, automationSummary);
      log(`[CLIENT] ✓ PMS automation status marked as complete`);
    }

    log("\n" + "=".repeat(70));
    log(`[COMPLETE] ✓ Monthly agents completed successfully`);
    log(`  - Summary ID: ${summaryId}`);
    log(`  - Referral Engine ID: ${referralEngineId}`);
    log(`  - Opportunity ID: ${opportunityId}`);
    log(`  - CRO Optimizer ID: ${croOptimizerId}`);
    log(`  - Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
    log("=".repeat(70) + "\n");

    return {
      status: 200,
      body: {
        success: true,
        message: "Monthly agents completed successfully",
        summaryId,
        referralEngineId,
        opportunityId,
        croOptimizerId,
        duration: `${duration}ms`,
      },
    };
  } catch (error: any) {
    logError("monthly-agents-run", error);
    const duration = Date.now() - startTime;
    log(`\n[FAILED] ❌ Monthly agents failed after ${duration}ms`);
    log("=".repeat(70) + "\n");

    // Mark PMS automation as failed
    if (pmsJobId) {
      await failAutomation(
        pmsJobId,
        "monthly_agents",
        error?.message || "Monthly agents failed",
      );
    }

    return {
      status: 500,
      body: {
        success: false,
        error: "MONTHLY_AGENTS_ERROR",
        message: error?.message || "Failed to run monthly agents",
        duration: `${duration}ms`,
      },
    };
  }
}
