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
import { updateStatus, StatusDetail } from "./service.ranking-status";
import { sanitizeRankingLlmAnalysis } from "./service.ranking-output-guardrails";
import {
  getExternalErrorMessage,
  isRetryableExternalError,
  RetryAttemptRecord,
  runWithRetry,
} from "./service.ranking-resilience";

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
      visible_local_search_score: number;
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
    engagement_summary?: {
      unanswered_reviews_total: number;
      unanswered_reviews_last_30d: number;
      all_reviews_replied: boolean;
      published_posts_total: number;
      latest_post_age_days: number | null;
      latest_post_at: string | null;
      has_recent_post_15d: boolean;
      post_freshness_window_days: number;
      photos_count: number;
    };
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

export interface RankingAnalysisRunResult {
  success: boolean;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
  retryAttempts?: RetryAttemptRecord[];
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
- When mentioning the Local Search Score, use only \`client.visible_local_search_score\` and write it as \`N/100\`. Do not calculate, round differently, or use any other score field in narrative copy.
- Treat \`client.visible_local_search_score\` as the exact number the user sees in the main card. The persisted competitive score may differ and should not be mentioned in owner-facing copy.
- Do not use the words "estimated" or "estimate" in owner-facing narrative fields. Use "ranked #N" or "sampled at #N" instead.
- For \`overview_card.text\`, use this format when the sampled rank is #1: "[Client or location name] holds a dominant #1 Local Search Ranking with a X Alloro Health Score. Recommended Action: [one direct action]."
- For \`overview_card.text\`, use this format when the sampled rank is not #1: "[Client or location name] is currently #N in Local Search with a X Alloro Health Score. Recommended Action: [one direct action]."
- In \`overview_card.text\`, use the practice or location name, the sampled local rank, and the rounded owner-visible score. Use "Alloro Health Score" in this field instead of "Local Search Score".
- The \`overview_card.text\` recommended action should point to the clearest owner action. Use "protect the lead" only when the sampled rank is #1. For any lower rank, use plain language like "improve the position", "move closer to the top 3", or "close the ranking gap".
- Use \`engagement_summary\` for review reply and Google post language. This is a compact summary, not the full review dataset.
- If \`engagement_summary.all_reviews_replied\` is true or \`unanswered_reviews_total\` is 0, do not mention unanswered reviews, pending review replies, or review cleanup.
- If \`engagement_summary.has_recent_post_15d\` is true, do not mention stale or missing Google posts as a problem.
- Do not use em dashes in owner-facing copy. Use commas, periods, or parentheses.
- Keep \`engagement_card.text\` concise: one or two sentences, no repeated explanation of the same post or review issue, and single spaces after periods.
- If \`website_audit\` is missing, failed, skipped, or marked unmeasured, do not recommend website fixes from that absence alone. A website basics check is not a Lighthouse score or Core Web Vitals test.
- Do not recommend website speed, page load, Lighthouse, Core Web Vitals, or technical website performance work anywhere. Website performance is owned by Alloro, not the practice. If website speed appears weak, omit it and choose review growth, Google profile activity, photos, category/profile completeness, NAP consistency, or review reply/posting actions instead.
- Do not use titles like "Speed Up Your Website" or tell the doctor to ask a web provider for changes.

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
  "overview_card": {
    "text": "<owner-readable main card copy. If rank is #1, use: '[Client or location name] holds a dominant #1 Local Search Ranking with a X Alloro Health Score. Recommended Action: [one direct action].' If rank is not #1, use: '[Client or location name] is currently #N in Local Search with a X Alloro Health Score. Recommended Action: [one direct action].' Include review reply context only when engagement_summary says unanswered reviews exist.>",
    "highlights": ["<exact short phrase from text to highlight>"]
  },
  "engagement_card": {
    "title": "<short plain-English title for the Local Rankings reviews/posts action card>",
    "text": "<one or two plain-English sentences for the reviews/posts action card. Use only engagement_summary counts for unanswered reviews and post freshness. Omit review reply language if everything is replied.>",
    "highlights": ["<exact short phrase from text to highlight>"],
    "sentiment": "<fallback one sentence explaining why reviews, review replies, Google posts, or profile activity matter right now. Do not include raw counts unless engagement_summary is present.>"
  },
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
- Respond with valid JSON only
- Keep \`gaps\` to the 4 most important items
- Keep \`top_recommendations\` to exactly 1 item — the single highest-impact action the practice should take first
- Keep \`render_text\` focused: roughly 900-1,200 characters, not a long report
- Keep \`client_summary\` under 500 characters
- Keep \`one_line_summary\` under 220 characters
- Keep \`overview_card.text\` under 240 characters
- Keep \`overview_card.highlights\` to 1-3 exact phrases that appear in \`overview_card.text\`
- Keep \`engagement_card.title\` under 80 characters
- Keep \`engagement_card.text\` under 260 characters
- Keep \`engagement_card.highlights\` to 1-3 exact phrases that appear in \`engagement_card.text\`
- Keep \`engagement_card.sentiment\` under 180 characters
- Keep each recommendation description and expected outcome under 180 characters`;

function compactText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const compacted = value.replace(/\s+/g, " ").trim();
  if (!compacted) return undefined;
  return compacted.length > maxLength
    ? `${compacted.slice(0, maxLength - 3)}...`
    : compacted;
}

function compactWebsiteAudit(audit: any): Record<string, any> | null {
  if (!audit) return null;
  if (audit.auditType === "website_basics") {
    if (audit.status === "failed" || audit.status === "skipped") {
      return {
        audit_type: "website_basics",
        measured: false,
        status: audit.status,
        url: audit.url,
        error: compactText(audit.error, 180),
      };
    }

    return {
      audit_type: "website_basics",
      measured: true,
      status: audit.status,
      url: audit.url,
      final_url: audit.finalUrl,
      http_status: audit.httpStatus,
      response_time_ms: audit.responseTimeMs,
      redirect_count: audit.redirectCount,
      title_present: !!audit.title,
      meta_description_present: !!audit.metaDescription,
      schema_types: Array.isArray(audit.schemaTypes)
        ? audit.schemaTypes.slice(0, 8)
        : [],
      checks: Array.isArray(audit.checks)
        ? audit.checks.map((check: any) => ({
            key: check.key,
            status: check.status,
            detail: compactText(check.detail, 120),
          }))
        : [],
    };
  }

  const scoreValues = [
    audit.performanceScore,
    audit.accessibilityScore,
    audit.bestPracticesScore,
    audit.seoScore,
  ].filter((score) => typeof score === "number");
  const hasMeasuredScore = scoreValues.some((score) => score > 0);
  if (!hasMeasuredScore && scoreValues.length > 0) {
    return {
      measured: false,
      status: "unknown",
      url: audit.url,
      reason: "Legacy audit scores were all zero, so they are treated as unknown.",
    };
  }

  return {
    url: audit.url,
    measured: true,
    scores: {
      performance: audit.performanceScore,
      accessibility: audit.accessibilityScore,
      best_practices: audit.bestPracticesScore,
      seo: audit.seoScore,
    },
    core_web_vitals: {
      lcp: audit.lcp,
      fid: audit.fid,
      cls: audit.cls,
    },
    schema: {
      local_business: audit.hasLocalSchema,
      organization: audit.hasOrganizationSchema,
      review: audit.hasReviewSchema,
      faq: audit.hasFaqSchema,
    },
    mobile_friendly: audit.mobileFriendly,
    https: audit.https,
  };
}

function compactFactors(factors: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(factors || {}).map(([key, factor]) => [
      key,
      {
        score: factor?.score,
        weighted: factor?.weighted,
        weight: factor?.weight,
        value: factor?.value,
        details: compactText(factor?.details, 220),
      },
    ]),
  );
}

function compactCompetitor(competitor: any): Record<string, any> {
  return {
    name: competitor.name,
    rank_score: competitor.rankScore,
    rank_position: competitor.rankPosition,
    total_reviews: competitor.totalReviews,
    average_rating: competitor.averageRating,
    reviews_last_30d: competitor.reviewsLast30d,
    primary_category: competitor.primaryCategory,
    has_keyword_in_name: competitor.hasKeywordInName,
    photos_count: competitor.photosCount,
    posts_last_90d: competitor.postsLast90d,
  };
}

function buildLeanRankingInput(
  data: RankingLlmPayload["additional_data"],
): Record<string, any> {
  return {
    practice_ranking_id: data.practice_ranking_id,
    batch_id: data.batch_id,
    client: {
      ...data.client,
      factors: compactFactors(data.client.factors),
      website_audit: compactWebsiteAudit(data.client.website_audit),
    },
    competitors: data.competitors.slice(0, 8).map(compactCompetitor),
    benchmarks: data.benchmarks,
    engagement_summary: data.engagement_summary,
    search_position: data.search_position
      ? {
          query: data.search_position.query,
          position: data.search_position.position,
          status: data.search_position.status,
          not_in_top_20: data.search_position.not_in_top_20,
          top_5: data.search_position.top_5,
          selected_competitors:
            data.search_position.selected_competitors?.map((competitor) => ({
              selected_order: competitor.selected_order,
              name: competitor.name,
              maps_position: competitor.maps_position,
              maps_status: competitor.maps_status,
              rating: competitor.rating,
              review_count: competitor.review_count,
              primary_type: competitor.primary_type,
            })) ?? [],
          discovery_radius_meters: data.search_position.discovery_radius_meters,
        }
      : undefined,
  };
}

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
): Promise<RankingAnalysisRunResult> {
  const _log = logger || log;

  try {
    _log(`[RANKING] [${rankingId}] Calling Claude for gap analysis...`);

    const leanInput = buildLeanRankingInput(payload.additional_data);
    const userMessage = JSON.stringify(leanInput);
    _log(
      `[RANKING] [${rankingId}] LLM input compacted (${JSON.stringify(payload.additional_data).length}ch -> ${userMessage.length}ch)`,
    );

    const { value: result, attempts } = await runWithRetry(
      async () => {
        const agentResult = await runAgent({
          systemPrompt: SYSTEM_PROMPT,
          userMessage,
          maxTokens: 16384,
          temperature: 0,
        });

        if (!agentResult.parsed) {
          throw new Error("Claude returned non-parseable response");
        }

        return agentResult;
      },
      {
        label: `Ranking LLM analysis ${rankingId}`,
        maxAttempts: 3,
        logger: _log,
        shouldRetry: (error) =>
          isRetryableExternalError(error) ||
          getExternalErrorMessage(error)
            .toLowerCase()
            .includes("non-parseable"),
      },
    );

    _log(
      `[RANKING] [${rankingId}] Claude responded (${result.inputTokens} in / ${result.outputTokens} out, attempts=${attempts.length})`,
    );

    const llmAnalysis = sanitizeRankingLlmAnalysis(result.parsed, {
      visibleScore: leanInput.client?.visible_local_search_score,
      searchPosition: leanInput.search_position?.position,
    });

    // Ensure practice_ranking_id is set correctly
    llmAnalysis.practice_ranking_id = rankingId;

    // Save LLM analysis and mark completed.
    // Note: ranking no longer creates its own USER tasks. Summary v2 is the
    // sole writer of category="USER" tasks; it consumes top_recommendations
    // via additional_data.ranking_recommendations on the next monthly run.
    await llmWebhookHandler.saveLlmAnalysis(rankingId, llmAnalysis);

    _log(`[RANKING] [${rankingId}] LLM analysis saved successfully`);
    return {
      success: true,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      retryAttempts: attempts,
    };
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
    return {
      success: false,
      error: error.message,
      retryAttempts: Array.isArray(error.retryAttempts)
        ? error.retryAttempts
        : [],
    };
  }
}
