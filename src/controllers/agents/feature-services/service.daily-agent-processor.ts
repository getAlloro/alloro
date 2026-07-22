/**
 * Daily Agent Processor
 *
 * Daily (Proofline) agent execution for a single client. Scopes GBP data to
 * the active location, fetches ONE trailing window + Rybbit analytics,
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
import {
  getDailyDates,
  getDailyTrailingWindow,
} from "../feature-utils/dateHelpers";
import {
  IMPRESSION_METRICS,
  INTERACTION_METRICS,
  selectRecentDaysWithData,
} from "../feature-utils/gbpWindowSelector";
import {
  buildGbpImpressionsDiagnostic,
  summarizeGbpImpressionsDiagnostic,
} from "../feature-utils/gbpImpressionsDiagnostic";
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
 * How many published days the daily run keeps: the most-recent and the one
 * before it, matching the two "sides" the Proofline payload and the stored row
 * have always carried. They are now the two most-recent PUBLISHED days, not
 * literal yesterday and the day before.
 */
const RESOLVED_DAYS_KEPT = 2;

/**
 * Process daily agent (Proofline) for a single client
 * Returns output in memory without saving to DB
 */
export async function processDailyAgent(
  account: any,
  oauth2Client: any,
  dates: ReturnType<typeof getDailyDates>,
  window: ReturnType<typeof getDailyTrailingWindow>,
  locationId?: number | null,
): Promise<{
  success: boolean;
  skipped?: boolean;
  output?: any;
  payload?: any;
  rawData?: any;
  /** The days Google actually published, for the executor's stored row (T3). */
  resolvedDates?: { start: string; end: string; hasRecentData: boolean };
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

    // A real location with NO mapped GBP property has nothing to proof: the
    // account-blob fallback above only fires for the org-level/primary run (no
    // locationId), so an empty propertyIds.gbp here means this location is
    // unmapped. Skip it — running the Claude agent and storing a zeros
    // google_data_store row would burn a call on an empty payload and fabricate
    // a Maps-less "measured" row. Signal a clean skip so the executor continues
    // the batch without counting it as a failure.
    if (locationId && (!propertyIds.gbp || propertyIds.gbp.length === 0)) {
      log(
        `  [DAILY] Location ${locationId} has no mapped GBP property — skipping (no GBP data to proof)`
      );
      return {
        success: false,
        skipped: true,
        error: "No mapped GBP property for location",
      };
    }

    // ONE trailing-window fetch replaces the two single-day fetches.
    //
    // The GBP Performance API trails several days, so asking for yesterday alone
    // returned an empty datedValues array, which the old code summed to 0 — that
    // is the zero-Maps bug. We ask for a window and then pick the most-recent day
    // Google actually published (never a fixed "skip N days" offset, which would
    // break silently the day the lag changes).
    log(
      `  [DAILY] Fetching trailing window ${window.startDate} → ${window.endDate}`,
    );
    const windowData = await fetchAllServiceData(
      oauth2Client,
      googleAccountId,
      domain,
      propertyIds,
      window.startDate,
      window.endDate,
    );

    // DIAGNOSTIC (logging only, no behavior change): the actual per-date values
    // the API returned across the window. See plans/07202026-zero-maps-fix.
    log(
      summarizeGbpImpressionsDiagnostic(
        buildGbpImpressionsDiagnostic(
          windowData,
          `window ${window.startDate}..${window.endDate}`,
        ),
      ),
    );

    // Resolve the two metric families INDEPENDENTLY. Google is not promised to
    // publish them for the same date, and treating an interactions-only date as
    // "covered" would report a fabricated zero for impressions on a real date —
    // the original bug with a verified-looking timestamp.
    const impressionDays = selectRecentDaysWithData(
      windowData,
      RESOLVED_DAYS_KEPT,
      IMPRESSION_METRICS,
    );
    const interactionDays = selectRecentDaysWithData(
      windowData,
      RESOLVED_DAYS_KEPT,
      INTERACTION_METRICS,
    );
    const resolvedDays = impressionDays;
    if (impressionDays[0] && interactionDays[0] && impressionDays[0].date !== interactionDays[0].date) {
      log(
        `  [DAILY] Note: impressions newest=${impressionDays[0].date}, interactions newest=${interactionDays[0].date} — families published on different days, resolved separately`,
      );
    }
    if (resolvedDays.length === 0) {
      // Honest, and load-bearing: nothing downstream may read this as a zero.
      log(
        `  [DAILY] ⚠ No GBP data published in ${window.startDate}..${window.endDate} — reporting "no recent data", not 0`,
      );
    } else {
      log(
        `  [DAILY] Most-recent published day: ${resolvedDays[0].date}` +
          (resolvedDays[1] ? ` (previous: ${resolvedDays[1].date})` : ""),
      );
    }

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
      window,
      impressionDays,
      interactionDays,
      reviewsSince: dates.dayBeforeYesterday,
      windowData,
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
      // The dates now describe the days Google ACTUALLY published, not calendar
      // yesterday. When the window carried nothing they fall back to the window
      // itself, and every visibility object is omitted, so a reader sees "no
      // data for this row" rather than a measured zero (spec T3).
      date_start: (resolvedDays[resolvedDays.length - 1]?.date ?? window.startDate),
      date_end: resolvedDays[0]?.date ?? window.endDate,
      run_type: "daily",
      gbp_data: flattenDailyGbpData(
        impressionDays,
        interactionDays,
        windowData,
        dates.dayBeforeYesterday,
      ),
      created_at: new Date(),
      updated_at: new Date(),
    };

    log(`  [DAILY] ✓ Proofline completed successfully`);
    return {
      success: true,
      output: agentOutput,
      payload,
      rawData,
      resolvedDates: {
        start: rawData.date_start,
        end: rawData.date_end,
        hasRecentData: resolvedDays.length > 0,
      },
    };
  } catch (error: any) {
    logError("processDailyAgent", error);
    return { success: false, error: error?.message || String(error) };
  }
}
