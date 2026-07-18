/**
 * Daily Agent Processor
 *
 * Daily (Proofline) agent execution for a single client. Scopes GBP data to
 * the active location, fetches two single-day windows + Rybbit analytics,
 * builds the Proofline payload, runs the agent via Claude directly, validates,
 * and returns the output + flattened raw data in memory (no DB writes here —
 * persistence is owned by the Proofline executor).
 *
 * Split out of service.agent-orchestrator.ts in the decomposition pass —
 * behavior identical. Re-exported from service.agent-orchestrator.ts to
 * preserve the existing import surface.
 */

import {
  fetchAllServiceData,
  GooglePropertyIds,
} from "../../../utils/dataAggregation/dataAggregator";
import { log, logError, isValidAgentOutput, logAgentOutput } from "../feature-utils/agentLogger";
import { getDailyDates } from "../feature-utils/dateHelpers";
import { loadPrompt } from "../../../agents/service.prompt-loader";
import { substitutePromptPlaceholders } from "../../../agents/service.prompt-substituter";
import { resolveOrgType } from "../../../config/orgLabels";
import { runAgent } from "../../../agents/service.llm-runner";
import {
  buildProoflinePayload,
  flattenDailyGbpData,
} from "./service.agent-input-builder";
import { GooglePropertyModel } from "../../../models/GooglePropertyModel";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { fetchRybbitDailyComparison } from "../../../utils/rybbit/service.rybbit-data";

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
    // Fallback: only the org-level/primary run (no locationId) uses the account
    // blob. A real location with NO mapped GBP property must NOT fall back to the
    // account's first listing — that fabricates Maps data for a location with no
    // listing (the C1 double-count). It stays unmapped, so its stored row carries
    // no GBP data rather than a copy of locations[0].
    if ((!propertyIds.gbp || propertyIds.gbp.length === 0) && !locationId) {
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
    const orgType = resolveOrgType(
      (await OrganizationModel.findById(organizationId))?.organization_type
    );
    const systemPrompt = substitutePromptPlaceholders(
      loadPrompt("dailyAgents/Proofline"),
      orgType
    );
    const userMessage = JSON.stringify(payload, null, 2);

    const result = await runAgent({
      systemPrompt,
      userMessage,
      maxTokens: 4096,
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

    log(`  [DAILY] ✓ Proofline completed successfully`);
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
