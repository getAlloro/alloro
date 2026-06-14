/**
 * Ranking History Service
 *
 * Fetches completed-ranking history within an interval and maps each row to the
 * trend-chart DTO (observedAt / rankScore / rankPosition / searchPosition /
 * per-factor scores). Extracted from PracticeRankingController.getRankingHistory.
 *
 * The controller still owns request validation and the interval literal; this
 * service performs the query + pure row mapping verbatim.
 */

import { PracticeRankingModel } from "../../../models/PracticeRankingModel";
import { parseJsonField } from "../feature-utils/util.json-parser";

export interface RankingHistoryPoint {
  observedAt: string;
  rankScore: number;
  rankPosition: number;
  searchPosition: number | null;
  factorScores: Record<string, number>;
}

/**
 * @param organizationId - validated positive org id
 * @param intervalLiteral - SQL interval literal ("3 months" | "6 months")
 * @param locationId - optional validated location id
 */
export async function getRankingHistory(
  organizationId: number,
  intervalLiteral: string,
  locationId: number | null,
): Promise<RankingHistoryPoint[]> {
  const rows = await PracticeRankingModel.findHistoryWithinInterval(
    organizationId,
    intervalLiteral,
    locationId,
  );

  return rows.map((row: any) => {
    const parsed = parseJsonField(row.ranking_factors) as
      | Record<string, { score?: number } | number | null>
      | null;
    const factorScores: Record<string, number> = {};
    if (parsed && typeof parsed === "object") {
      for (const [name, val] of Object.entries(parsed)) {
        if (val && typeof val === "object" && "score" in val) {
          const s = (val as { score?: unknown }).score;
          if (typeof s === "number" && Number.isFinite(s)) {
            factorScores[name] = s;
          }
        } else if (typeof val === "number" && Number.isFinite(val)) {
          factorScores[name] = val;
        }
      }
    }

    return {
      observedAt:
        row.observed_at instanceof Date
          ? row.observed_at.toISOString()
          : row.observed_at,
      rankScore: row.rank_score === null ? 0 : Number(row.rank_score),
      rankPosition: row.rank_position === null ? 0 : Number(row.rank_position),
      searchPosition:
        row.search_position === null || row.search_position === undefined
          ? null
          : Number(row.search_position),
      factorScores,
    };
  });
}
