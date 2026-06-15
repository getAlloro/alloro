/**
 * Ranking Recommendations Fetcher
 *
 * Fetches the latest practice ranking LLM-curated recommendations
 * for an org/location, used as Summary v2 input alongside the
 * deterministic dashboard_metrics dictionary.
 *
 * Mirrors the latest-row query pattern from dashboard-metrics/buildRankingMetrics.
 */

import { PracticeRankingModel } from "../../../models/PracticeRankingModel";
import logger from "../../../lib/logger";

export interface RankingRecommendation {
  title?: string;
  description?: string;
  priority?: string;
  impact?: string;
  effort?: string;
  timeline?: string;
  [key: string]: unknown;
}

/**
 * Returns top_recommendations[] from the latest completed practice ranking
 * for the given org + optional location. Returns null when no completed
 * ranking exists or llm_analysis is empty/malformed.
 */
export async function fetchLatestRankingRecommendations(
  orgId: number,
  locationId: number | null
): Promise<RankingRecommendation[] | null> {
  try {
    const row = await PracticeRankingModel.findLatestLlmAnalysisForSummary(
      orgId,
      locationId
    );

    if (!row || !row.llm_analysis) return null;

    // llm_analysis is jsonb. May come back as object (auto) or string.
    let analysis: Record<string, unknown> | null = null;
    const raw = row.llm_analysis;
    if (raw && typeof raw === "object") {
      analysis = raw as Record<string, unknown>;
    } else if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          analysis = parsed as Record<string, unknown>;
        }
      } catch {
        analysis = null;
      }
    }

    if (!analysis) return null;

    const recs = analysis.top_recommendations;
    if (!Array.isArray(recs) || recs.length === 0) return null;

    return recs as RankingRecommendation[];
  } catch (err: any) {
    logger.warn(
      `[ranking-recommendations] Failed for org ${orgId}, location ${locationId}: ${
        err?.message || err
      }`
    );
    return null;
  }
}
