import type { RankingResult } from "./rankingsDashboard.types";

/* ─────────────────────────────────────────────────────────────
   Rankings redesign primitives
   Spec: plans/04282026-no-ticket-rankings-page-redesign/spec.md (T2)
   ───────────────────────────────────────────────────────────── */

export const FACTOR_LABEL: Record<string, string> = {
  category_match: "Category match",
  review_count: "Review count",
  star_rating: "Star rating",
  keyword_name: "Keyword in name",
  review_velocity: "Review velocity",
  nap_consistency: "NAP consistency",
  gbp_activity: "Google profile activity",
  sentiment: "Review sentiment",
};

export const FACTOR_TOOLTIP: Record<string, string> = {
  category_match:
    "How precisely your Google Business Profile primary category matches the search (e.g. 'Orthodontist' vs the more diluted 'Dentist'). A direct match is one of the strongest local signals.",
  review_count:
    "Total lifetime Google reviews on your profile. Volume compounds slowly and signals authority — the leader's review count is the long-game gap to close.",
  star_rating:
    "Your average Google review rating. Higher ratings improve clickthrough and carry weight in Google's local ranking algorithm.",
  keyword_name:
    "Whether your business name naturally contains the search keyword (e.g. 'Orthodontics' in the name). A mild relevance boost — never keyword-stuff.",
  review_velocity:
    "How many new reviews you're collecting per month. Recent inflow signals an active, engaged practice; this is usually the fastest-moving lever.",
  nap_consistency:
    "Whether your Name, Address, and Phone match exactly across Google, your website, and online directories. Mismatches reduce Google's confidence in your listing.",
  gbp_activity:
    "Frequency of Google posts, photo uploads, and Q&A activity over the last 90 days. Active profiles (8+ posts/quarter) get a measurable lift.",
  sentiment:
    "How positive the text content of your recent reviews is. Beyond stars — Google reads review wording for relevance and quality signals.",
};

/**
 * rankingFactors values arrive as 0..1 fractions in production (e.g. `score:
 * 0.92`, `weight: 0.25`) but the wizard demo + the original redesign mock use
 * 0..100. Normalize defensively so both shapes render correctly.
 */
export function normalizeFactorPct(v: number | string | undefined): number {
  if (v === undefined || v === null) return 0;
  const n = typeof v === "string" ? parseFloat(v.replace("%", "")) : v;
  if (Number.isNaN(n)) return 0;
  return n > 1 ? n : n * 100;
}

export function getComparablePreviousScore(result: RankingResult): number | null {
  void result;
  // The main overview gauge now uses the owner-visible 8-factor score from
  // rankingFactors. Previous rows expose only the persisted 6-factor
  // competitive score through previousAnalysis, so showing a delta here would
  // compare different score bases.
  return null;
}

export function getOwnerVisibleScore(result: RankingResult): number {
  const factorTotal = result.rankingFactors
    ? Object.values(result.rankingFactors).reduce(
        (sum, factor) => sum + Number(factor?.weighted ?? 0),
        0,
      )
    : NaN;

  if (Number.isFinite(factorTotal) && factorTotal > 0) return factorTotal;
  const fallback = Number(result.rankScore);
  return Number.isFinite(fallback) ? fallback : 0;
}

export function normalizeNarrativeScoreText(text: string, score: number): string {
  const scoreLabel = `${Math.round(score)}/100`;
  return text
    .replace(/\b\d{2,3}\s*\/\s*\d{2,3}\s*\/\s*100\b/g, scoreLabel)
    .replace(/\b\d{2,3}(?:\.\d+)?\s*\/\s*100\b/g, scoreLabel)
    .replace(
      /(?<!\/)\b\d{2,3}(?:\.\d+)?(?!\s*\/)\s+score\b/g,
      `${scoreLabel} score`,
    )
    .replace(/\ban\s+(\d{2,3}\/100 score)\b/g, "a $1")
    .replace(
      /\bestimated at position\s+(\d+)\s+on\s+Google Maps\b/gi,
      "ranked #$1 in Local Search",
    )
    .replace(/\bestimated at position\s+(\d+)\b/gi, "ranked #$1")
    .replace(
      /\bestimated\s+#?(\d+)\s+(?:on|in)\s+(?:Google Maps|Maps|Local Search)\b/gi,
      "ranked #$1 in Local Search",
    )
    .replace(/\bposition\s+(\d+)\s+on\s+Maps\b/gi, "position #$1 in Local Search")
    .replace(/\bon\s+Google Maps\b/g, "in Local Search")
    .replace(/\bon\s+Maps\b/g, "in Local Search");
}

export function getPracticeDisplayName(result: RankingResult): string {
  return (
    result.gbpLocationName?.trim() ||
    result.rawData?.client_gbp?.gbpLocationName?.trim() ||
    result.location?.trim() ||
    "This location"
  );
}

type SearchPositionBand =
  | "leader"
  | "top_set"
  | "ranked"
  | "outside_top_20"
  | "pending";

const LEADER_SEARCH_POSITION = 1;
const TOP_THREE_SEARCH_POSITIONS = new Set([2, 3]);

function getSearchPositionBand(result: RankingResult): SearchPositionBand {
  const status = result.searchStatus ?? "ok";
  if (status === "not_in_top_20") return "outside_top_20";
  if (status !== "ok" || result.searchPosition == null) return "pending";
  if (result.searchPosition === LEADER_SEARCH_POSITION) return "leader";
  if (TOP_THREE_SEARCH_POSITIONS.has(result.searchPosition)) return "top_set";
  return "ranked";
}

function getRankingStatement(result: RankingResult): string {
  const displayName = getPracticeDisplayName(result);
  const band = getSearchPositionBand(result);
  if (band === "leader") return `${displayName} holds a dominant #1 Local Search Ranking`;
  if (band === "top_set") return `${displayName} is in the top three in Local Search`;
  if (band === "ranked") {
    return `${displayName} is currently #${result.searchPosition} in Local Search`;
  }
  if (band === "outside_top_20") {
    return `${displayName} was not found in the top 20 in Local Search`;
  }
  return `${displayName} has a Local Search position pending this month`;
}

function getPostingOutcome(band: SearchPositionBand): string {
  if (band === "leader") return "protect the lead";
  if (band === "top_set") return "widen your top-three lead";
  if (band === "ranked") return "move closer to the top three";
  if (band === "outside_top_20") return "break into the top 20";
  return "keep the profile active while the position refreshes";
}

function getReviewAction(band: SearchPositionBand): string {
  if (band === "leader") {
    return "Reply to unanswered Google reviews to protect trust signals";
  }
  if (band === "top_set") {
    return "Reply to unanswered Google reviews to strengthen your top-three standing";
  }
  if (band === "pending") {
    return "Reply to unanswered Google reviews to strengthen trust signals";
  }
  return "Reply to unanswered Google reviews to close the review gap";
}

export function getOverviewRecommendedAction(result: RankingResult): string {
  const recommendations =
    result.llmAnalysis?.top_recommendations?.map((rec) =>
      `${rec.title} ${rec.description ?? ""}`.toLowerCase(),
    ) ?? [];
  const band = getSearchPositionBand(result);
  const postingOutcome = getPostingOutcome(band);

  if (recommendations.some((rec) => rec.includes("post"))) {
    return `Start posting to Google Business Profile weekly to ${postingOutcome}`;
  }

  if (recommendations.some((rec) => rec.includes("review"))) {
    return getReviewAction(band);
  }

  if (recommendations.some((rec) => rec.includes("photo"))) {
    return "Add fresh Google Business Profile photos to strengthen the profile";
  }

  return `Start posting to Google Business Profile weekly to ${postingOutcome}`;
}

export function getStructuredOverviewInsight(
  result: RankingResult,
  score: number,
): string {
  const rankingStatement = getRankingStatement(result);
  const roundedScore = Math.round(score);

  return `${rankingStatement} with a ${roundedScore} Alloro Health Score. Recommended Action: ${getOverviewRecommendedAction(result)}.`;
}

export function getOverviewDisplayInsight(
  result: RankingResult,
  insight: string | undefined,
  score: number,
): string {
  if (
    insight &&
    /Local Search Ranking/i.test(insight) &&
    /Alloro Health Score/i.test(insight) &&
    /Recommended Action:/i.test(insight)
  ) {
    return normalizeNarrativeScoreText(insight, score);
  }

  return getStructuredOverviewInsight(result, score);
}

export function getOverviewDisplayHighlights(
  result: RankingResult,
  insight: string,
  score: number,
): string[] {
  const scoreHighlight = `${Math.round(score)} Alloro Health Score`;
  const rankHighlight =
    (result.searchStatus ?? "ok") === "ok" && result.searchPosition
      ? `#${result.searchPosition} Local Search Ranking`
      : "Local Search Ranking";

  return [rankHighlight, scoreHighlight, "Recommended Action"].filter((highlight) =>
    insight.includes(highlight),
  );
}

export function getOverviewFallbackInsight(result: RankingResult): string {
  const query = result.searchQuery ?? "your tracked search";
  if ((result.searchStatus ?? "ok") === "ok" && result.searchPosition !== null) {
    return `Ranked number ${result.searchPosition} for ${query}. Keep reviews and Google posts moving to protect that position.`;
  }
  if (result.searchStatus === "not_in_top_20") {
    return `You are not in the top 20 for ${query}. Focus on reviews, profile activity, and the gaps below first.`;
  }
  if (result.searchStatus === "bias_unavailable") {
    return "Google could not locate the practice for this search. Check the connected profile and address before reading the rest of the report.";
  }
  return "Local search data is temporarily unavailable. Review the score details and try refreshing rankings again later.";
}

/**
 * Compute a cohort-comparison sub-line for a factor row. Returns null when
 * comparison data isn't available — gbp_activity, nap_consistency, and
 * sentiment fall here because the per-competitor data we collect either
 * doesn't exist (NAP, sentiment) or is unreliable (postsLast90d is always 0
 * in production — see service.apify.ts where Apify can't fetch Google posts).
 */
export function computeCohortDelta(
  key: string,
  result: RankingResult,
): string | null {
  const competitors = result.rawData?.competitors ?? [];
  if (competitors.length === 0) return null;

  const clientGbp = result.rawData?.client_gbp;
  const factors = result.rankingFactors;
  const factorEntry =
    factors && key in factors
      ? (factors as Record<string, { value?: number }>)[key]
      : undefined;
  const factorValue =
    factorEntry && typeof factorEntry.value === "number"
      ? factorEntry.value
      : undefined;

  const median = (arr: number[]): number => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  switch (key) {
    case "review_count": {
      const client = factorValue ?? clientGbp?.totalReviewCount ?? 0;
      const cohortMedian = median(
        competitors.map((c) => c.totalReviews ?? 0),
      );
      return `You: ${client.toLocaleString()} · Cohort median: ${Math.round(
        cohortMedian,
      ).toLocaleString()}`;
    }
    case "star_rating": {
      const client = factorValue ?? clientGbp?.averageRating ?? 0;
      const cohortMedian = median(
        competitors.map((c) => c.averageRating ?? 0),
      );
      return `You: ${client.toFixed(1)}★ · Cohort median: ${cohortMedian.toFixed(1)}★`;
    }
    case "review_velocity": {
      const client = factorValue ?? clientGbp?.reviewsLast30d ?? 0;
      const valid = competitors
        .map((c) => c.reviewsLast30d)
        .filter((n): n is number => typeof n === "number");
      if (valid.length === 0) return null;
      const cohortMedian = median(valid);
      return `You: ${client} in 30d · Cohort median: ${Math.round(cohortMedian)}`;
    }
    case "category_match": {
      const clientCategory = (clientGbp?.primaryCategory ?? "").trim();
      if (!clientCategory) return null;
      const target = clientCategory.toLowerCase();
      const matches = competitors.filter(
        (c) => (c.primaryCategory ?? "").toLowerCase().trim() === target,
      ).length;
      return `${matches} of ${competitors.length} share your "${clientCategory}" primary category`;
    }
    case "keyword_name": {
      const valid = competitors.filter(
        (c) => typeof c.hasKeywordInName === "boolean",
      );
      if (valid.length === 0) return null;
      const matches = valid.filter((c) => c.hasKeywordInName).length;
      return `${matches} of ${valid.length} competitors carry a specialty keyword in their name`;
    }
    default:
      return null;
  }
}
