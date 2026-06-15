/**
 * GBP Optimizer Processor
 *
 * Copy Companion (GBP Optimizer) agent execution for a single client. Fetches
 * GBP text sources, transforms them into the Copy Companion payload, calls the
 * agent webhook, validates the output, and returns it in memory.
 *
 * Split out of service.agent-orchestrator.ts in the decomposition pass —
 * behavior identical. Re-exported from service.agent-orchestrator.ts to
 * preserve the existing import surface.
 */

import { log, logError, isValidAgentOutput, logAgentOutput } from "../feature-utils/agentLogger";
import {
  callAgentWebhook,
  COPY_COMPANION_WEBHOOK,
} from "./service.webhook-orchestrator";
import { buildCopyCompanionPayload } from "./service.agent-input-builder";

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
      log(`  [GBP-OPTIMIZER] ⚠ No GBP locations found`);
      return {
        success: false,
        error: "No GBP locations found for this account",
      };
    }

    log(`  [GBP-OPTIMIZER] ✓ Found ${gbpData.locations.length} location(s)`);

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
      log(`  [GBP-OPTIMIZER] ✗ Agent returned invalid output`);
      return {
        success: false,
        error: "Agent returned empty or invalid output",
      };
    }

    // Count recommendations
    const recommendations = agentOutput[0] || {};
    const recCount = Object.keys(recommendations).length;
    log(`  [GBP-OPTIMIZER] ✓ Received ${recCount} recommendation(s)`);

    log(`  [GBP-OPTIMIZER] ✓ Copy Companion completed successfully`);

    return {
      success: true,
      output: agentOutput,
      payload,
      rawData: gbpData,
    };
  } catch (error: any) {
    logError("processGBPOptimizerAgent", error);
    log(`  [GBP-OPTIMIZER] ✗ Failed: ${error?.message || String(error)}`);
    return { success: false, error: error?.message || String(error) };
  }
}
