import type { SelectedCompetitorSearchResult } from "../../../api/practiceRanking";

export type ComparisonSortKey =
  | "reviewCount"
  | "reviewVelocity"
  | "starRating"
  | "practiceHealth"
  | "mapsPosition";

export type ComparisonRow = {
  id: string;
  name: string;
  address: string | null;
  category: string | null;
  isYou: boolean;
  source: "client" | "selected" | "cohort";
  selectedOrder: number;
  mapsPosition: number | null;
  mapsStatus: "measured" | "not_in_top_20" | "not_measured";
  distanceMiles: number | null;
  reviewCount: number | null;
  reviewVelocity: number | null;
  reviewVelocitySource: "gbp" | "apify" | "cache" | "not_measured" | null;
  reviewVelocityMeasuredAt: string | null;
  starRating: number | null;
  practiceHealth: number | null;
};

type ClientGbpLike = {
  totalReviewCount?: number;
  averageRating?: number;
  primaryCategory?: string;
  reviewsLast30d?: number;
};

type CompetitorLike = {
  name: string;
  rankScore?: number;
  rankPosition?: number;
  totalReviews?: number;
  averageRating?: number;
  reviewsLast30d?: number | null;
  reviewVelocitySource?: "apify" | "cache" | "not_measured" | null;
  reviewVelocityMeasuredAt?: string | null;
  primaryCategory?: string;
};

export type ComparisonRankingResultLike = {
  gbpLocationName?: string | null;
  rankScore: number | string;
  searchPosition: number | null;
  searchStatus: "ok" | "not_in_top_20" | "bias_unavailable" | "api_error" | null;
  rawData: {
    client_gbp: ClientGbpLike | null;
    competitors: CompetitorLike[];
  } | null;
  selectedCompetitorSearchResults: SelectedCompetitorSearchResult[] | null;
  searchResults: Array<{
    placeId: string;
    name: string;
    position: number;
    rating: number;
    reviewCount: number;
    primaryType: string;
    isClient: boolean;
  }> | null;
};

export const COMPARISON_SORT_OPTIONS: Array<{
  key: ComparisonSortKey;
  label: string;
  higherIsBetter: boolean;
}> = [
  { key: "mapsPosition", label: "Local Search", higherIsBetter: false },
  { key: "reviewCount", label: "Review Count", higherIsBetter: true },
  { key: "reviewVelocity", label: "Review Velocity", higherIsBetter: true },
  { key: "starRating", label: "Star Rating", higherIsBetter: true },
  { key: "practiceHealth", label: "Score", higherIsBetter: true },
];

const COMPARISON_EPSILON = 0.001;

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clientMapsStatus(
  result: ComparisonRankingResultLike,
): ComparisonRow["mapsStatus"] {
  if (typeof result.searchPosition === "number") return "measured";
  return result.searchStatus === "not_in_top_20" ? "not_in_top_20" : "not_measured";
}

function matchRawCompetitor(
  selected: SelectedCompetitorSearchResult,
  index: number,
  competitors: CompetitorLike[],
  usedIndexes: Set<number>,
): CompetitorLike | undefined {
  const selectedName = normalizeName(selected.name);
  const namedIndex = competitors.findIndex(
    (competitor, competitorIndex) =>
      !usedIndexes.has(competitorIndex) &&
      normalizeName(competitor.name) === selectedName,
  );
  const matchIndex =
    namedIndex >= 0
      ? namedIndex
      : !usedIndexes.has(index) && competitors[index]
        ? index
        : -1;

  if (matchIndex < 0) return undefined;
  usedIndexes.add(matchIndex);
  return competitors[matchIndex];
}

function buildClientRow(result: ComparisonRankingResultLike): ComparisonRow {
  const clientGbp = result.rawData?.client_gbp ?? null;
  const clientSearch = result.searchResults?.find((row) => row.isClient);
  const mapsPosition = asNumber(result.searchPosition ?? clientSearch?.position);

  return {
    id: "client-practice",
    name: result.gbpLocationName || clientSearch?.name || "Your practice",
    address: null,
    category: clientGbp?.primaryCategory ?? clientSearch?.primaryType ?? null,
    isYou: true,
    source: "client",
    selectedOrder: -1,
    mapsPosition,
    mapsStatus: mapsPosition !== null ? "measured" : clientMapsStatus(result),
    distanceMiles: null,
    reviewCount: asNumber(clientGbp?.totalReviewCount),
    reviewVelocity: asNumber(clientGbp?.reviewsLast30d),
    reviewVelocitySource: "gbp",
    reviewVelocityMeasuredAt: null,
    starRating: asNumber(clientGbp?.averageRating),
    practiceHealth: asNumber(Number(result.rankScore)),
  };
}

export function buildCompetitorComparisonRows(
  result: ComparisonRankingResultLike,
): ComparisonRow[] {
  const competitors = result.rawData?.competitors ?? [];
  const selectedRows = result.selectedCompetitorSearchResults ?? [];
  const usedIndexes = new Set<number>();
  const clientRow = buildClientRow(result);

  const competitorRows =
    selectedRows.length > 0
      ? selectedRows.map((selected, index) => {
          const raw = matchRawCompetitor(selected, index, competitors, usedIndexes);
          return {
            id: selected.placeId || `selected-${selected.selectedOrder}-${selected.name}`,
            name: selected.name,
            address: selected.address,
            category: selected.primaryType ?? raw?.primaryCategory ?? null,
            isYou: false,
            source: "selected" as const,
            selectedOrder: selected.selectedOrder,
            mapsPosition: selected.position,
            mapsStatus: selected.status,
            distanceMiles: selected.distanceMiles,
            reviewCount: asNumber(selected.reviewCount ?? raw?.totalReviews),
            reviewVelocity: asNumber(raw?.reviewsLast30d),
            reviewVelocitySource: raw?.reviewVelocitySource ?? "not_measured",
            reviewVelocityMeasuredAt: raw?.reviewVelocityMeasuredAt ?? null,
            starRating: asNumber(selected.rating ?? raw?.averageRating),
            practiceHealth: asNumber(raw?.rankScore),
          };
        })
      : competitors.map((competitor, index) => ({
          id: `cohort-${index}-${competitor.name}`,
          name: competitor.name,
          address: null,
          category: competitor.primaryCategory ?? null,
          isYou: false,
          source: "cohort" as const,
          selectedOrder: index,
          mapsPosition: asNumber(competitor.rankPosition),
          mapsStatus: asNumber(competitor.rankPosition) ? "measured" as const : "not_measured" as const,
          distanceMiles: null,
          reviewCount: asNumber(competitor.totalReviews),
          reviewVelocity: asNumber(competitor.reviewsLast30d),
          reviewVelocitySource:
            competitor.reviewVelocitySource ?? "not_measured",
          reviewVelocityMeasuredAt: competitor.reviewVelocityMeasuredAt ?? null,
          starRating: asNumber(competitor.averageRating),
          practiceHealth: asNumber(competitor.rankScore),
        }));

  return [clientRow, ...competitorRows];
}

export function getComparisonValue(
  row: ComparisonRow,
  key: ComparisonSortKey,
): number | null {
  return row[key];
}

export function sortComparisonRows(
  rows: ComparisonRow[],
  key: ComparisonSortKey,
): ComparisonRow[] {
  const config = COMPARISON_SORT_OPTIONS.find((option) => option.key === key)!;
  return [...rows].sort((a, b) => {
    const aValue = getComparisonValue(a, key);
    const bValue = getComparisonValue(b, key);
    if (aValue === null && bValue === null) return a.name.localeCompare(b.name);
    if (aValue === null) return 1;
    if (bValue === null) return -1;
    const diff = config.higherIsBetter ? bValue - aValue : aValue - bValue;
    if (diff !== 0) return diff;
    if (a.isYou !== b.isYou) return a.isYou ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function formatMapsEstimate(row: ComparisonRow): string {
  if (row.mapsStatus === "measured" && row.mapsPosition !== null) {
    return `#${row.mapsPosition}`;
  }
  return row.mapsStatus === "not_in_top_20" ? "Not in top 20" : "Not measured";
}

export function formatComparisonValue(
  row: ComparisonRow,
  key: ComparisonSortKey,
): string {
  const value = getComparisonValue(row, key);
  if (value === null) return key === "reviewVelocity" ? "Not measured" : "-";
  if (key === "starRating") return value.toFixed(1);
  if (key === "mapsPosition") return `#${value}`;
  if (key === "reviewVelocity") return `+${Math.round(value)} / 30d`;
  return Math.round(value).toLocaleString();
}

export function getComparisonInsight(
  rows: ComparisonRow[],
  key: ComparisonSortKey,
): string {
  const sorted = sortComparisonRows(rows, key);
  const validRows = sorted.filter((row) => getComparisonValue(row, key) !== null);
  const you = validRows.find((row) => row.isYou);
  const leader = validRows[0];
  const option = COMPARISON_SORT_OPTIONS.find((item) => item.key === key)!;
  const label = option.label.toLowerCase();
  const competitorCount = rows.filter((row) => !row.isYou).length;

  if (key === "reviewVelocity") {
    const measuredCompetitors = rows.filter(
      (row) =>
        !row.isYou &&
        row.reviewVelocity !== null &&
        row.reviewVelocitySource !== "not_measured",
    ).length;
    if (measuredCompetitors === 0) {
      return "Competitor review velocity has not been measured yet.";
    }
  }

  if (!you || !leader) return `No ${label} value is available for your practice yet.`;
  const leaderValue = getComparisonValue(leader, key)!;
  const leaders = validRows.filter((row) => {
    const value = getComparisonValue(row, key);
    return value !== null && Math.abs(value - leaderValue) <= COMPARISON_EPSILON;
  });
  const youAreLeading = leaders.some((row) => row.isYou);
  const tiedCompetitorCount = leaders.filter((row) => !row.isYou).length;

  if (youAreLeading && tiedCompetitorCount > 0) {
    const competitorLabel =
      tiedCompetitorCount === 1 ? "1 competitor" : `${tiedCompetitorCount} competitors`;
    return `You and ${competitorLabel} lead on ${label}.`;
  }

  if (leader.isYou) {
    return competitorCount > 0
      ? `You lead all ${competitorCount} tracked competitors on ${label}.`
      : `You are leading on ${label}.`;
  }

  const youValue = getComparisonValue(you, key)!;
  const diff = Math.abs(leaderValue - youValue);
  const leaderName =
    leaders.length > 1
      ? `${leader.name} and ${leaders.length - 1} ${leaders.length - 1 === 1 ? "other" : "others"}`
      : leader.name;
  const delta =
    key === "starRating"
      ? `${diff.toFixed(1)} stars`
      : key === "reviewVelocity"
        ? `${Math.round(diff)} reviews in 30d`
        : key === "practiceHealth"
          ? `${Math.round(diff)} points`
          : key === "mapsPosition"
            ? `${Math.round(diff)} positions`
            : `${Math.round(diff).toLocaleString()} reviews`;
  const youIndex = validRows.findIndex((row) => row.isYou);
  const lastCopy =
    youIndex === validRows.length - 1
      ? " You are currently last among measured profiles."
      : "";

  return `${leaderName} ${leaders.length > 1 ? "lead" : "leads"} you by ${delta} on ${label}.${lastCopy}`;
}
