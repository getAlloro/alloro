/**
 * Ranking LLM Service
 *
 * Runs gap analysis via Claude (replaces the former n8n → Gemini webhook).
 * Takes the same payload shape the pipeline already builds, calls
 * service.llm-runner, then delegates persistence to the existing
 * webhook-handler helpers (archiveAndCreateTasks, saveLlmAnalysis).
 */

import { runAgent } from "../../../agents/service.llm-runner";
import * as llmWebhookHandler from "./service.llm-webhook-handler";
import { log, logError } from "../feature-utils/util.ranking-logger";
import { db } from "../../../database/connection";
import { updateStatus, StatusDetail } from "./service.ranking-pipeline";

// =====================================================================
// TYPES
// =====================================================================

export interface RankingLlmPayload {
  additional_data: {
    practice_ranking_id: number;
    batch_id: string;
    client: {
      domain: string;
      practice_name: string;
      specialty: string;
      location: string;
      gbp_location_id: string;
      gbp_account_id: string;
      rank_score: number;
      rank_position: number;
      total_competitors: number;
      factors: Record<string, any>;
      gbp_data: {
        business_name: string;
        total_reviews: number;
        average_rating: number;
        reviews_last_30d: number;
        primary_category: string;
      };
      website_audit: any | null;
    };
    competitors: any[];
    benchmarks: Record<string, any>;
    /**
     * Google Maps position snapshot context.
     * Spec: plans/04122026-no-ticket-practice-health-search-position-split/spec.md
     * Lets the LLM reference the sampled Maps estimate separately from the
     * proprietary 8-factor Practice Health score.
     */
    search_position?: {
      query: string;
      position: number | null;
      status: "ok" | "not_in_top_20" | "bias_unavailable" | "api_error";
      not_in_top_20: boolean;
      top_5: Array<{
        rank: number;
        name: string;
        review_count: number;
        rating: number;
        is_client: boolean;
      }>;
      selected_competitors?: Array<{
        selected_order: number;
        place_id: string;
        name: string;
        maps_position: number | null;
        maps_status: "measured" | "not_in_top_20" | "not_measured";
        rating: number | null;
        review_count: number | null;
        primary_type: string | null;
      }>;
      discovery_radius_meters?: number;
    };
  };
}

// =====================================================================
// PROMPT
// =====================================================================

const SYSTEM_PROMPT = `You are an expert SEO and local search analyst specializing in dental specialty practices. Analyze the practice's ranking performance against competitors and provide actionable insights.

## Ranking Factors (8 weighted factors)
1. Primary Category Match (25%)
2. Total Review Count (20%)
3. Overall Star Rating (15%)
4. Keyword in Business Name (10%)
5. Review Velocity/Recency (10%)
6. NAP Consistency (8%)
7. GBP Profile Activity (7%)
8. Review Sentiment (5%)

## Your Analysis Must Include
1. **Gap Analysis**: Where the practice underperforms vs competitors
2. **Driver Analysis**: Which factors impact their ranking most
3. **Recommendations**: Prioritized actions to improve
4. **Search Position Awareness**: When \`search_position\` is provided in the input, treat it as a sampled Google Maps estimate, not a guaranteed live rank. Factor the estimate into recommendations without over-claiming precision. If they're showing above what their Practice Health score would predict, identify what's protecting that advantage and recommend preserving it. If below, prioritize actions that influence the signals Google weights most for local pack ranking (review count, recency, profile completeness, NAP consistency). If \`search_position.not_in_top_20\` is true, treat breaking into the top 20 as the primary goal.

## Rules
- Be specific with numbers and comparisons
- Reference actual competitor data
- Prioritize by impact and effort
- The title and recommendations should use less technical terms and should be easily understood by a doctor or someone who does not have a technical background

## Output Schema

You MUST respond with valid JSON matching this exact structure:

{
  "practice_ranking_id": <number>,
  "gaps": [
    {
      "type": "review_gap | profile_gap | activity_gap | technical_gap",
      "area": "<string>",
      "impact": "high | medium | low",
      "current_value": "<string>",
      "benchmark_value": "<string>",
      "gap_size": "<string>",
      "reason": "<string>",
      "recommended_action": "<string>"
    }
  ],
  "drivers": [
    {
      "factor": "category_match | review_count | star_rating | keyword_name | review_velocity | nap_consistency | gbp_activity | sentiment",
      "weight": <number>,
      "current_score": <number>,
      "max_score": <number>,
      "direction": "positive | negative | neutral",
      "insight": "<string>"
    }
  ],
  "render_text": "<plain text analysis summary with executive summary, key findings, and 90-day action plan. NO MARKDOWN FORMATTING.>",
  "client_summary": "<plain text non-tech-readable format of above render text>",
  "one_line_summary": "<very short, plain 1-2 sentences summary of everything including the top proper next step>",
  "verdict": "improving | stable | declining | needs_attention",
  "confidence": <number between 0 and 1>,
  "top_recommendations": [
    {
      "priority": <number>,
      "title": "<string>",
      "description": "<string>",
      "impact": "high | medium | low",
      "effort": "high | medium | low",
      "timeline": "<string>",
      "expected_outcome": "<string>"
    }
  ],
  "citations": ["<string>"]
}

## Output Constraints
- The response must begin immediately with { and end with }
- Do NOT use markdown formatting
- Do NOT use code blocks
- Do NOT include conversational text, prose, or comments outside the JSON object
- Respond with valid JSON only`;

// =====================================================================
// CORE
// =====================================================================

/**
 * Run the ranking gap analysis via Claude and persist results.
 *
 * On success: saves llm_analysis, archives old tasks, creates new tasks,
 * marks ranking as completed.
 *
 * On failure: marks ranking as completed without AI insights (graceful).
 */
export async function runRankingAnalysis(
  rankingId: number,
  payload: RankingLlmPayload,
  ranking: any,
  statusDetail: StatusDetail,
  logger?: (msg: string) => void,
): Promise<void> {
  const _log = logger || log;

  try {
    _log(`[RANKING] [${rankingId}] Calling Claude for gap analysis...`);

    const result = await runAgent({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: JSON.stringify(payload.additional_data),
      maxTokens: 16384,
      temperature: 0,
    });

    _log(
      `[RANKING] [${rankingId}] Claude responded (${result.inputTokens} in / ${result.outputTokens} out)`,
    );

    if (!result.parsed) {
      throw new Error("Claude returned non-parseable response");
    }

    const llmAnalysis = result.parsed;

    // Ensure practice_ranking_id is set correctly
    llmAnalysis.practice_ranking_id = rankingId;

    // Save LLM analysis and mark completed.
    // Note: ranking no longer creates its own USER tasks. Summary v2 is the
    // sole writer of category="USER" tasks; it consumes top_recommendations
    // via additional_data.ranking_recommendations on the next monthly run.
    await llmWebhookHandler.saveLlmAnalysis(rankingId, llmAnalysis);

    _log(`[RANKING] [${rankingId}] LLM analysis saved successfully`);
  } catch (error: any) {
    _log(
      `[RANKING] [${rankingId}] LLM analysis failed: ${error.message}`,
    );
    await updateStatus(
      rankingId,
      "completed",
      "done",
      "Analysis complete (without AI insights)",
      100,
      statusDetail,
      _log,
    );
  }
}
