/**
 * Proofline Executor
 *
 * Standalone proofline agent execution — decoupled from HTTP context.
 * Used by both the HTTP handler (AgentsController) and the scheduler worker.
 */

import { db } from "../../../database/connection";
import { getValidOAuth2Client } from "../../../auth/oauth2Helper";
import { LocationModel } from "../../../models/LocationModel";
import { resolveLocationId } from "../../../utils/locationResolver";
import { log, logError } from "../feature-utils/agentLogger";
import { getDailyDates } from "../feature-utils/dateHelpers";
import { processDailyAgent } from "./service.agent-orchestrator";

export interface ProoflineResult {
  success: boolean;
  summary: {
    totalAccounts: number;
    totalLocations: number;
    successful: number;
    failed: number;
    durationMs: number;
  };
  results: Array<{
    googleAccountId: number;
    domain: string;
    locationId?: number;
    locationName?: string;
    success: boolean;
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
  const accounts = await db("google_connections as gc")
    .join("organizations as o", "gc.organization_id", "o.id")
    .where("o.onboarding_completed", true)
    .whereNull("o.archived_at")
    .select("gc.*", "o.domain as domain_name", "o.name as practice_name");

  if (!accounts || accounts.length === 0) {
    log("[SETUP] No onboarded accounts found");
    return {
      success: true,
      summary: { totalAccounts: 0, totalLocations: 0, successful: 0, failed: 0, durationMs: Date.now() - startTime },
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
      const locations = await LocationModel.findByOrganizationId(account.organization_id);

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

      for (const location of locations) {
        const locationId = location.id;
        const locationName = (location as any).name || `Location ${locationId}`;

        log(`  [LOCATION] Running Proofline for "${locationName}" (location_id: ${locationId})`);

        try {
          const dailyResult = await processDailyAgent(account, oauth2Client, dailyDates, locationId);

          if (!dailyResult.success) {
            log(`  [LOCATION] \u2717 Proofline failed for "${locationName}": ${dailyResult.error}`);
            results.push({ googleAccountId, domain, locationId, locationName, success: false, error: dailyResult.error || "Proofline agent failed" });
            continue;
          }

          // Atomic: the raw GBP data and its agent_results row must land
          // together. The external agent call (processDailyAgent) already ran
          // above, so the transaction wraps only these two local writes.
          const result = await db.transaction(async (trx) => {
            await trx("google_data_store").insert(dailyResult.rawData);

            const [row] = await trx("agent_results")
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
            return row;
          });

          log(`  [LOCATION] \u2713 Proofline result saved for "${locationName}" (ID: ${result.id})`);
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

  log("\n" + "=".repeat(70));
  log(`[COMPLETE] \u2713 Proofline run completed`);
  log(`  - Total clients: ${accounts.length}`);
  log(`  - Total locations processed: ${totalLocationsProcessed}`);
  log(`  - Successful: ${successfulResults}`);
  log(`  - Failed: ${results.length - successfulResults}`);
  log(`  - Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
  log("=".repeat(70) + "\n");

  return {
    success: true,
    summary: {
      totalAccounts: accounts.length,
      totalLocations: totalLocationsProcessed,
      successful: successfulResults,
      failed: results.length - successfulResults,
      durationMs: duration,
    },
    results,
  };
}
