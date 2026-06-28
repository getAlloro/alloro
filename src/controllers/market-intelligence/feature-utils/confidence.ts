import type { MarketKeywordCoverage } from "./coverageMetrics";

export type MarketOpportunityConfidence = "high" | "medium" | "low";

export interface ConfidenceInput {
  keywordCount: number;
  nullVolumeCount: number;
  coverage: MarketKeywordCoverage | null;
}

export function scoreMarketOpportunityConfidence(input: ConfidenceInput): MarketOpportunityConfidence {
  const hasGsc = Boolean(input.coverage && input.coverage.uniqueGscQueries > 0);
  const impressionCoverage = input.coverage?.impressionCoveragePct ?? 0;
  if (input.keywordCount >= 150 && hasGsc && impressionCoverage >= 80 && input.nullVolumeCount < input.keywordCount * 0.2) {
    return "high";
  }
  if (input.keywordCount >= 75 || hasGsc) {
    return "medium";
  }
  return "low";
}
