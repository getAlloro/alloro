/**
 * Governance Validator Service
 *
 * Orchestrates Guardian and Governance agent runs.
 * Groups agent results by type, fetches historical recommendations,
 * runs agents sequentially for each group, and aggregates results.
 */

import { db } from "../../../database/connection";
import { log, logError, delay, isValidAgentOutput } from "../feature-utils/agentLogger";
import { formatDate, getCurrentMonthRange } from "../feature-utils/dateHelpers";
import {
  callAgentWebhook,
  GUARDIAN_AGENT_WEBHOOK,
  GOVERNANCE_AGENT_WEBHOOK,
} from "./service.webhook-orchestrator";
import { buildGuardianGovernancePayload } from "./service.agent-input-builder";
import { saveRecommendationsFromAgents } from "./service.recommendation-parser";

export interface GuardianGovernanceRunResult {
  success: boolean;
  skipped?: boolean;
  existingResultId?: number;
  message?: string;
  guardianResultId?: number;
  governanceResultId?: number;
  groupsProcessed?: number;
  successfulGroups?: number;
  failedGroups?: number;
  groupDetails?: any[];
  duration?: string;
  error?: string;
  processed?: number;
}

/**
 * Run Guardian and Governance agents for a given month range
 */
export async function runGuardianGovernanceAgents(
  monthParam?: string,
  _referenceDate?: string,
): Promise<GuardianGovernanceRunResult> {
  // Validate webhook configuration
  if (!GUARDIAN_AGENT_WEBHOOK || !GOVERNANCE_AGENT_WEBHOOK) {
    throw new Error(
      "GUARDIAN_AGENT_WEBHOOK or GOVERNANCE_AGENT_WEBHOOK not configured in environment",
    );
  }

  log(`Guardian webhook: ${GUARDIAN_AGENT_WEBHOOK}`);
  log(`Governance webhook: ${GOVERNANCE_AGENT_WEBHOOK}`);

  // Get month date range - use month param if provided, otherwise current month
  let monthRange: { startDate: string; endDate: string };

  if (monthParam) {
    // Parse YYYY-MM format
    const startDate = `${monthParam}-01`;
    const endOfMonth = new Date(
      new Date(monthParam + "-01").getFullYear(),
      new Date(monthParam + "-01").getMonth() + 1,
      0,
    );
    const endDate = formatDate(endOfMonth);
    monthRange = { startDate, endDate };
    log(`[GUARDIAN-GOV] Using specified month: ${monthParam}`);
  } else {
    monthRange = getCurrentMonthRange();
    log(`[GUARDIAN-GOV] Using current month`);
  }
  log(
    `\n[GUARDIAN-GOV] Date range: ${monthRange.startDate} to ${monthRange.endDate}`,
  );

  // Fetch all successful agent results from current month
  // Exclude guardian, governance_sentinel, and gbp_optimizer
  log("\n[GUARDIAN-GOV] Fetching agent results from current month...");
  const results = await db("agent_results")
    .whereBetween("created_at", [
      new Date(monthRange.startDate),
      new Date(monthRange.endDate + "T23:59:59"),
    ])
    .where("status", "success")
    .whereNotIn("agent_type", [
      "guardian",
      "governance_sentinel",
      "gbp_optimizer",
    ])
    .orderBy("agent_type")
    .orderBy("created_at")
    .select("*");

  if (!results || results.length === 0) {
    log("[GUARDIAN-GOV] No agent results found for current month");
    return {
      success: true,
      message: "No agent results to process",
      processed: 0,
      guardianResultId: undefined,
      governanceResultId: undefined,
    };
  }

  log(`[GUARDIAN-GOV] Found ${results.length} total results`);

  // Group results by agent_type
  log("[GUARDIAN-GOV] Grouping by agent_type...");
  const groupedResults: Record<string, any[]> = {};

  for (const result of results) {
    const agentType = result.agent_type;
    if (!groupedResults[agentType]) {
      groupedResults[agentType] = [];
    }

    // Parse agent_output if it's a string
    let parsedOutput = result.agent_output;
    if (typeof result.agent_output === "string") {
      try {
        parsedOutput = JSON.parse(result.agent_output);
      } catch (e) {
        log(
          `  [WARNING] Failed to parse agent_output for result ${result.id}`,
        );
      }
    }

    groupedResults[agentType].push(parsedOutput);
  }

  const agentTypes = Object.keys(groupedResults);
  log(
    `[GUARDIAN-GOV] \u2713 Created ${agentTypes.length} groups: ${agentTypes
      .map((t) => `${t}(${groupedResults[t].length})`)
      .join(", ")}`,
  );

  // Check for duplicates (system-level results have organization_id = NULL)
  const existingGuardian = await db("agent_results")
    .where({
      agent_type: "guardian",
      date_start: monthRange.startDate,
      date_end: monthRange.endDate,
    })
    .whereNull("organization_id")
    .whereIn("status", ["success", "pending"])
    .first();

  if (existingGuardian) {
    log(
      `[GUARDIAN-GOV] Guardian/Governance already run for this period (ID: ${existingGuardian.id})`,
    );
    return {
      success: true,
      message: "Guardian/Governance already run for this period",
      skipped: true,
      existingResultId: existingGuardian.id,
    };
  }

  // Initialize result collectors
  const guardianResults: any[] = [];
  const governanceResults: any[] = [];
  let successfulGroups = 0;
  let failedGroups = 0;

  // Process each agent_type group
  let groupIndex = 0;
  for (const agentType of agentTypes) {
    groupIndex++;
    const outputs = groupedResults[agentType];

    log(`\n[${"=".repeat(60)}]`);
    log(
      `[GUARDIAN-GOV] Processing group ${groupIndex}/${agentTypes.length}: ${agentType}`,
    );
    log(`[${"=".repeat(60)}]`);
    log(`[GUARDIAN-GOV] Results in group: ${outputs.length}`);

    // Fetch historical PASS and REJECT recommendations for context
    log(
      `[GUARDIAN-GOV] Fetching historical recommendations for ${agentType}...`,
    );

    const passedRecs = await db("agent_recommendations")
      .where("agent_under_test", agentType)
      .where("status", "PASS")
      .select(
        "id",
        "title",
        "explanation",
        "verdict",
        "confidence",
        "created_at",
      )
      .orderBy("created_at", "desc")
      .limit(50); // Limit to most recent 50

    const rejectedRecs = await db("agent_recommendations")
      .where("agent_under_test", agentType)
      .where("status", "REJECT")
      .select(
        "id",
        "title",
        "explanation",
        "verdict",
        "confidence",
        "created_at",
      )
      .orderBy("created_at", "desc")
      .limit(50);

    log(
      `[GUARDIAN-GOV] Found ${passedRecs.length} PASS, ${rejectedRecs.length} REJECT recommendations`,
    );

    // Build payload with historical context
    const payload = buildGuardianGovernancePayload(
      agentType,
      outputs,
      passedRecs,
      rejectedRecs,
    );

    // === STEP 1: Call Guardian Agent ===
    log(`[GUARDIAN-GOV]   \u2192 Calling Guardian agent`);
    let guardianSuccess = false;
    let guardianOutput: any = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) {
        log(
          `[GUARDIAN-GOV]   \ud83d\udd04 Guardian retry attempt ${attempt}/3 for ${agentType}`,
        );
        log(`[GUARDIAN-GOV]   Waiting 30 seconds before retry...`);
        await delay(30000);
      }

      try {
        guardianOutput = await callAgentWebhook(
          GUARDIAN_AGENT_WEBHOOK,
          payload,
          `Guardian (${agentType})`,
        );

        // Validate output
        if (isValidAgentOutput(guardianOutput, `Guardian-${agentType}`)) {
          log(`[GUARDIAN-GOV]   \u2713 Guardian completed successfully`);
          guardianSuccess = true;
          break;
        } else {
          throw new Error("Guardian returned empty or invalid output");
        }
      } catch (error: any) {
        log(
          `[GUARDIAN-GOV]   \u26a0 Guardian attempt ${attempt} failed: ${error.message}`,
        );
        if (attempt === 3) {
          log(
            `[GUARDIAN-GOV]   \u2717 Guardian failed after 3 attempts for ${agentType}`,
          );
        }
      }
    }

    // Collect Guardian result (success or failure)
    if (guardianSuccess && guardianOutput) {
      guardianResults.push({
        agent_under_test: agentType,
        recommendations: guardianOutput,
      });
    } else {
      guardianResults.push({
        agent_under_test: agentType,
        error: "Failed after 3 attempts",
      });
      failedGroups++;
    }

    // === STEP 2: Call Governance Sentinel Agent ===
    log(`[GUARDIAN-GOV]   \u2192 Calling Governance agent`);
    let governanceSuccess = false;
    let governanceOutput: any = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) {
        log(
          `[GUARDIAN-GOV]   \ud83d\udd04 Governance retry attempt ${attempt}/3 for ${agentType}`,
        );
        log(`[GUARDIAN-GOV]   Waiting 30 seconds before retry...`);
        await delay(30000);
      }

      try {
        governanceOutput = await callAgentWebhook(
          GOVERNANCE_AGENT_WEBHOOK,
          payload,
          `Governance (${agentType})`,
        );

        // Validate output
        if (
          isValidAgentOutput(governanceOutput, `Governance-${agentType}`)
        ) {
          log(`[GUARDIAN-GOV]   \u2713 Governance completed successfully`);
          governanceSuccess = true;
          break;
        } else {
          throw new Error("Governance returned empty or invalid output");
        }
      } catch (error: any) {
        log(
          `[GUARDIAN-GOV]   \u26a0 Governance attempt ${attempt} failed: ${error.message}`,
        );
        if (attempt === 3) {
          log(
            `[GUARDIAN-GOV]   \u2717 Governance failed after 3 attempts for ${agentType}`,
          );
        }
      }
    }

    // Collect Governance result (success or failure)
    if (governanceSuccess && governanceOutput) {
      governanceResults.push({
        agent_under_test: agentType,
        recommendations: governanceOutput,
      });
    } else {
      governanceResults.push({
        agent_under_test: agentType,
        error: "Failed after 3 attempts",
      });
      if (!guardianSuccess) {
        // Only increment if guardian also failed
        failedGroups++;
      }
    }

    // Track successful groups
    if (guardianSuccess && governanceSuccess) {
      successfulGroups++;
    }
  }

  // === STEP 3: Save aggregated results to database ===
  log(`\n[${"=".repeat(60)}]`);
  log("[GUARDIAN-GOV] ALL GROUPS PROCESSED - Saving to database");
  log(`[${"=".repeat(60)}]`);
  log(
    `[GUARDIAN-GOV] Guardian results collected: ${guardianResults.length} groups`,
  );
  log(
    `[GUARDIAN-GOV] Governance results collected: ${governanceResults.length} groups`,
  );

  // Save Guardian + Governance Sentinel results atomically (both system-level:
  // organization_id = null). These two agent_results rows are a single logical
  // unit \u2014 a failure after the guardian insert must not leave the governance
  // row missing, so they share one transaction.
  const { guardianId, governanceId } = await db.transaction(async (trx) => {
    const [guardianRecord] = await trx("agent_results")
      .insert({
        organization_id: null,
        location_id: null,
        agent_type: "guardian",
        date_start: monthRange.startDate,
        date_end: monthRange.endDate,
        agent_input: JSON.stringify({
          type: "SYSTEM",
          aggregated_from: agentTypes,
          total_results: results.length,
          date_range: `${monthRange.startDate} to ${monthRange.endDate}`,
        }),
        agent_output: JSON.stringify(guardianResults),
        status: "success",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("id");

    const [governanceRecord] = await trx("agent_results")
      .insert({
        organization_id: null,
        location_id: null,
        agent_type: "governance_sentinel",
        date_start: monthRange.startDate,
        date_end: monthRange.endDate,
        agent_input: JSON.stringify({
          type: "SYSTEM",
          aggregated_from: agentTypes,
          total_results: results.length,
          date_range: `${monthRange.startDate} to ${monthRange.endDate}`,
        }),
        agent_output: JSON.stringify(governanceResults),
        status: "success",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("id");

    return { guardianId: guardianRecord.id, governanceId: governanceRecord.id };
  });

  log(`[GUARDIAN-GOV] \u2713 Guardian result saved (ID: ${guardianId})`);
  log(`[GUARDIAN-GOV] \u2713 Governance result saved (ID: ${governanceId})`);

  // Parse and save recommendations to agent_recommendations table
  try {
    await saveRecommendationsFromAgents(
      guardianId,
      governanceId,
      guardianResults,
      governanceResults,
    );
  } catch (recError: any) {
    // Log but don't fail the entire process
    logError("Recommendation parsing", recError);
    log(
      `[GUARDIAN-GOV] \u26a0 Recommendation parsing failed but agent run succeeded`,
    );
  }

  return {
    success: true,
    guardianResultId: guardianId,
    governanceResultId: governanceId,
    groupsProcessed: agentTypes.length,
    successfulGroups,
    failedGroups,
    groupDetails: agentTypes.map((type) => ({
      agent_type: type,
      count: groupedResults[type].length,
      guardian_success: !guardianResults.find(
        (r) => r.agent_under_test === type && r.error,
      ),
      governance_success: !governanceResults.find(
        (r) => r.agent_under_test === type && r.error,
      ),
    })),
  };
}
