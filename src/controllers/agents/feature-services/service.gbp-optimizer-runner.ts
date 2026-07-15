/**
 * GBP Optimizer Runner Service
 *
 * Standalone monthly GBP Copy Optimizer execution for all onboarded clients —
 * decoupled from HTTP context. Owns webhook-config validation, account
 * fetching/filtering (GBP-configured only), the per-client dedupe + run +
 * persist loop and result aggregation.
 *
 * The HTTP handler (AgentsController.runGbpOptimizer) stays thin: it forwards
 * the request body and shapes the returned { status, body }.
 */

import { getValidOAuth2Client } from "../../../auth/oauth2Helper";
import { resolveLocationId } from "../../../utils/locationResolver";
import { AgentResultModel } from "../../../models/AgentResultModel";
import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import { log, logError } from "../feature-utils/agentLogger";
import { getPreviousMonthRange } from "../feature-utils/dateHelpers";
import { COPY_COMPANION_WEBHOOK } from "./service.webhook-orchestrator";
import { processGBPOptimizerAgent } from "./service.agent-orchestrator";

export interface GbpOptimizerRunResult {
  status: number;
  body: Record<string, any>;
}

/**
 * Run the GBP Copy Optimizer for all onboarded GBP-configured accounts.
 * Returns the HTTP status + body for the caller to relay.
 */
export async function runGbpOptimizerForAllAccounts(
  referenceDate?: string,
): Promise<GbpOptimizerRunResult> {
  const startTime = Date.now();

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
    const accounts =
      await GoogleConnectionModel.findOnboardedConnectionsWithOrganization();

    if (!accounts || accounts.length === 0) {
      log("[SETUP] No onboarded accounts found");
      return {
        status: 200,
        body: {
          success: true,
          message: "No accounts to process",
          processed: 0,
          results: [],
        },
      };
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
      log("[SETUP] ⚠ No accounts with GBP configured");
      return {
        status: 200,
        body: {
          success: true,
          message: "No accounts with GBP to process",
          processed: 0,
          results: [],
        },
      };
    }

    log(
      `[SETUP] ✓ Found ${gbpAccounts.length} account(s) with GBP configured`,
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
      const {
        id: googleAccountId,
        domain_name: domain,
        organization_id: organizationId,
      } = account;
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
            `[CLIENT] ℹ GBP Optimizer already run for this period (Result ID: ${existingResult.id})`,
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
        log(`[CLIENT] ✓ Agent result saved (ID: ${resultId})`);

        results.push({
          googleAccountId,
          domain,
          success: true,
          resultId,
          recommendationCount: Object.keys(result.output[0] || {}).length,
        });

        log(`\n[CLIENT] ✓ ${domain} completed successfully`);
      } catch (error: any) {
        logError(`GBP Optimizer for ${domain}`, error);
        log(
          `[CLIENT] ✗ ${domain} failed: ${error?.message || String(error)}`,
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
    log(`[COMPLETE] ✓ GBP Optimizer run completed`);
    log(`  - Total accounts: ${gbpAccounts.length}`);
    log(`  - Successful: ${successfulClients}`);
    log(`  - Skipped: ${skippedClients}`);
    log(`  - Failed: ${failedClients}`);
    log(`  - Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
    log("=".repeat(70) + "\n");

    return {
      status: 200,
      body: {
        success: true,
        message: `Processed ${gbpAccounts.length} account(s)`,
        processed: gbpAccounts.length,
        successful: successfulClients,
        skipped: skippedClients,
        failed: failedClients,
        duration: `${duration}ms`,
        results,
      },
    };
  } catch (error: any) {
    logError("gbp-optimizer-run", error);
    const duration = Date.now() - startTime;
    log(`\n[FAILED] ❌ GBP Optimizer run failed after ${duration}ms`);
    log(`  Error: ${error?.message || String(error)}`);
    log("=".repeat(70) + "\n");

    return {
      status: 500,
      body: {
        success: false,
        error: "GBP_OPTIMIZER_RUN_ERROR",
        message: error?.message || "Failed to run GBP optimizer agent",
        duration: `${duration}ms`,
      },
    };
  }
}
