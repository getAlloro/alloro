import type {
  MarketOpportunitySummary,
} from "../../../models/MarketKeywordSearchVolumeModel";
import type { MarketKeywordCoverage } from "./coverageMetrics";
import type { MarketOpportunityConfidence } from "./confidence";

export interface MarketIntelligenceSummary extends MarketOpportunitySummary {
  coverage: MarketKeywordCoverage | null;
  confidence: MarketOpportunityConfidence;
  warnings: string[];
}
