import { type SelectedCompetitorSearchResult } from "../../api/practiceRanking";

// Type for client Google Business Profile data
interface ClientGbpData {
  totalReviewCount?: number;
  averageRating?: number;
  primaryCategory?: string;
  reviewsLast30d?: number;
  postsLast90d?: number;
  photosCount?: number;
  hasWebsite?: boolean;
  hasPhone?: boolean;
  hasHours?: boolean;
  gbpLocationId?: string;
  gbpLocationName?: string;
  performance?: {
    calls?: number;
    directions?: number;
    clicks?: number;
  };
  _raw?: {
    locations?: Array<{
      displayName?: string;
      data?: {
        performance?: {
          series?: Array<{
            dailyMetricTimeSeries?: Array<{
              dailyMetric: string;
              timeSeries?: {
                datedValues?: Array<{
                  value?: string;
                }>;
              };
            }>;
          }>;
        };
      };
    }>;
  };
}

export interface RankingResult {
  id: number;
  specialty: string;
  location: string | null;
  gbpLocationId?: string | null;
  gbpLocationName?: string | null;
  observedAt: string;
  rankScore: number | string;
  rankPosition: number;
  totalCompetitors: number;
  rankingFactors: {
    category_match: { score: number; weighted: number; weight: number };
    review_count: {
      score: number;
      weighted: number;
      weight: number;
      value?: number;
    };
    star_rating: {
      score: number;
      weighted: number;
      weight: number;
      value?: number;
    };
    keyword_name: { score: number; weighted: number; weight: number };
    review_velocity: {
      score: number;
      weighted: number;
      weight: number;
      value?: number;
    };
    nap_consistency: { score: number; weighted: number; weight: number };
    gbp_activity: {
      score: number;
      weighted: number;
      weight: number;
      value?: number;
    };
    sentiment: { score: number; weighted: number; weight: number };
  } | null;
  rawData: {
    client_gbp: ClientGbpData | null;
    competitors: Array<{
      name: string;
      rankScore: number;
      rankPosition: number;
      totalReviews: number;
      averageRating: number;
      reviewsLast30d?: number | null;
      reviewsLast90d?: number | null;
      reviewVelocitySource?: "apify" | "cache" | "not_measured" | null;
      reviewVelocityMeasuredAt?: string | null;
      primaryCategory?: string;
      // Persisted by service.ranking-pipeline.ts but only typed here once needed
      // by the cohort delta sub-lines in FactorBreakdown.
      hasKeywordInName?: boolean;
      photosCount?: number;
      postsLast90d?: number;
    }>;
    competitors_discovered?: number;
    competitors_from_cache?: boolean;
  } | null;
  llmAnalysis: {
    gaps: Array<{
      type: string;
      query_class?: string;
      area?: string;
      impact: string;
      reason: string;
    }>;
    drivers: Array<{
      factor: string;
      weight: string | number;
      direction: string;
      insight?: string;
    }>;
    render_text: string;
    client_summary?: string | null;
    one_line_summary?: string | null;
    overview_card?: {
      text?: string | null;
      highlights?: string[] | null;
    } | null;
    engagement_card?: {
      title?: string | null;
      text?: string | null;
      highlights?: string[] | null;
      sentiment?: string | null;
    } | null;
    top_recommendations?: Array<{
      priority: number;
      title: string;
      description?: string;
      expected_outcome?: string;
    }>;
    verdict: string;
    confidence: number;
  } | null;
  // Previous analysis data for trend comparison
  previousAnalysis: {
    id: number;
    observedAt: string;
    rankScore: number | string;
    rankPosition: number;
    totalCompetitors: number;
    rawData: {
      client_gbp: ClientGbpData | null;
    } | null;
  } | null;
  // Search Position fields (Practice Health + Search Position split).
  // Spec: plans/04122026-no-ticket-practice-health-search-position-split/spec.md
  searchPosition: number | null;
  searchQuery: string | null;
  searchStatus:
    | "ok"
    | "not_in_top_20"
    | "bias_unavailable"
    | "api_error"
    | null;
  searchResults: Array<{
    placeId: string;
    name: string;
    position: number;
    rating: number;
    reviewCount: number;
    primaryType: string;
    types: string[];
    isClient: boolean;
  }> | null;
  selectedCompetitorSearchResults: SelectedCompetitorSearchResult[] | null;
  searchLat: number | null;
  searchLng: number | null;
  searchRadiusMeters: number | null;
  searchCheckedAt: string | null;
  competitorDiscoveryRadiusMeters: number | null;
  // Practice Health aliases (same data as rankScore/rankPosition).
  practiceHealth: number | null;
  practiceHealthRank: number | null;
  // Source of the persisted searchPosition — used to avoid comparing samples
  // computed against different provider surfaces.
  // Spec: plans/05142026-no-ticket-serpapi-maps-rank-source/spec.md (T3)
  searchPositionSource: "serpapi_maps" | "apify_maps" | "places_text" | null;
  competitorSetRevision: number | null;
  competitorSnapshot: unknown | null;
  runReason:
    | "scheduled"
    | "manual"
    | "first_competitor_finalize"
    | "competitor_reselection"
    | "retry"
    | null;
  includeInSummaryRecommendations: boolean;
  // Previous run's Search Position data — used to gate growth arrow stability.
  previousSearchPosition: number | null;
  previousSearchQuery: string | null;
  previousSearchLat: number | null;
  previousSearchLng: number | null;
  previousSearchPositionSource:
    | "serpapi_maps"
    | "apify_maps"
    | "places_text"
    | null;
  previousObservedAt: string | null;
  // v2 curated competitor list metadata (Practice Ranking v2).
  // Spec: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
  locationId: number | null;
  competitorSource:
    | "curated"
    | "discovered_v2_pending"
    | "discovered_v1_legacy"
    | null;
  locationOnboarding: {
    status: "pending" | "curating" | "finalized";
    finalizedAt: string | null;
  } | null;
}

export interface RankingsDashboardProps {
  organizationId: number | null;
  locationId?: number | null;
}
