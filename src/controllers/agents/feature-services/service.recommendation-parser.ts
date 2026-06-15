/**
 * Recommendation Parser Service
 *
 * Parses and saves recommendations from Guardian and Governance agent outputs
 * to the agent_recommendations table for admin tracking.
 *
 * Failsafe: Will not throw errors that would break the calling process.
 * Logs warnings instead.
 */

import { AgentRecommendationModel } from "../../../models/AgentRecommendationModel";
import { log, logError } from "../feature-utils/agentLogger";

/**
 * Parse and save recommendations from Guardian and Governance agent outputs
 * to the agent_recommendations table for admin tracking
 * Failsafe: Will not throw errors, only logs warnings
 */
export async function saveRecommendationsFromAgents(
  guardianResultId: number,
  governanceResultId: number,
  guardianResults: any[],
  governanceResults: any[],
): Promise<void> {
  const recommendations: any[] = [];

  log(`[GUARDIAN-GOV] Parsing recommendations for database storage...`);

  // ============================================================
  // Process Guardian recommendations
  // ============================================================
  try {
    for (const result of guardianResults) {
      const agentUnderTest = result.agent_under_test;

      if (!result.recommendations || !Array.isArray(result.recommendations)) {
        log(
          `  [WARNING] No recommendations array for guardian/${agentUnderTest}`,
        );
        continue;
      }

      for (const rec of result.recommendations) {
        // Guardian output structure: recommendations is array of objects,
        // each object has a nested 'recommendations' array
        const nestedRecs = Array.isArray(rec.recommendations)
          ? rec.recommendations
          : [];

        for (const item of nestedRecs) {
          // Skip if essential fields are missing
          if (!item.title) {
            log(`  [WARNING] Skipping guardian recommendation without title`);
            continue;
          }

          recommendations.push({
            agent_result_id: guardianResultId,
            source_agent_type: "guardian",
            agent_under_test: agentUnderTest,
            title: item.title,
            explanation: item.explanation || null,
            type: item.type || null,
            category: item.category || null,
            urgency: item.urgency || null,
            severity: item.severity || rec.severity || 1,
            verdict: rec.verdict || null,
            confidence: rec.confidence || null,
            status: null,
            evidence_links: JSON.stringify(item.evidence_links || []),
            rule_reference:
              item.rule_reference || rec.citations?.join("; ") || null,
            suggested_action: item.suggested_action || null,
            escalation_required: item.escalation_required || false,
            observed_at: rec.observed_at
              ? new Date(rec.observed_at)
              : new Date(),
            created_at: new Date(),
            updated_at: new Date(),
          });
        }
      }
    }

    log(
      `  [GUARDIAN-GOV] Parsed ${recommendations.length} Guardian recommendation(s)`,
    );
  } catch (error: any) {
    logError("Parse Guardian recommendations", error);
    log(`  [WARNING] Guardian parsing failed, continuing with Governance...`);
  }

  // ============================================================
  // Process Governance recommendations
  // ============================================================
  try {
    for (const result of governanceResults) {
      const agentUnderTest = result.agent_under_test;

      if (!result.recommendations || !Array.isArray(result.recommendations)) {
        log(
          `  [WARNING] No recommendations array for governance/${agentUnderTest}`,
        );
        continue;
      }

      for (const rec of result.recommendations) {
        // Governance output structure: similar to Guardian
        const nestedRecs = Array.isArray(rec.recommendations)
          ? rec.recommendations
          : [];

        for (const item of nestedRecs) {
          if (!item.title) {
            log(`  [WARNING] Skipping governance recommendation without title`);
            continue;
          }

          recommendations.push({
            agent_result_id: governanceResultId,
            source_agent_type: "governance_sentinel",
            agent_under_test: agentUnderTest,
            title: item.title,
            explanation: item.explanation || null,
            type: item.type || null,
            category: item.category || null,
            urgency: item.urgency || null,
            severity: item.severity || rec.severity || 1,
            verdict: rec.verdict || null,
            confidence: rec.confidence || null,
            status: null,
            evidence_links: JSON.stringify(item.evidence_links || []),
            rule_reference:
              item.rule_reference || rec.citations?.join("; ") || null,
            suggested_action: item.suggested_action || null,
            escalation_required: item.escalation_required || false,
            observed_at: rec.observed_at
              ? new Date(rec.observed_at)
              : new Date(),
            created_at: new Date(),
            updated_at: new Date(),
          });
        }
      }
    }

    log(
      `  [GUARDIAN-GOV] Parsed ${
        recommendations.length -
        guardianResults.reduce(
          (acc, r) =>
            acc +
            (r.recommendations?.reduce(
              (sum: number, rec: any) =>
                sum +
                (Array.isArray(rec.recommendations)
                  ? rec.recommendations.length
                  : 0),
              0,
            ) || 0),
          0,
        )
      } Governance recommendation(s)`,
    );
  } catch (error: any) {
    logError("Parse Governance recommendations", error);
    log(`  [WARNING] Governance parsing failed`);
  }

  // ============================================================
  // Bulk insert all recommendations
  // ============================================================
  if (recommendations.length > 0) {
    try {
      await AgentRecommendationModel.bulkInsertRaw(recommendations);
      log(
        `[GUARDIAN-GOV] \u2713 Saved ${recommendations.length} total recommendation(s) to database`,
      );
    } catch (error: any) {
      logError("saveRecommendationsFromAgents - Database Insert", error);
      // Don't fail the entire process if recommendation saving fails
      log(
        `[GUARDIAN-GOV] \u26a0 Failed to save recommendations, but agent run succeeded`,
      );
    }
  } else {
    log(`[GUARDIAN-GOV] No recommendations to save`);
  }
}
