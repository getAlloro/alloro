/**
 * Task Creator Service
 *
 * Creates tasks from agent outputs. Each agent type has its own
 * output structure and task creation logic.
 *
 * Agent types handled:
 * - Summary v2: USER tasks from top_actions[] (Plan 1 — sole writer of practice-facing tasks)
 * - Referral Engine: ALLORO tasks ONLY from alloro_automation_opportunities (USER branch removed in Plan 1; practice_action_plan items now feed Summary as input)
 * - Copy Companion: USER tasks from recommendations with verdict filtering
 * - Opportunity / CRO Optimizer: DISABLED in orchestrator (preserved here for revival path)
 */

import { db } from "../../../database/connection";
import { log, logError } from "../feature-utils/agentLogger";
import type {
  OpportunityAgentOutput,
  CroOptimizerAgentOutput,
  ReferralEngineAgentOutput,
  SummaryV2Output,
  TopAction,
} from "../types/agent-output-schemas";

// =====================================================================
// SHARED: NORMALIZE n8n OUTPUT
// =====================================================================

/**
 * n8n can return agent outputs in multiple shapes:
 *   1. {opportunities: [...]}              — plain object
 *   2. [{opportunities: [...]}]            — single-wrapped array
 *   3. [[{opportunities: [...]}]]          — double-wrapped array
 *   4. {"0": {opportunities: [...]}}       — numeric-keyed object (array→object serialization)
 *   5. {"0": [{opportunities: [...]}]}     — numeric-keyed wrapping an array
 *
 * This function normalizes all shapes to the inner payload object.
 */
function normalizeAgentOutput(raw: any): any {
  let val = raw;

  // Handle numeric-keyed objects: {"0": ...} → take first value
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const keys = Object.keys(val);
    if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
      log(`  [NORMALIZE] Detected numeric-keyed object (keys: ${keys.join(",")}), extracting values`);
      val = Object.values(val);
    }
  }

  // Unwrap nested arrays: [[x]] → [x] → x
  while (Array.isArray(val) && val.length === 1 && Array.isArray(val[0])) {
    val = val[0];
  }

  // Final: if still an array, take first element
  return Array.isArray(val) ? val[0] : val;
}

// =====================================================================
// OPPORTUNITY TASKS
// =====================================================================

export async function createTasksFromOpportunityOutput(
  opportunityOutput: OpportunityAgentOutput,
  googleAccountId: number,
  organizationId?: number | null,
  locationId?: number | null,
): Promise<void> {
  try {
    const first = normalizeAgentOutput(opportunityOutput);
    const actionItems = first?.opportunities || [];

    log(`  [MONTHLY] Opportunity output shape: ${Array.isArray(opportunityOutput) ? `array(${opportunityOutput.length})` : typeof opportunityOutput}, actionItems: ${actionItems.length}`);

    if (Array.isArray(actionItems) && actionItems.length > 0) {
      log(
        `  [MONTHLY] Creating ${actionItems.length} task(s) from action items`,
      );

      for (const item of actionItems) {
        const type =
          item.type?.toUpperCase() === "ALLORO" ? "ALLORO" : "USER";

        const taskData = {
          organization_id: organizationId ?? null,
          location_id: locationId ?? null,
          title: item.title || "Untitled Task",
          description: item.explanation || null,
          category: type,
          agent_type: "OPPORTUNITY",
          status: "pending",
          is_approved: false,
          created_by_admin: true,
          due_date: item.due_date ? new Date(item.due_date) : null,
          metadata: JSON.stringify({
            agent_category: item.category || null,
            urgency: item.urgency || null,
            ...(item.metadata || {}),
          }),
          created_at: new Date(),
          updated_at: new Date(),
        };

        try {
          const [result] = await db("tasks").insert(taskData).returning("id");
          const taskId = result.id;
          log(
            `    \u2713 Created ${type} task (ID: ${taskId}): ${taskData.title}`,
          );
        } catch (taskError: any) {
          log(
            `    \u26a0 Failed to create task "${taskData.title}": ${taskError.message}`,
          );
        }
      }

      log(`  [MONTHLY] \u2713 Task creation completed`);
    } else {
      log(`  [MONTHLY] No action items found in opportunity output`);
    }
  } catch (taskCreationError: any) {
    // Don't fail the entire operation if task creation fails
    log(
      `  [MONTHLY] \u26a0 Error creating Opportunity tasks: ${taskCreationError.message}`,
    );
  }
}

// =====================================================================
// CRO OPTIMIZER TASKS
// =====================================================================

export async function createTasksFromCroOptimizerOutput(
  croOptimizerOutput: CroOptimizerAgentOutput,
  googleAccountId: number,
  organizationId?: number | null,
  locationId?: number | null,
): Promise<void> {
  try {
    const first = normalizeAgentOutput(croOptimizerOutput);
    const croActionItems = first?.opportunities || [];

    log(`  [MONTHLY] CRO Optimizer output shape: ${Array.isArray(croOptimizerOutput) ? `array(${croOptimizerOutput.length})` : typeof croOptimizerOutput}, actionItems: ${croActionItems.length}`);

    if (Array.isArray(croActionItems) && croActionItems.length > 0) {
      log(
        `  [MONTHLY] Creating ${croActionItems.length} CRO Optimizer task(s) from action items`,
      );

      for (const item of croActionItems) {
        const type = item.type?.toUpperCase() === "USER" ? "USER" : "ALLORO";

        const taskData = {
          organization_id: organizationId ?? null,
          location_id: locationId ?? null,
          title: item.title || "Untitled Task",
          description: item.explanation || null,
          category: type,
          agent_type: "CRO_OPTIMIZER",
          status: "pending",
          is_approved: false,
          created_by_admin: true,
          due_date: item.due_date ? new Date(item.due_date) : null,
          metadata: JSON.stringify({
            agent_category: item.category || null,
            urgency: item.urgency || null,
            ...(item.metadata || {}),
          }),
          created_at: new Date(),
          updated_at: new Date(),
        };

        try {
          const [result] = await db("tasks").insert(taskData).returning("id");
          const taskId = result.id;
          log(
            `    \u2713 Created ${type} task (ID: ${taskId}): ${taskData.title}`,
          );
        } catch (taskError: any) {
          log(
            `    \u26a0 Failed to create task "${taskData.title}": ${taskError.message}`,
          );
        }
      }

      log(`  [MONTHLY] \u2713 CRO Optimizer task creation completed`);
    } else {
      log(`  [MONTHLY] No CRO Optimizer action items found in output`);
    }
  } catch (taskCreationError: any) {
    // Don't fail the entire operation if task creation fails
    log(
      `  [MONTHLY] \u26a0 Error creating CRO Optimizer tasks: ${taskCreationError.message}`,
    );
  }
}

// =====================================================================
// REFERRAL ENGINE TASKS
// =====================================================================

export async function createTasksFromReferralEngineOutput(
  referralEngineOutput: ReferralEngineAgentOutput | ReferralEngineAgentOutput[],
  googleAccountId: number,
  organizationId?: number | null,
  locationId?: number | null,
): Promise<void> {
  try {
    const referralOutput = normalizeAgentOutput(referralEngineOutput);

    // ALLORO tasks from alloro_automation_opportunities (internal/agency tasks)
    const alloroItems = referralOutput?.alloro_automation_opportunities || [];

    // NOTE: Plan 1 removed the USER task creation branch from RE.
    // `practice_action_plan` items now feed Summary v2 as INPUT (in additional_data.referral_engine_output).
    // Summary picks the highest-priority action across all domains and writes USER tasks via createTasksFromSummaryV2Output.
    // RE writes ALLORO (agency-internal) only.

    log(`  [MONTHLY] Referral Engine output shape: ${Array.isArray(referralEngineOutput) ? `array(${(referralEngineOutput as any).length})` : typeof referralEngineOutput}, alloroItems: ${alloroItems.length}`);

    if (alloroItems.length > 0) {
      log(
        `  [MONTHLY] Creating ${alloroItems.length} Referral Engine ALLORO task(s) from alloro_automation_opportunities`,
      );

      for (const item of alloroItems) {
        const taskData = {
          organization_id: organizationId ?? null,
          location_id: locationId ?? null,
          title: item.title || "Untitled Referral Engine Task",
          description: item.description || null,
          category: "ALLORO",
          agent_type: "REFERRAL_ENGINE_ANALYSIS",
          status: "pending",
          is_approved: false,
          created_by_admin: true,
          due_date: item.due_date ? new Date(item.due_date) : null,
          metadata: JSON.stringify({
            source_field: "alloro_automation_opportunities",
            priority: item.priority || null,
            impact: item.impact || null,
            effort: item.effort || null,
            category: item.category || null,
          }),
          created_at: new Date(),
          updated_at: new Date(),
        };

        try {
          const [result] = await db("tasks").insert(taskData).returning("id");
          const taskId = result.id;
          log(`    \u2713 Created ALLORO task (ID: ${taskId}): ${taskData.title}`);
        } catch (taskError: any) {
          log(
            `    \u26a0 Failed to create ALLORO task "${taskData.title}": ${taskError.message}`,
          );
        }
      }

      log(`  [MONTHLY] \u2713 Referral Engine task creation completed`);
    } else {
      log(`  [MONTHLY] No Referral Engine ALLORO automation opportunities found`);
    }
  } catch (taskCreationError: any) {
    // Don't fail the entire operation if task creation fails
    log(
      `  [MONTHLY] \u26a0 Error creating Referral Engine tasks: ${taskCreationError.message}`,
    );
  }
}

// =====================================================================
// SUMMARY V2 TASKS (Plan 1)
// =====================================================================

/**
 * Creates USER tasks from Summary v2's `top_actions[]` array.
 *
 * Each top_action becomes one row in the tasks table with the entire
 * TopAction object stored in `metadata` (jsonb) so the dashboard can render
 * the full hero/queue payload (rationale, highlights, supporting_metrics,
 * outcome, cta, priority_score) without a separate fetch.
 *
 * is_approved is true by default — Summary v2 is the curated monthly
 * priority surface for the practice and renders immediately in the
 * dashboard. (Earlier agents wrote with is_approved=false; that flow
 * required admin approval. Summary v2 is engineered for direct render.)
 */
export async function createTasksFromSummaryV2Output(
  summaryOutput: SummaryV2Output,
  googleAccountId: number,
  organizationId?: number | null,
  locationId?: number | null,
): Promise<void> {
  try {
    const topActions: TopAction[] = summaryOutput?.top_actions || [];

    log(
      `  [MONTHLY] Summary v2 output: ${topActions.length} top_actions`,
    );

    if (topActions.length === 0) {
      log(`  [MONTHLY] ⚠ Summary v2 produced no top_actions`);
      return;
    }

    // Persist only the single highest-priority action — the "one thing that
    // matters". The agent now emits one, but slice defensively in case an
    // older/looser output carries more. plans/06092026-practice-hub-simplification.
    const sorted = [...topActions]
      .sort((a, b) => b.priority_score - a.priority_score)
      .slice(0, 1);

    log(
      `  [MONTHLY] Creating ${sorted.length} SUMMARY USER task (top of ${topActions.length}) from top_actions`,
    );

    for (let i = 0; i < sorted.length; i++) {
      const action = sorted[i];
      const isHero = i === 0;
      const metadataObj = isHero && summaryOutput.domain_summaries
        ? { ...action, domain_summaries: summaryOutput.domain_summaries }
        : action;
      const taskData = {
        organization_id: organizationId ?? null,
        location_id: locationId ?? null,
        title: action.title,
        description: action.rationale,
        category: "USER",
        agent_type: "SUMMARY",
        status: "pending",
        is_approved: true,
        created_by_admin: true,
        due_date: action.due_at ? new Date(action.due_at) : null,
        metadata: JSON.stringify(metadataObj),
        created_at: new Date(),
        updated_at: new Date(),
      };

      try {
        const [result] = await db("tasks").insert(taskData).returning("id");
        const taskId = result.id;
        log(
          `    ✓ Created SUMMARY USER task (ID: ${taskId}, priority=${action.priority_score.toFixed(2)}, domain=${action.domain}): ${action.title}`,
        );
      } catch (taskError: any) {
        log(
          `    ⚠ Failed to create SUMMARY task "${action.title}": ${taskError.message}`,
        );
      }
    }

    log(`  [MONTHLY] ✓ Summary v2 task creation completed`);
  } catch (taskCreationError: any) {
    log(
      `  [MONTHLY] ⚠ Error creating Summary v2 tasks: ${taskCreationError.message}`,
    );
    void googleAccountId;
  }
}

// =====================================================================
// COPY COMPANION (GBP OPTIMIZER) TASKS
// =====================================================================

export async function createTasksFromCopyRecommendations(
  agentOutput: any,
  googleAccountId: number,
  organizationId?: number | null,
  locationId?: number | null,
): Promise<void> {
  log(`\n  [GBP-OPTIMIZER] Creating tasks from recommendations...`);

  try {
    // Copy Companion returns an array directly, not nested in [0]
    const recommendations = Array.isArray(agentOutput) ? agentOutput : [];

    if (recommendations.length === 0) {
      log(`  [GBP-OPTIMIZER] No recommendations found in output`);
      return;
    }

    log(
      `  [GBP-OPTIMIZER] Found ${recommendations.length} total recommendation(s)`,
    );

    let createdCount = 0;
    let skippedCount = 0;
    let taskIndex = 0;

    for (const item of recommendations) {
      const verdict = item.verdict || "UNKNOWN";
      const lineage = item.lineage || "unknown";
      const confidence = item.confidence || 0;

      log(
        `    [${lineage}] Verdict: ${verdict}, Confidence: ${(
          confidence * 100
        ).toFixed(0)}%`,
      );

      // Only create tasks for recommendations that need action
      if (!["CONFIRMED", "PENDING_REVIEW"].includes(verdict)) {
        log(`      \u2192 Skipping (verdict: ${verdict})`);
        skippedCount++;
        continue;
      }

      taskIndex++;

      const taskData = {
        organization_id: organizationId ?? null,
        location_id: locationId ?? null,
        title: `Update GBP Post ${taskIndex}`,
        description: `
**Current Text:**
${item.source_text || "N/A"}

**Recommended Text:**
${item.recommendation || "N/A"}

**Confidence:** ${(confidence * 100).toFixed(0)}%

**Notes:**
${item.notes || "No additional notes"}

${
  item.alerts && item.alerts.length > 0
    ? `**Alerts:**\n${item.alerts.join("\n")}`
    : ""
}
        `.trim(),
        category: "USER",
        agent_type: "GBP_OPTIMIZATION",
        status: "pending",
        is_approved: false,
        created_by_admin: true,
        due_date: null,
        metadata: JSON.stringify({
          agent_slug: item.agent_slug,
          agent_name: item.agent_name,
          lineage: lineage,
          confidence: confidence,
          verdict: verdict,
          citations: item.citations || [],
          freshness: item.freshness,
          source_text: item.source_text,
          recommendation: item.recommendation,
        }),
        created_at: new Date(),
        updated_at: new Date(),
      };

      try {
        const [result] = await db("tasks").insert(taskData).returning("id");
        const taskId = result.id;
        log(`      \u2713 Created task (ID: ${taskId}): ${taskData.title}`);
        createdCount++;
      } catch (taskError: any) {
        log(`      \u2717 Failed to create task: ${taskError.message}`);
      }
    }

    log(`  [GBP-OPTIMIZER] \u2713 Task creation completed`);
    log(`    - Created: ${createdCount}`);
    log(`    - Skipped: ${skippedCount}`);
    log(`    - Total: ${recommendations.length}`);
  } catch (error: any) {
    logError("createTasksFromCopyRecommendations", error);
    log(`  [GBP-OPTIMIZER] \u26a0 Error creating tasks: ${error.message}`);
  }
}

// =====================================================================
// TEST MODE SIMULATOR
// =====================================================================

/**
 * Helper function to simulate task creation without persisting to database
 */
export function simulateTaskCreation(agentOutputs: {
  opportunityOutput: OpportunityAgentOutput;
  croOptimizerOutput: CroOptimizerAgentOutput;
  referralEngineOutput: ReferralEngineAgentOutput | ReferralEngineAgentOutput[];
}): {
  from_opportunity: any[];
  from_cro_optimizer: any[];
  from_referral_engine: { alloro: any[]; user: any[] };
  summary: { total_tasks: number; user_tasks: number; alloro_tasks: number };
} {
  const result = {
    from_opportunity: [] as any[],
    from_cro_optimizer: [] as any[],
    from_referral_engine: { alloro: [] as any[], user: [] as any[] },
    summary: { total_tasks: 0, user_tasks: 0, alloro_tasks: 0 },
  };

  try {
    // Simulate Opportunity tasks
    const oppFirst = normalizeAgentOutput(agentOutputs.opportunityOutput);
    const opportunityItems = oppFirst?.opportunities || [];
    if (Array.isArray(opportunityItems)) {
      for (const item of opportunityItems) {
        const type = item.type?.toUpperCase() === "ALLORO" ? "ALLORO" : "USER";
        result.from_opportunity.push({
          title: item.title || "Untitled Task",
          description: item.explanation || null,
          category: type,
          agent_type: "OPPORTUNITY",
          urgency: item.urgency || null,
          due_date: item.due_date || null,
          metadata: item.metadata || {},
        });
        result.summary[type === "USER" ? "user_tasks" : "alloro_tasks"]++;
      }
    }
  } catch (e) {
    log(`[TEST-TASKS] \u26a0 Error simulating Opportunity tasks: ${e}`);
  }

  try {
    // Simulate CRO Optimizer tasks
    const croFirst = normalizeAgentOutput(agentOutputs.croOptimizerOutput);
    const croItems = croFirst?.opportunities || [];
    if (Array.isArray(croItems)) {
      for (const item of croItems) {
        const type = item.type?.toUpperCase() === "USER" ? "USER" : "ALLORO";
        result.from_cro_optimizer.push({
          title: item.title || "Untitled Task",
          description: item.explanation || null,
          category: type,
          agent_type: "CRO_OPTIMIZER",
          urgency: item.urgency || null,
          due_date: item.due_date || null,
          metadata: item.metadata || {},
        });
        result.summary[type === "USER" ? "user_tasks" : "alloro_tasks"]++;
      }
    }
  } catch (e) {
    log(`[TEST-TASKS] \u26a0 Error simulating CRO Optimizer tasks: ${e}`);
  }

  try {
    // Simulate Referral Engine tasks
    const referralOutput = normalizeAgentOutput(agentOutputs.referralEngineOutput);

    const alloroItems = referralOutput?.alloro_automation_opportunities || [];
    const userItems = referralOutput?.practice_action_plan || [];

    // Process ALLORO tasks
    for (const item of alloroItems) {
      result.from_referral_engine.alloro.push({
        title: item.title || "Opportunity",
        description: item.description || null,
        category: "ALLORO",
        agent_type: "REFERRAL_ENGINE_ANALYSIS",
      });
      result.summary.alloro_tasks++;
    }

    // Process USER tasks
    for (const item of userItems) {
      result.from_referral_engine.user.push({
        title: item.title || "Action Item",
        description: item.description || null,
        category: "USER",
        agent_type: "REFERRAL_ENGINE_ANALYSIS",
      });
      result.summary.user_tasks++;
    }
  } catch (e) {
    log(`[TEST-TASKS] \u26a0 Error simulating Referral Engine tasks: ${e}`);
  }

  result.summary.total_tasks =
    result.summary.user_tasks + result.summary.alloro_tasks;

  return result;
}
