import { normalizeKeyword } from "./keywordNormalization";

export interface CoverageKeyword {
  normalized_keyword: string;
}

export interface CoverageQuery {
  normalizedQuery: string;
  impressions: number;
}

export interface MarketKeywordCoverage {
  trackedKeywords: number;
  uniqueGscQueries: number;
  matchedQueries: number;
  unmatchedQueries: number;
  matchedImpressions: number;
  unmatchedImpressions: number;
  queryCoveragePct: number | null;
  impressionCoveragePct: number | null;
}

function isQueryMatched(query: string, keywordSet: Set<string>): boolean {
  const normalizedQuery = normalizeKeyword(query);
  if (keywordSet.has(normalizedQuery)) return true;
  for (const keyword of keywordSet) {
    if (normalizedQuery.includes(keyword) || keyword.includes(normalizedQuery)) {
      return true;
    }
  }
  return false;
}

export function calculateKeywordCoverage(
  keywords: CoverageKeyword[],
  queries: CoverageQuery[],
): MarketKeywordCoverage {
  const keywordSet = new Set(
    keywords.map((keyword) => keyword.normalized_keyword).filter(Boolean),
  );
  let matchedQueries = 0;
  let matchedImpressions = 0;
  let unmatchedImpressions = 0;

  for (const query of queries) {
    if (isQueryMatched(query.normalizedQuery, keywordSet)) {
      matchedQueries += 1;
      matchedImpressions += query.impressions;
    } else {
      unmatchedImpressions += query.impressions;
    }
  }

  const uniqueGscQueries = queries.length;
  const totalImpressions = matchedImpressions + unmatchedImpressions;
  return {
    trackedKeywords: keywordSet.size,
    uniqueGscQueries,
    matchedQueries,
    unmatchedQueries: uniqueGscQueries - matchedQueries,
    matchedImpressions,
    unmatchedImpressions,
    queryCoveragePct:
      uniqueGscQueries > 0 ? Math.round((matchedQueries / uniqueGscQueries) * 1000) / 10 : null,
    impressionCoveragePct:
      totalImpressions > 0 ? Math.round((matchedImpressions / totalImpressions) * 1000) / 10 : null,
  };
}
