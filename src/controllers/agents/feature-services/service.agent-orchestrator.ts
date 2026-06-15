/**
 * Agent Orchestrator Service
 *
 * Core orchestration logic for multi-agent sequential execution.
 * Owns processClient (the per-account 3-attempt retry loop + the atomic
 * daily-result persistence transaction) and re-exports the per-agent
 * processors so the public import surface stays at this path.
 *
 * Decomposed in the structural pass (was ~1,212 lines, over the ~800 ceiling):
 *   - processDailyAgent        → ./service.daily-agent-processor
 *   - processMonthlyAgents     → ./service.monthly-agent-processor
 *   - processGBPOptimizerAgent → ./service.gbp-optimizer-processor
 *   - runMonthlyAgent          → ./service.monthly-agent-runner-core
 *   - Summary v2 validators     → ../feature-utils/summaryV2Validators
 *
 * This is the heart of the agent processing system.
 */

import { db } from "../../../database/connection";
import { AgentResultModel } from "../../../models/AgentResultModel";
import { GoogleDataStoreModel } from "../../../models/GoogleDataStoreModel";
import { getValidOAuth2Client } from "../../../auth/oauth2Helper";
import { log, logError, delay } from "../feature-utils/agentLogger";
import { getDailyDates, getPreviousMonthRange, shouldRunMonthlyAgents } from "../feature-utils/dateHelpers";
import { resolveLocationId } from "../../../utils/locationResolver";
import { processDailyAgent } from "./service.daily-agent-processor";
import { processMonthlyAgents } from "./service.monthly-agent-processor";

// Re-export the per-agent processors so existing importers keep resolving
// them from this module path (import surface preservation).
export { processDailyAgent } from "./service.daily-agent-processor";
export { processMonthlyAgents } from "./service.monthly-agent-processor";
export { processGBPOptimizerAgent } from "./service.gbp-optimizer-processor";

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
        `\n[CLIENT] 🔄 RETRY ATTEMPT ${attempt}/${MAX_ATTEMPTS} for ${domain}`,
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
      const monthRange = getPreviousMonthRange(referenceDate);

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
        log(`[CLIENT] ⚠ Daily agent failed: ${dailyResult.error}`);
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
        const existingSummary = await AgentResultModel.findExistingByConditions(
          {
            organization_id: account.organization_id,
            agent_type: "summary",
            date_start: monthRange.startDate,
            date_end: monthRange.endDate,
          },
          ["success", "pending"],
        );

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
            log(`[CLIENT] ⚠ Monthly agents failed: ${monthlyResult.error}`);
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
      log(`[CLIENT] ✓ All agent outputs validated successfully`);
      log(`[CLIENT] Persisting results to database...`);

      // Check for duplicate daily result before inserting
      const existingDaily = await AgentResultModel.findExistingByConditions(
        {
          organization_id: account.organization_id,
          agent_type: "proofline",
          date_start: dailyDates.dayBeforeYesterday,
          date_end: dailyDates.yesterday,
        },
        ["success", "pending"],
      );

      if (!existingDaily) {
        // Atomic: the daily raw GBP data and its agent_results row must land
        // together. All external agent work already ran above (in memory), so
        // the transaction wraps only these two local writes.
        const dailyResultId = await db.transaction(async (trx) => {
          await GoogleDataStoreModel.insertRaw(dailyResult.rawData, trx);

          const insertedId = await AgentResultModel.insertReturningId(
            {
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
            },
            trx,
          );
          return insertedId;
        });

        log(`[CLIENT] ✓ Daily result saved (ID: ${dailyResultId})`);
      } else {
        log(`[CLIENT] ℹ Daily result already exists (ID: ${existingDaily.id})`);
      }

      // Monthly agent results already saved by n8n via fire-and-poll
      // Just save raw GBP data
      if (!monthlyResult.skipped && monthlyResult.success) {
        await GoogleDataStoreModel.insertRaw(monthlyResult.rawData);
        log(`[CLIENT] ✓ Monthly raw GBP data saved`);
        log(`[CLIENT] ✓ Agent results written by n8n (IDs: ${JSON.stringify(monthlyResult.agentResultIds)})`);
      }

      log(
        `[CLIENT] ✓ ${domain} processing completed successfully on attempt ${attempt}`,
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
          await AgentResultModel.insertRaw({
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
      log(`[CLIENT] ⚠ Attempt ${attempt} failed, will retry...`);
    }
  }

  // Should never reach here, but just in case
  return {
    success: false,
    error: `Failed after ${MAX_ATTEMPTS} attempts`,
    attempts: MAX_ATTEMPTS,
  };
}
