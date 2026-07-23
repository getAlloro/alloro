/**
 * Proofline Executor
 *
 * Standalone proofline agent execution — decoupled from HTTP context.
 * Used by both the HTTP handler (AgentsController) and the scheduler worker.
 */

import { db } from "../../../database/connection";
import { getValidOAuth2Client } from "../../../auth/oauth2Helper";
import { LocationModel } from "../../../models/LocationModel";
import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import { GoogleDataStoreModel } from "../../../models/GoogleDataStoreModel";
import { AgentResultModel } from "../../../models/AgentResultModel";
import { resolveLocationId } from "../../../utils/locationResolver";
import { log, logError } from "../feature-utils/agentLogger";
import {
  getDailyDates,
  getDailyTrailingWindow,
} from "../feature-utils/dateHelpers";
import { processDailyAgent } from "./service.agent-orchestrator";

export interface ProoflineResult {
  success: boolean;
  summary: {
    totalAccounts: number;
    totalLocations: number;
    successful: number;
    skipped: number;
    failed: number;
    durationMs: number;
  };
  results: Array<{
    googleAccountId: number;
    domain: string;
    locationId?: number;
    locationName?: string;
    success: boolean;
    skipped?: boolean;
    error?: string;
  }>;
}

export async function executeProoflineAgent(referenceDate?: string): Promise<ProoflineResult> {
  const startTime = Date.now();

  log("\n" + "=".repeat(70));
  log("PROOFLINE AGENT EXECUTION - STARTING");
  log("=".repeat(70));
  if (referenceDate) log(`Reference Date: ${referenceDate}`);
  log(`Timestamp: ${new Date().toISOString()}`);

  // Fetch all onboarded Google accounts
  log("\n[SETUP] Fetching all onboarded Google accounts...");
  const accounts = await GoogleConnectionModel.findOnboardedActiveConnectionsWithOrganization();

  if (!accounts || accounts.length === 0) {
    log("[SETUP] No onboarded accounts found");
    return {
      success: true,
      summary: { totalAccounts: 0, totalLocations: 0, successful: 0, skipped: 0, failed: 0, durationMs: Date.now() - startTime },
      results: [],
    };
  }

  log(`[SETUP] Found ${accounts.length} account(s) to process`);

  const results: ProoflineResult["results"] = [];
  let totalLocationsProcessed = 0;

  for (const account of accounts) {
    const { id: googleAccountId, domain_name: domain } = account;

    log(`\n[${"=".repeat(60)}]`);
    log(`[CLIENT] Processing Proofline: ${domain} (ID: ${googleAccountId})`);
    log(`[${"=".repeat(60)}]`);

    try {
      // Cancelled locations are unpaid — recurring agents skip them. Paid
      // pending_cancellation locations keep running until their period ends.
      const locations = await LocationModel.findNonCancelledByOrganizationId(
        account.organization_id
      );

      if (locations.length === 0) {
        const fallbackLocationId = await resolveLocationId(account.organization_id);
        if (fallbackLocationId) {
          log(`[CLIENT] No location rows found, using resolved primary: ${fallbackLocationId}`);
          locations.push({ id: fallbackLocationId, name: domain } as any);
        } else {
          log(`[CLIENT] No locations found for org ${account.organization_id}, skipping`);
          results.push({ googleAccountId, domain, success: false, error: "No locations found" });
          continue;
        }
      }

      log(`[CLIENT] Found ${locations.length} location(s) for org ${account.organization_id}`);

      log(`[CLIENT] Getting valid OAuth2 client`);
      const oauth2Client = await getValidOAuth2Client(googleAccountId);

      const dailyDates = getDailyDates(referenceDate);
      // GBP reads a trailing window (the Performance API trails several days);
      // Rybbit is not lagged and still uses the literal calendar days.
      const gbpWindow = getDailyTrailingWindow(referenceDate);

      for (const location of locations) {
        const locationId = location.id;
        const locationName = (location as any).name || `Location ${locationId}`;

        log(`  [LOCATION] Running Proofline for "${locationName}" (location_id: ${locationId})`);

        try {
          const dailyResult = await processDailyAgent(account, oauth2Client, dailyDates, gbpWindow, locationId);

          // Location has no mapped GBP property — cleanly skipped upstream (no
          // agent call, no zeros row). Record it as skipped, not failed.
          if (dailyResult.skipped) {
            log(`  [LOCATION] ⊘ Proofline skipped for "${locationName}": ${dailyResult.error}`);
            results.push({ googleAccountId, domain, locationId, locationName, success: false, skipped: true, error: dailyResult.error });
            continue;
          }

          if (!dailyResult.success) {
            log(`  [LOCATION] \u2717 Proofline failed for "${locationName}": ${dailyResult.error}`);
            results.push({ googleAccountId, domain, locationId, locationName, success: false, error: dailyResult.error || "Proofline agent failed" });
            continue;
          }

          // Atomic: the raw GBP data and its agent_results row must land
          // together. The external agent call (processDailyAgent) already ran
          // above, so the transaction wraps only these two local writes.
          const result = await db.transaction(async (trx) => {
            await GoogleDataStoreModel.insertRaw(dailyResult.rawData, trx);

            const insertedId = await AgentResultModel.insertReturningId(
              {
                organization_id: account.organization_id,
                location_id: locationId,
                agent_type: "proofline",
                // The days Google ACTUALLY published, resolved inside the
                // processor — not calendar yesterday, which the API had usually
                // not published yet (spec T3, Revision Log Rev 1).
                date_start: dailyResult.resolvedDates?.start ?? gbpWindow.startDate,
                date_end: dailyResult.resolvedDates?.end ?? gbpWindow.endDate,
                agent_input: JSON.stringify(dailyResult.payload),
                agent_output: JSON.stringify(dailyResult.output),
                status: "success",
                created_at: new Date(),
                updated_at: new Date(),
              },
              trx
            );
            return insertedId;
          });

          log(`  [LOCATION] \u2713 Proofline result saved for "${locationName}" (ID: ${result})`);
          totalLocationsProcessed++;

          results.push({ googleAccountId, domain, locationId, locationName, success: true });
        } catch (locError: any) {
          logError(`Proofline for ${domain} / ${locationName}`, locError);
          results.push({ googleAccountId, domain, locationId, locationName, success: false, error: locError?.message || String(locError) });
        }
      }

      log(`[CLIENT] \u2713 ${domain} completed (${locations.length} location(s))`);
    } catch (error: any) {
      logError(`Proofline for ${domain}`, error);
      results.push({ googleAccountId, domain, success: false, error: error?.message || String(error) });
    }
  }

  const duration = Date.now() - startTime;
  const successfulResults = results.filter((r) => r.success).length;
  const skippedResults = results.filter((r) => r.skipped).length;

  log("\n" + "=".repeat(70));
  log(`[COMPLETE] \u2713 Proofline run completed`);
  log(`  - Total clients: ${accounts.length}`);
  log(`  - Total locations processed: ${totalLocationsProcessed}`);
  log(`  - Successful: ${successfulResults}`);
  log(`  - Skipped (no mapped GBP): ${skippedResults}`);
  log(`  - Failed: ${results.length - successfulResults - skippedResults}`);
  log(`  - Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
  log("=".repeat(70) + "\n");

  return {
    success: true,
    summary: {
      totalAccounts: accounts.length,
      totalLocations: totalLocationsProcessed,
      successful: successfulResults,
      skipped: skippedResults,
      failed: results.length - successfulResults - skippedResults,
      durationMs: duration,
    },
    results,
  };
}
