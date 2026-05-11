import { apiGet } from "./index";

/**
 * Ranking History API client
 *
 * Wraps `GET /api/practice-ranking/history?googleAccountId=X[&locationId=Y]&range=6m|3m`
 * (Plan 1 backend).
 *
 * Note: the backend keeps the legacy query param name `googleAccountId` for
 * consistency with `/practice-ranking/latest`. The frontend signature uses
 * `orgId` (the actual semantic) and maps it to `googleAccountId` on the wire.
 *
 * Backend envelope: `{ success: true, rankings: RankingHistoryPoint[] }`.
 *
 * Spec: plans/04282026-no-ticket-focus-dashboard-frontend/spec.md (T9)
 */

export interface RankingHistoryPoint {
  observedAt: string;
  rankScore: number;
  rankPosition: number;
  searchPosition: number | null;
  factorScores: Record<string, number>;
}

interface RankingHistoryResponse {
  success: boolean;
  rankings?: RankingHistoryPoint[];
  errorMessage?: string;
}

export async function fetchRankingHistory(
  orgId: number,
  locationId: number | null,
  range: "3m" | "6m" = "6m"
): Promise<RankingHistoryPoint[]> {
  const params = new URLSearchParams();
  params.set("googleAccountId", String(orgId));
  if (locationId != null) params.set("locationId", String(locationId));
  params.set("range", range);

  const response = (await apiGet({
    path: `/practice-ranking/history?${params.toString()}`,
  })) as RankingHistoryResponse;

  if (!response?.success || !response.rankings) {
    throw new Error(
      response?.errorMessage || "Failed to fetch ranking history"
    );
  }

  return response.rankings;
}
