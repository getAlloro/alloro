import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Trophy,
  AlertCircle,
  RefreshCw,
  Target,
  Settings,
  ChevronRight,
  Sparkles,
  ArrowUpDown,
} from "lucide-react";
import { getPriorityItem } from "../../hooks/useLocalStorage";
import {
  useIsWizardActive,
  useWizardDemoData,
} from "../../contexts/OnboardingWizardContext";
import { useLocationContext } from "../../contexts/locationContext";
import { CompetitorOnboardingBanner } from "./CompetitorOnboardingBanner";
import { RankingInFlightBanner } from "./RankingInFlightBanner";
import {
  getInFlightRanking,
  reselectAndRun,
  type SelectedCompetitorSearchResult,
} from "../../api/practiceRanking";
import { RankingsLoadingState } from "./rankings/RankingsLoadingState";
import { MeaningHero } from "./shared/MeaningHero";
import { DetailsModal } from "./shared/DetailsModal";
import { SectionTitle } from "./shared/SectionTitle";
import { InfoTip } from "./shared/InfoTip";
import { CompetitorComparisonSortMenu } from "./rankings/CompetitorComparisonSortMenu";
import { CompetitorComparisonTable } from "./rankings/CompetitorComparisonTable";
import { GbpAutomationPanel } from "./gbp-automation/GbpAutomationPanel";
import { GbpEngagementSummaryCard } from "./gbp-automation/GbpEngagementSummaryCard";
import {
  RankingsDashboardViewTabs,
  type RankingsDashboardView,
} from "./rankings/RankingsDashboardViewTabs";
import {
  buildCompetitorComparisonRows,
  getComparisonInsight,
  sortComparisonRows,
  type ComparisonSortKey,
} from "./rankings/competitorComparison";

type CompetitorSnapshot = {
  competitors?: Array<{
    place_id?: string | null;
    placeId?: string | null;
  }>;
};

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

interface RankingResult {
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

interface RankingsDashboardProps {
  organizationId: number | null;
  locationId?: number | null;
}

function getSelectedCompetitorPlaceIds(
  ranking: RankingResult | null,
): string[] {
  const fromSelectedResults = (ranking?.selectedCompetitorSearchResults ?? [])
    .slice()
    .sort((a, b) => a.selectedOrder - b.selectedOrder)
    .map((competitor) => competitor.placeId)
    .filter((placeId): placeId is string => Boolean(placeId));

  if (fromSelectedResults.length > 0) return fromSelectedResults;

  const snapshot = ranking?.competitorSnapshot as CompetitorSnapshot | null;
  return (snapshot?.competitors ?? [])
    .map((competitor) => competitor.place_id ?? competitor.placeId ?? null)
    .filter((placeId): placeId is string => Boolean(placeId));
}

export function RankingsDashboard({
  organizationId,
  locationId,
}: RankingsDashboardProps) {
  const navigate = useNavigate();
  const isWizardActive = useIsWizardActive();
  const { signalContentReady } = useLocationContext();
  const wizardDemoData = useWizardDemoData();
  const [loading, setLoading] = useState(true);
  const [rankings, setRankings] = useState<RankingResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshingRankings, setRefreshingRankings] = useState(false);
  const [rerankError, setRerankError] = useState<string | null>(null);
  const [dashboardView, setDashboardView] =
    useState<RankingsDashboardView>("overview");

  // In-flight ranking banner — shown when EITHER the URL carries
  // ?batchId=... (post-finalize redirect fast-path) OR the dashboard
  // auto-detects an in-flight ranking for the current org/location on mount.
  // Spec: plans/04282026-no-ticket-rankings-auto-detect-in-flight-sticky/spec.md
  const [searchParams, setSearchParams] = useSearchParams();
  const urlBatchId = searchParams.get("batchId");
  const [autoDetectedBatchId, setAutoDetectedBatchId] = useState<string | null>(
    null,
  );
  const [bannerHidden, setBannerHidden] = useState(false);
  const activeBatchId = urlBatchId || autoDetectedBatchId;

  // Skip fetching during wizard mode - use demo data instead
  useEffect(() => {
    if (isWizardActive) {
      setLoading(false);
      return;
    }
    if (organizationId) {
      fetchLatestRankings();
    } else {
      setLoading(false);
    }
  }, [organizationId, locationId, isWizardActive]);

  // Stable callbacks for the in-flight banner. setSearchParams is stable per
  // react-router; we don't include fetchLatestRankings in deps because it's
  // declared fresh each render — the latest closure is captured at call time
  // since handleBatchComplete is invoked, not memoized over.
  const handleBatchComplete = useCallback(() => {
    setSearchParams((p) => {
      const next = new URLSearchParams(p);
      next.delete("batchId");
      return next;
    });
    setAutoDetectedBatchId(null);
    setBannerHidden(true);
    if (organizationId) fetchLatestRankings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSearchParams, organizationId]);

  const handleBatchDismiss = useCallback(() => {
    setSearchParams((p) => {
      const next = new URLSearchParams(p);
      next.delete("batchId");
      return next;
    });
    setAutoDetectedBatchId(null);
    setBannerHidden(true);
  }, [setSearchParams]);

  // A batch belongs to one location. When the user switches locations, clear
  // any banner state seeded by the prior location (auto-detected batchId, the
  // ?batchId= URL param from a finalize redirect, and the dismiss flag) so
  // the new location renders its own state cleanly. Gated by a ref so the
  // initial mount preserves a fresh ?batchId= from the finalize redirect.
  const prevLocationIdRef = useRef(locationId);
  useEffect(() => {
    if (prevLocationIdRef.current === locationId) return;
    prevLocationIdRef.current = locationId;
    setAutoDetectedBatchId(null);
    setBannerHidden(false);
    setSearchParams((p) => {
      if (!p.has("batchId")) return p;
      const next = new URLSearchParams(p);
      next.delete("batchId");
      return next;
    });
  }, [locationId, setSearchParams]);

  // Auto-detect an in-flight ranking on mount when the URL doesn't already
  // carry a batchId. Single fetch — once a banner is mounted it polls itself.
  useEffect(() => {
    if (urlBatchId) return; // URL fast-path takes precedence
    if (!organizationId) return;
    if (isWizardActive) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getInFlightRanking(organizationId, locationId);
        if (cancelled) return;
        if (res?.success && res.ranking?.batchId) {
          setAutoDetectedBatchId(res.ranking.batchId);
          setBannerHidden(false);
        }
      } catch {
        /* silent — banner just doesn't appear */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, locationId, urlBatchId, isWizardActive]);

  const fetchLatestRankings = async () => {
    try {
      setLoading(true);
      const token = getPriorityItem("token");

      // Fetch the latest rankings for all locations of this google account
      const response = await fetch(
        `/api/practice-ranking/latest?googleAccountId=${organizationId}${locationId ? `&locationId=${locationId}` : ""}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!response.ok) {
        if (response.status === 404) {
          // No ranking found yet
          setRankings([]);
          return;
        }
        throw new Error("Failed to fetch ranking data");
      }

      const data = await response.json();
      // Handle both old format (single ranking) and new format (rankings array)
      if (data.rankings && Array.isArray(data.rankings)) {
        setRankings(data.rankings);
      } else if (data.ranking) {
        // Legacy single ranking format
        setRankings([data.ranking]);
      }
    } catch (err) {
      console.error("Error fetching rankings:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load ranking data",
      );
    } finally {
      setLoading(false);
      signalContentReady();
    }
  };

  if (loading && !isWizardActive) {
    return <RankingsLoadingState />;
  }

  // When wizard is active, bypass error/empty checks and use demo data
  if (error && !isWizardActive) {
    return (
      <div className="min-h-screen bg-alloro-bg font-body flex items-center justify-center py-16">
        <div className="text-center max-w-md bg-white rounded-2xl border border-slate-200 shadow-premium p-10">
          <div className="p-4 bg-red-50 rounded-2xl w-fit mx-auto mb-4">
            <AlertCircle className="h-10 w-10 text-red-500" />
          </div>
          <h3 className="font-display text-xl font-medium text-alloro-navy mb-2 tracking-tight">
            Unable to Load Rankings
          </h3>
          <p className="text-slate-500 text-sm font-bold mb-6">{error}</p>
          <button
            onClick={fetchLatestRankings}
            className="px-6 py-3 bg-alloro-orange text-white rounded-xl hover:bg-blue-700 transition-colors font-black text-sm flex items-center gap-2 mx-auto uppercase tracking-widest"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!organizationId && !isWizardActive) {
    return (
      <div className="min-h-screen bg-alloro-bg font-body flex items-center justify-center py-16">
        <div className="text-center max-w-md bg-white rounded-2xl border border-slate-200 shadow-premium p-10">
          <div className="p-4 bg-slate-100 rounded-2xl w-fit mx-auto mb-4">
            <Trophy className="h-10 w-10 text-slate-400" />
          </div>
          <h3 className="font-display text-xl font-medium text-alloro-navy mb-2 tracking-tight">
            No Account Connected
          </h3>
          <p className="text-slate-500 text-sm font-bold">
            Please connect your Google account to view ranking data.
          </p>
        </div>
      </div>
    );
  }

  if (rankings.length === 0 && !isWizardActive) {
    return (
      <div className="min-h-screen bg-alloro-bg font-body flex items-center justify-center py-16 px-6">
        <div className="max-w-xl w-full">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-alloro-orange/10 rounded-full mb-4">
              <Sparkles className="w-4 h-4 text-alloro-orange" />
              <span className="text-xs font-bold text-alloro-orange uppercase tracking-wider">
                Almost There
              </span>
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-medium text-alloro-navy tracking-tight mb-3">
              Local Rankings Coming Soon
            </h1>
            <p className="text-base text-slate-500 font-medium max-w-md mx-auto">
              We're preparing your competitive analysis. Make sure your Google
              Business Profile is connected to get started.
            </p>
          </div>

          {/* Action Card */}
          <div
            onClick={() => navigate("/settings/integrations")}
            className="group bg-white rounded-[14px] border-2 border-alloro-orange shadow-xl shadow-alloro-orange/10 p-8 cursor-pointer hover:shadow-2xl hover:shadow-alloro-orange/20 transition-all duration-300 hover:-translate-y-1"
          >
            <div className="flex items-start gap-6">
              <div className="shrink-0">
                <div className="w-14 h-14 bg-gradient-to-br from-alloro-orange to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-alloro-orange/30 group-hover:scale-110 transition-transform">
                  <Target className="w-7 h-7 text-white" />
                </div>
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-xl font-black text-alloro-navy tracking-tight mb-2">
                  Connect Your Google Business Profile
                </h3>
                <p className="text-slate-500 font-medium leading-relaxed mb-4">
                  Link your Google Business Profile to unlock local ranking insights, competitor
                  analysis, and visibility tracking.
                </p>
                <div className="flex items-center gap-2 text-alloro-orange font-bold text-sm group-hover:gap-3 transition-all">
                  <Settings className="w-4 h-4" />
                  <span>Go to Settings</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>

          {/* Help text */}
          <p className="text-center text-sm text-slate-400 mt-6">
            Already connected? Rankings typically appear within 24 hours.
          </p>
        </div>
      </div>
    );
  }

  // Create demo ranking for wizard mode
  const demoRanking: RankingResult | null =
    isWizardActive && wizardDemoData
      ? {
          id: 1,
          specialty: "Orthodontics",
          location: "San Francisco, CA",
          gbpLocationId: "demo-location",
          gbpLocationName: wizardDemoData.rankingData[0].locationName,
          observedAt: new Date().toISOString(),
          rankScore: 78,
          rankPosition: wizardDemoData.rankingData[0].rank,
          totalCompetitors: wizardDemoData.rankingData[0].totalCompetitors,
          rankingFactors: {
            category_match: { score: 85, weighted: 12.75, weight: 15 },
            review_count: {
              score: 72,
              weighted: 14.4,
              weight: 20,
              value: wizardDemoData.rankingData[0].reviews,
            },
            star_rating: {
              score: 96,
              weighted: 14.4,
              weight: 15,
              value: wizardDemoData.rankingData[0].rating,
            },
            keyword_name: { score: 80, weighted: 8, weight: 10 },
            review_velocity: {
              score: 65,
              weighted: 9.75,
              weight: 15,
              value: 8,
            },
            nap_consistency: { score: 90, weighted: 9, weight: 10 },
            gbp_activity: { score: 70, weighted: 7, weight: 10, value: 12 },
            sentiment: { score: 88, weighted: 4.4, weight: 5 },
          },
          rawData: {
            client_gbp: {
              totalReviewCount: wizardDemoData.rankingData[0].reviews,
              averageRating: wizardDemoData.rankingData[0].rating,
              primaryCategory: "Orthodontist",
              reviewsLast30d: 8,
              postsLast90d: 5,
              photosCount: 24,
              hasWebsite: true,
              hasPhone: true,
              hasHours: true,
            },
            competitors: [
              {
                name: "Smile Orthodontics",
                rankScore: 82,
                rankPosition: 1,
                totalReviews: 156,
                averageRating: 4.9,
                reviewsLast30d: 12,
                primaryCategory: "Orthodontist",
                hasKeywordInName: true,
                photosCount: 38,
                postsLast90d: 0,
              },
              {
                name: "Perfect Teeth Ortho",
                rankScore: 80,
                rankPosition: 2,
                totalReviews: 134,
                averageRating: 4.7,
                reviewsLast30d: 9,
                primaryCategory: "Orthodontist",
                hasKeywordInName: true,
                photosCount: 22,
                postsLast90d: 0,
              },
              {
                name: "City Orthodontics",
                rankScore: 75,
                rankPosition: 4,
                totalReviews: 98,
                averageRating: 4.6,
                reviewsLast30d: 5,
                primaryCategory: "Dentist",
                hasKeywordInName: true,
                photosCount: 14,
                postsLast90d: 0,
              },
            ],
          },
          llmAnalysis: {
            gaps: [
              {
                type: "review_velocity",
                impact: "medium",
                reason: "Your review velocity is below competitors",
              },
            ],
            drivers: [
              { factor: "Star Rating", weight: "15%", direction: "positive" },
              { factor: "Review Count", weight: "20%", direction: "positive" },
            ],
            render_text:
              "Your practice is performing well but has room for improvement in review velocity.",
            verdict: "Good standing with growth opportunities",
            confidence: 85,
            top_recommendations: [
              {
                priority: 1,
                title: "Increase review requests",
                description:
                  "Send review requests to recent patients to boost velocity",
              },
              {
                priority: 2,
                title: "Post more Google updates",
                description:
                  "Increase posting frequency to improve Google profile activity score",
              },
            ],
          },
          previousAnalysis: null,
          // Search Position fields — wizard demo data so the new sections render
          // with realistic content during the onboarding tour.
          searchPosition: wizardDemoData.rankingData[0].rank,
          searchQuery: "orthodontist in San Francisco, CA",
          searchStatus: "ok",
          searchResults: [
            {
              placeId: "demo-1",
              name: "Smile Orthodontics",
              position: 1,
              rating: 4.9,
              reviewCount: 156,
              primaryType: "orthodontist",
              types: ["orthodontist", "dentist"],
              isClient: false,
            },
            {
              placeId: "demo-2",
              name: "Perfect Teeth Ortho",
              position: 2,
              rating: 4.7,
              reviewCount: 134,
              primaryType: "orthodontist",
              types: ["orthodontist", "dentist"],
              isClient: false,
            },
            {
              placeId: "demo-client",
              name: wizardDemoData.rankingData[0].locationName,
              position: wizardDemoData.rankingData[0].rank,
              rating: wizardDemoData.rankingData[0].rating,
              reviewCount: wizardDemoData.rankingData[0].reviews,
              primaryType: "orthodontist",
              types: ["orthodontist", "dentist"],
              isClient: true,
            },
            {
              placeId: "demo-3",
              name: "City Orthodontics",
              position: 4,
              rating: 4.6,
              reviewCount: 98,
              primaryType: "orthodontist",
              types: ["orthodontist", "dentist"],
              isClient: false,
            },
          ],
          selectedCompetitorSearchResults: [
            {
              placeId: "demo-1",
              name: "Smile Orthodontics",
              address: "125 Market St, San Francisco, CA 94105",
              position: 1,
              status: "measured",
              rating: 4.9,
              reviewCount: 156,
              primaryType: "orthodontist",
              discoveryPosition: 1,
              distanceMiles: 1.4,
              profileStrengthScore: 92,
              profileStrengthTier: "strong",
              selectedOrder: 1,
            },
            {
              placeId: "demo-2",
              name: "Perfect Teeth Ortho",
              address: "410 Mission Bay Blvd, San Francisco, CA 94158",
              position: 2,
              status: "measured",
              rating: 4.7,
              reviewCount: 134,
              primaryType: "orthodontist",
              discoveryPosition: 2,
              distanceMiles: 2.1,
              profileStrengthScore: 81,
              profileStrengthTier: "strong",
              selectedOrder: 2,
            },
          ],
          searchLat: 37.7749,
          searchLng: -122.4194,
          searchRadiusMeters: 40234,
          searchCheckedAt: new Date().toISOString(),
          competitorDiscoveryRadiusMeters: 40234,
          searchPositionSource: "serpapi_maps",
          competitorSetRevision: 1,
          competitorSnapshot: null,
          runReason: "manual",
          includeInSummaryRecommendations: true,
          practiceHealth: 78,
          practiceHealthRank: wizardDemoData.rankingData[0].rank,
          previousSearchPosition: null,
          previousSearchQuery: null,
          previousSearchLat: null,
          previousSearchLng: null,
          previousSearchPositionSource: null,
          previousObservedAt: null,
          locationId: null,
          competitorSource: "curated",
          locationOnboarding: { status: "finalized", finalizedAt: null },
        }
      : null;

  // Use demo ranking when wizard is active and no real data, otherwise use real data
  const effectiveRankings =
    isWizardActive && wizardDemoData && rankings.length === 0
      ? [demoRanking!]
      : rankings;

  // Use the first ranking (backend filters by locationId)
  const selectedRanking = effectiveRankings[0] || null;
  const selectedInsight =
    selectedRanking?.llmAnalysis?.overview_card?.text ||
    selectedRanking?.llmAnalysis?.one_line_summary ||
    selectedRanking?.llmAnalysis?.client_summary ||
    null;
  const selectedGbpAutomationLocationId =
    selectedRanking?.locationId || locationId || null;
  const selectedCompetitorPlaceIds = getSelectedCompetitorPlaceIds(
    selectedRanking,
  );
  const canRefreshRankings =
    Boolean(selectedRanking?.locationId) && selectedCompetitorPlaceIds.length > 0;

  async function handleRefreshRankings() {
    if (!selectedRanking?.locationId || selectedCompetitorPlaceIds.length === 0) {
      setRerankError("No selected competitors are available for this location.");
      return;
    }

    setRefreshingRankings(true);
    setRerankError(null);
    try {
      const res = await reselectAndRun(
        selectedRanking.locationId,
        selectedCompetitorPlaceIds,
        selectedRanking.competitorDiscoveryRadiusMeters ?? undefined,
      );
      if (!res?.success) {
        setRerankError("Could not refresh rankings. Please try again.");
        return;
      }
      setAutoDetectedBatchId(null);
      setBannerHidden(false);
      setSearchParams((p) => {
        const next = new URLSearchParams(p);
        next.set("batchId", res.batchId);
        return next;
      });
    } catch {
      setRerankError("Could not refresh rankings. Please try again.");
    } finally {
      setRefreshingRankings(false);
    }
  }

  return (
    <div className="min-h-screen bg-alloro-bg font-body text-alloro-textDark pb-32 selection:bg-alloro-orange selection:text-white">
      <main className="w-full max-w-[1320px] mx-auto px-6 lg:px-10 py-8 lg:py-10 space-y-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-alloro-navy/45 mb-2">
              Local visibility
            </div>
            <h1 className="font-display text-[28px] font-medium tracking-tight text-alloro-navy">
              Local Rankings
            </h1>
            <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-alloro-navy/55">
              Your local search estimate, closest competitors, and the next action to take.
            </p>
          </div>

          {selectedRanking?.locationId && (
            <div className="flex flex-col gap-3 rounded-[14px] border border-line-soft bg-white px-5 py-3.5 shadow-premium lg:min-w-[560px]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Update location
                  </span>
                  <p className="truncate text-[12px] font-semibold text-alloro-navy/55">
                    Refresh local search data.
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={handleRefreshRankings}
                    disabled={!canRefreshRankings || refreshingRankings}
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] bg-alloro-orange px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-alloro-orange/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw
                      size={13}
                      className={refreshingRankings ? "animate-spin" : ""}
                    />
                    {refreshingRankings ? "Refreshing" : "Refresh rankings"}
                  </button>
                </div>
              </div>
              {rerankError && (
                <p className="flex items-center gap-2 text-[11px] font-bold text-red-600">
                  <AlertCircle size={13} />
                  {rerankError}
                </p>
              )}
            </div>
          )}
        </div>

        <RankingsDashboardViewTabs
          activeView={dashboardView}
          onViewChange={setDashboardView}
        />

        {dashboardView === "overview" ? (
          <>
            {/* In-flight ranking progress banner — auto-detected on mount or
                seeded from ?batchId= in the URL. Sticks to the viewport top so it
                stays visible while the user scrolls the dashboard. */}
            {activeBatchId && !bannerHidden && (
              <div className="sticky top-4 z-30 -mx-2 px-2">
                <RankingInFlightBanner
                  batchId={activeBatchId}
                  onComplete={handleBatchComplete}
                  onDismiss={handleBatchDismiss}
                />
              </div>
            )}

            {/* v2 Competitor onboarding banner — slim row, shown for pending/curating
                locations. Sits above the client summary so the action prompt is the
                first thing visible. Final-state locations render normally. */}
            {selectedRanking?.locationId &&
              selectedRanking.locationOnboarding &&
              (selectedRanking.locationOnboarding.status === "pending" ||
                selectedRanking.locationOnboarding.status === "curating") && (
                <CompetitorOnboardingBanner
                  locationId={selectedRanking.locationId}
                  locationName={selectedRanking.gbpLocationName}
                  status={selectedRanking.locationOnboarding.status}
                />
              )}

            {/* Selected Location Detail */}
            {selectedRanking && (
              <PerformanceDashboard
                result={selectedRanking}
                insight={selectedInsight || undefined}
                onOpenEngage={() => setDashboardView("engage")}
                engagementSummary={
                  <GbpEngagementSummaryCard
                    agentContent={selectedRanking.llmAnalysis?.engagement_card ?? null}
                    organizationId={organizationId}
                    locationId={selectedGbpAutomationLocationId}
                    onOpenEngage={() => setDashboardView("engage")}
                  />
                }
              />
            )}
          </>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <GbpAutomationPanel
              organizationId={organizationId}
              locationId={selectedGbpAutomationLocationId}
            />
          </div>
        )}
      </main>
    </div>
  );
}

function SearchPositionSection({ result }: { result: RankingResult }) {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<ComparisonSortKey>("mapsPosition");
  const rows = useMemo(() => buildCompetitorComparisonRows(result), [result]);
  const sortedRows = useMemo(
    () => sortComparisonRows(rows, sortKey),
    [rows, sortKey],
  );
  const insight = useMemo(
    () => getComparisonInsight(rows, sortKey),
    [rows, sortKey],
  );
  const accent = "#D66853";

  return (
    <section
      data-wizard-target="rankings-competitors"
      className="bg-white border border-line-soft rounded-[14px] shadow-premium overflow-hidden"
    >
      <header className="px-6 lg:px-7 py-4 flex items-center justify-between border-b border-line-soft gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: accent }}
          />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <SectionTitle>
                Your competitors on Local Search
              </SectionTitle>
              <InfoTip
                content="These are the competitors in your saved comparison set, shown with their latest sampled local search position when available. Your practice is included so the table can be sorted against the same metrics."
              />
            </div>
          </div>
        </div>
      </header>
      <div className="px-6 py-5 lg:px-7">
        <div className="mb-4 flex flex-col gap-3 rounded-[12px] border border-line-soft bg-[#F7F5F1] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-alloro-orange/10 text-alloro-orange">
              <ArrowUpDown size={18} />
            </div>
            <p className="text-[13px] font-semibold leading-relaxed text-alloro-navy/70">
              {insight}
            </p>
          </div>
          <CompetitorComparisonSortMenu value={sortKey} onChange={setSortKey} />
        </div>
        <div className="overflow-hidden rounded-[12px] border border-line-soft bg-white">
          <CompetitorComparisonTable
            rows={sortedRows}
            sortKey={sortKey}
            onSort={setSortKey}
          />
        </div>
        {result.locationId && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() =>
                navigate(
                  `/dashboard/competitors/${result.locationId}/onboarding?mode=reselect`,
                )
              }
              className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-alloro-navy px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-alloro-navy/90 focus:outline-none focus:ring-2 focus:ring-alloro-orange/35"
            >
              <Settings size={13} />
              Manage competitors
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Rankings redesign primitives
   Spec: plans/04282026-no-ticket-rankings-page-redesign/spec.md (T2)
   ───────────────────────────────────────────────────────────── */

const FACTOR_LABEL: Record<string, string> = {
  category_match: "Category match",
  review_count: "Review count",
  star_rating: "Star rating",
  keyword_name: "Keyword in name",
  review_velocity: "Review velocity",
  nap_consistency: "NAP consistency",
  gbp_activity: "Google profile activity",
  sentiment: "Review sentiment",
};

const FACTOR_TOOLTIP: Record<string, string> = {
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

function Slug({
  children,
  color = "#11151C",
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <span
      className="font-mono-display text-[10px] font-bold uppercase tracking-[0.18em]"
      style={{ color }}
    >
      {children}
    </span>
  );
}

/**
 * rankingFactors values arrive as 0..1 fractions in production (e.g. `score:
 * 0.92`, `weight: 0.25`) but the wizard demo + the original redesign mock use
 * 0..100. Normalize defensively so both shapes render correctly.
 */
function normalizeFactorPct(v: number | string | undefined): number {
  if (v === undefined || v === null) return 0;
  const n = typeof v === "string" ? parseFloat(v.replace("%", "")) : v;
  if (Number.isNaN(n)) return 0;
  return n > 1 ? n : n * 100;
}

function StarIcon({ size = 12, filled = true }: { size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path
        d="M10 1.5l2.6 5.46 6.02.7-4.43 4.18 1.13 5.94L10 14.93 4.68 17.78l1.13-5.94L1.38 7.66l6.02-.7L10 1.5z"
        fill={filled ? "var(--color-amber)" : "rgba(17,21,28,0.18)"}
      />
    </svg>
  );
}

function Delta({
  delta,
  lowerIsBetter = false,
  suffix = "",
}: {
  delta: number | null | undefined;
  lowerIsBetter?: boolean;
  suffix?: string;
}) {
  if (delta === 0 || delta === null || delta === undefined) {
    return (
      <span className="text-[10px] font-bold text-alloro-navy/30 tabular-nums">—</span>
    );
  }
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  const arrow = improved ? "▲" : "▼";
  const color = improved ? "#22c55e" : "#ef4444";
  const bg = improved ? "var(--color-success-soft)" : "var(--color-danger-soft)";
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums"
      style={{ color, background: bg }}
    >
      <span style={{ fontSize: 9 }}>{arrow}</span>
      {Math.abs(delta)}
      {suffix}
    </span>
  );
}

/**
 * Half-arc gauge — single value /100, optional prev for an inline delta badge
 * shown next to the score. Header label is owned by the consuming card so we
 * don't duplicate "Practice Health" inside + outside the gauge.
 */
function HealthGauge({
  value,
  prev,
  compact = false,
}: {
  value: number;
  prev?: number | null;
  compact?: boolean;
}) {
  const v = Math.max(0, Math.min(100, value));
  const pathProgress = v / 100;
  const tone = v >= 80 ? "#22c55e" : v >= 60 ? "#D66853" : "#ef4444";
  const delta =
    prev !== null && prev !== undefined ? Math.round(value - prev) : null;
  const width = compact ? 140 : 210;
  const height = compact ? 82 : 124;

  return (
    <div className="flex flex-col items-center text-center">
      <svg width={width} height={height} viewBox="0 0 180 106" className="overflow-visible">
        <path
          d="M 26 90 A 64 64 0 0 1 154 90"
          fill="none"
          stroke="rgba(17,21,28,0.08)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <motion.path
          d="M 26 90 A 64 64 0 0 1 154 90"
          fill="none"
          stroke={tone}
          strokeWidth="14"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: pathProgress }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
        <text
          x="90"
          y="76"
          textAnchor="middle"
          fontFamily="Spectral, Literata, Georgia, serif"
          fontWeight="500"
          fontSize="34"
          fill="#11151C"
          className="tabular-nums"
        >
          {Math.round(v)}
        </text>
        <text
          x="90"
          y="96"
          textAnchor="middle"
          fontFamily="JetBrains Mono"
          fontSize="10"
          letterSpacing="0.16em"
          fill="rgba(17,21,28,0.4)"
        >
          / 100
        </text>
      </svg>
      {delta !== null && (
        <div className="mt-2">
          <Delta delta={delta} />
        </div>
      )}
    </div>
  );
}

function ScoreCardCtas({
  onOpenScoreDetails,
  onOpenGaps,
  score,
}: {
  onOpenScoreDetails: () => void;
  onOpenGaps: () => void;
  score: number;
}) {
  const actions = [
    { label: `Why you scored ${Math.round(score)}/100`, onClick: onOpenScoreDetails },
    { label: "How to close the gap", onClick: onOpenGaps },
  ];

  return (
    <div className="grid grid-cols-1 gap-2">
      {actions.map((action) => (
        <motion.button
          key={action.label}
          type="button"
          onClick={action.onClick}
          className="inline-flex min-h-[44px] w-full items-center justify-between gap-2 rounded-[10px] border border-line-soft bg-white px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-[0.1em] text-alloro-navy/70 transition-colors hover:border-alloro-orange/25 hover:bg-alloro-orange/10 hover:text-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -1 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          {action.label}
          <ChevronRight size={14} />
        </motion.button>
      ))}
    </div>
  );
}

function LocalSearchEstimateSummary({
  result,
  marketAvgRating,
}: {
  result: RankingResult;
  marketAvgRating: number;
}) {
  const status = result.searchStatus ?? "ok";
  const rank = result.searchPosition;
  const accent = "#D66853";
  const rankColor =
    rank !== null && rank <= 3
      ? accent
      : rank !== null && rank <= 10
        ? "#11151C"
        : "rgba(17,21,28,0.45)";

  const clientGbp = result.rawData?.client_gbp ?? null;
  const avgRating = clientGbp?.averageRating ?? null;
  const reviewCount = clientGbp?.totalReviewCount ?? null;
  const reviewsLast30d = clientGbp?.reviewsLast30d ?? 0;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: accent }}
          />
          <SectionTitle>Local Search Estimate</SectionTitle>
          <InfoTip content="This is a sampled Google Maps result gathered through SerpAPI. It can vary by device, prior searches, and the searcher's exact physical location, so use it as a directional read." />
        </div>
      </div>

      {status === "ok" && rank !== null && (
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="leading-[0.85]">
              <span
                className="font-display text-[74px] font-medium tracking-tight tabular-nums lg:text-[92px]"
                style={{ color: rankColor, lineHeight: 0.85 }}
              >
                #{rank}
              </span>
            </div>

            <div className="min-w-0 pb-2">
              <p className="text-[13px] font-medium leading-relaxed text-alloro-navy/70">
                for{" "}
                <span className="font-bold text-alloro-navy">
                  {result.searchQuery ?? "your tracked search"}
                </span>
              </p>
              <p className="mt-1 text-[12px] font-semibold leading-relaxed text-alloro-navy/45">
                This is the position patients are most likely to notice first.
              </p>
            </div>
          </div>

          <div className="grid max-w-[300px] grid-cols-2 gap-4 border-t border-[#EDE5C0] pt-4 sm:min-w-[270px] lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <Metric
              label="Star rating"
              value={avgRating !== null ? avgRating.toFixed(1) : "-"}
              adornment={<StarIcon size={14} />}
              sub={`Market avg ${marketAvgRating.toFixed(1)}`}
            />
            <Metric
              label="Reviews"
              value={reviewCount !== null ? reviewCount.toLocaleString() : "-"}
              sub={`+${reviewsLast30d} in 30d`}
            />
          </div>
        </div>
      )}

      {status === "not_in_top_20" && (
        <div className="flex flex-col gap-2 py-2">
          <span className="font-display text-3xl font-medium tracking-tight text-alloro-navy/50 lg:text-4xl">
            Not ranked in top 20
          </span>
          <p className="max-w-[48ch] text-sm font-medium leading-relaxed text-alloro-navy/65">
            for{" "}
            <span className="font-bold text-alloro-navy">
              {result.searchQuery ?? "your tracked search"}
            </span>
            . The score details below show which signals need work.
          </p>
        </div>
      )}

      {status === "bias_unavailable" && (
        <div className="flex flex-col gap-2 py-2">
          <span className="font-display text-3xl font-medium tracking-tight text-alloro-navy/50 lg:text-4xl">
            Couldn't locate your practice on Google
          </span>
          <p className="max-w-[48ch] text-sm font-medium leading-relaxed text-alloro-navy/65">
            Check that your Google profile is connected and has a valid address.{" "}
            <a
              href="/settings"
              className="font-bold underline underline-offset-4"
              style={{ color: accent }}
            >
              Open settings →
            </a>
          </p>
        </div>
      )}

      {status === "api_error" && (
        <div className="flex flex-col gap-2 py-2">
          <span className="font-display text-3xl font-medium tracking-tight text-alloro-navy/50 lg:text-4xl">
            Google search temporarily unavailable
          </span>
          <p className="max-w-[48ch] text-sm font-medium leading-relaxed text-alloro-navy/65">
            We'll try again on your next refresh.
          </p>
        </div>
      )}
    </div>
  );
}

function getComparablePreviousScore(result: RankingResult): number | null {
  void result;
  // The main overview gauge now uses the owner-visible 8-factor score from
  // rankingFactors. Previous rows expose only the persisted 6-factor
  // competitive score through previousAnalysis, so showing a delta here would
  // compare different score bases.
  return null;
}

function getOwnerVisibleScore(result: RankingResult): number {
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

function normalizeNarrativeScoreText(text: string, score: number): string {
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

function getPracticeDisplayName(result: RankingResult): string {
  return (
    result.gbpLocationName?.trim() ||
    result.rawData?.client_gbp?.gbpLocationName?.trim() ||
    result.location?.trim() ||
    "This location"
  );
}

function getOverviewRecommendedAction(result: RankingResult): string {
  const recommendations =
    result.llmAnalysis?.top_recommendations?.map((rec) =>
      `${rec.title} ${rec.description ?? ""}`.toLowerCase(),
    ) ?? [];

  if (recommendations.some((rec) => rec.includes("post"))) {
    return "Start posting to Google Business Profile weekly to protect the lead";
  }

  if (recommendations.some((rec) => rec.includes("review"))) {
    return "Reply to unanswered Google reviews to strengthen the profile";
  }

  if (recommendations.some((rec) => rec.includes("photo"))) {
    return "Add fresh Google Business Profile photos to strengthen the profile";
  }

  return "Start posting to Google Business Profile weekly to protect the lead";
}

function getStructuredOverviewInsight(
  result: RankingResult,
  score: number,
): string {
  const rankLabel =
    (result.searchStatus ?? "ok") === "ok" && result.searchPosition
      ? `#${result.searchPosition}`
      : "tracked";
  const rankTone = result.searchPosition === 1 ? "dominant" : "current";
  const roundedScore = Math.round(score);

  return `${getPracticeDisplayName(result)} holds a ${rankTone} ${rankLabel} Local Search Ranking with a ${roundedScore} Alloro Health Score. Recommended Action: ${getOverviewRecommendedAction(result)}.`;
}

function getOverviewDisplayInsight(
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

function getOverviewDisplayHighlights(
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

function getOverviewFallbackInsight(result: RankingResult): string {
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

function Metric({
  label,
  value,
  sub,
  adornment,
}: {
  label: string;
  value: string;
  sub?: string;
  adornment?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Slug color="rgba(17,21,28,0.4)">{label}</Slug>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-[28px] font-medium tabular-nums leading-none">
          {value}
        </span>
        {adornment}
      </div>
      {sub && (
        <span className="text-[11px] font-semibold text-alloro-navy/45 tabular-nums">
          {sub}
        </span>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   DriversPanel — split <details> accordion (T5)
   ───────────────────────────────────────────────────────────── */
function DriversPanel({
  result,
  embedded = false,
}: {
  result: RankingResult;
  embedded?: boolean;
}) {
  const drivers = result.llmAnalysis?.drivers ?? [];
  if (drivers.length === 0) return null;
  const positives = drivers.filter((d) => d.direction === "positive");
  const negatives = drivers.filter((d) => d.direction !== "positive");

  return (
    <section
      data-wizard-target="rankings-factors"
      className={`bg-white border border-line-soft rounded-[14px] overflow-hidden ${
        embedded ? "" : "shadow-premium"
      }`}
    >
      {!embedded && (
        <header className="px-6 lg:px-7 py-4 flex items-center justify-between border-b border-line-soft gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: "#11151C" }}
            />
            <SectionTitle>Score details</SectionTitle>
            <InfoTip content="The visibility signals helping or hurting your local search estimate. Green is working for you; red needs attention. Click a factor for the specific insight." />
          </div>
          <span className="font-mono-display text-[10px] tracking-widest text-alloro-navy/40 uppercase shrink-0">
            {drivers.length} factors
          </span>
        </header>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2">
        <DriversColumn title="Working for you" tone="positive" drivers={positives} />
        <div className="border-t md:border-t-0 md:border-l border-line-soft">
          <DriversColumn title="Holding you back" tone="negative" drivers={negatives} />
        </div>
      </div>
    </section>
  );
}

function DriversColumn({
  title,
  tone,
  drivers,
}: {
  title: string;
  tone: "positive" | "negative";
  drivers: Array<{
    factor: string;
    weight: string | number;
    direction: string;
    insight?: string;
  }>;
}) {
  const isPos = tone === "positive";
  return (
    <div>
      <div className="px-6 lg:px-7 pt-5 pb-3 flex items-center gap-2">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full"
          style={{ background: isPos ? "#22c55e" : "#ef4444" }}
        />
        <span className="text-[12px] font-extrabold tracking-tight text-alloro-navy">
          {title}
        </span>
        <span className="ml-auto font-mono-display text-[10px] uppercase tracking-widest text-alloro-navy/35 tabular-nums">
          {drivers.length}
        </span>
      </div>
      {drivers.length === 0 ? (
        <p className="px-6 lg:px-7 pb-5 text-[12.5px] text-alloro-navy/40 italic">
          None identified.
        </p>
      ) : (
        <ul className="px-3 lg:px-4 pb-3">
          {drivers.map((d, i) => (
            <li key={i}>
              <details className="group rounded-xl px-3 lg:px-4 py-3 hover:bg-[rgba(17,21,28,0.025)] transition-colors">
                <summary className="flex items-center gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    className="shrink-0 text-alloro-navy/35 transition-transform group-open:rotate-90"
                    aria-hidden
                  >
                    <path
                      d="M3 1l4 4-4 4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="text-[13px] font-bold flex-1 truncate text-alloro-navy">
                    {FACTOR_LABEL[d.factor] ||
                      d.factor.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </span>
                  <span className="font-mono-display text-[10px] tracking-widest text-alloro-navy/40 tabular-nums shrink-0">
                    weight {Math.round(normalizeFactorPct(d.weight))}
                  </span>
                </summary>
                {d.insight && (
                  <p className="mt-2 ml-[22px] text-[12.5px] leading-relaxed text-alloro-navy/70 max-w-[58ch]">
                    {d.insight}
                  </p>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Compute a cohort-comparison sub-line for a factor row. Returns null when
 * comparison data isn't available — gbp_activity, nap_consistency, and
 * sentiment fall here because the per-competitor data we collect either
 * doesn't exist (NAP, sentiment) or is unreliable (postsLast90d is always 0
 * in production — see service.apify.ts where Apify can't fetch Google posts).
 */
function computeCohortDelta(
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

/* ─────────────────────────────────────────────────────────────
   FactorBreakdown — horizontal weighted bar list (T6)
   ───────────────────────────────────────────────────────────── */
function FactorBreakdown({
  result,
  embedded = false,
}: {
  result: RankingResult;
  embedded?: boolean;
}) {
  const f = result.rankingFactors;
  if (!f) return null;
  const accent = "#D66853";
  const rows = Object.entries(f)
    .map(([k, v]) => ({ key: k, ...v }))
    .sort((a, b) => b.weighted - a.weighted);

  return (
    <section
      className={`bg-white border border-line-soft rounded-[14px] overflow-hidden ${
        embedded ? "" : "shadow-premium"
      }`}
    >
      <header className="px-6 lg:px-7 py-4 flex items-center justify-between border-b border-line-soft gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: "#11151C" }}
          />
          <SectionTitle>Score factor breakdown</SectionTitle>
          <InfoTip content="Each visibility factor's score and impact. Where data is available, each row shows your value and the competitor median for comparison." />
        </div>
        <span className="font-mono-display text-[10px] tracking-widest text-alloro-navy/40 uppercase shrink-0">
          score impact
        </span>
      </header>
      <ul className="px-6 lg:px-7 py-5 space-y-4">
        {rows.map((row, idx) => {
          const pct = Math.max(0, Math.min(100, normalizeFactorPct(row.score)));
          const weightPct = Math.round(normalizeFactorPct(row.weight));
          const tone = pct >= 80 ? "#22c55e" : pct >= 60 ? accent : "#ef4444";
          const tooltip = FACTOR_TOOLTIP[row.key];
          const delta = computeCohortDelta(row.key, result);
          // Section card has overflow-hidden, so a downward tooltip on the
          // bottom row gets clipped — flip it upward.
          const tipPlacement = idx === rows.length - 1 ? "top" : "bottom";
          return (
            <li
              key={row.key}
              className="grid grid-cols-[140px_1fr_60px_60px] sm:grid-cols-[180px_1fr_60px_60px] items-start gap-x-4 gap-y-1.5"
            >
              <span className="flex items-center gap-1.5 min-w-0 pt-0.5">
                {tooltip && (
                  <InfoTip
                    content={tooltip}
                    align="left"
                    placement={tipPlacement}
                  />
                )}
                <span className="text-[12.5px] font-bold truncate text-alloro-navy">
                  {FACTOR_LABEL[row.key] || row.key}
                </span>
              </span>
              <div className="min-w-0 flex flex-col gap-1.5 pt-1.5">
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ background: "rgba(17,21,28,0.06)" }}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{ width: `${pct}%`, background: tone }}
                  />
                </div>
                {delta && (
                  <span className="text-[10.5px] font-medium text-alloro-navy/55 leading-snug">
                    {delta}
                  </span>
                )}
              </div>
              <span className="text-[12px] font-bold tabular-nums text-right text-alloro-navy pt-0.5">
                {Math.round(pct)}
                <span className="text-alloro-navy/30 font-semibold"> /100</span>
              </span>
              <span className="font-mono-display text-[10px] uppercase tracking-widest text-alloro-navy/40 text-right tabular-nums pt-1">
                w {weightPct}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   NextMoves — top recommendations right-rail (T7)
   ───────────────────────────────────────────────────────────── */
function NextMoves({ result }: { result: RankingResult }) {
  const recs = result.llmAnalysis?.top_recommendations ?? [];
  if (recs.length === 0) return null;
  const accent = "#D66853";
  const visibleRecs = recs.slice(0, 3);

  return (
    <section className="rounded-[14px] border border-line-soft bg-white p-6 shadow-premium lg:p-7">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: accent }}
          />
          <SectionTitle>Best next actions</SectionTitle>
          <InfoTip content="Highest-impact actions to improve local visibility, ordered by priority. Click any move to see why it matters and how to do it." />
        </div>
        <span className="font-mono-display text-[10px] tracking-widest text-alloro-navy/40 uppercase shrink-0">
          {visibleRecs.length} actions
        </span>
      </header>
      <ol className="grid gap-4 lg:grid-cols-3">
        {visibleRecs.map((rec, i) => (
          <li key={i}>
            <article className="h-full rounded-[12px] border border-line-soft bg-white p-4 shadow-[0_12px_28px_rgba(17,21,28,0.07)] transition-transform duration-200 hover:-translate-y-0.5 hover:border-alloro-orange/25">
              <div className="mb-3 flex items-center gap-2">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full border font-extrabold text-[12px] tabular-nums"
                  style={{
                    color: accent,
                    background: "rgba(214,104,83,0.08)",
                    borderColor: "rgba(214,104,83,0.22)",
                  }}
                >
                  {rec.priority}
                </div>
                <span className="font-mono-display text-[10px] font-bold uppercase tracking-[0.16em] text-alloro-navy/35">
                  Action
                </span>
              </div>
              <h4 className="text-[14.5px] font-bold leading-snug tracking-tight text-alloro-navy">
                {rec.title}
              </h4>
              {rec.description && (
                <p className="mt-3 text-[12.5px] font-medium leading-relaxed text-alloro-navy/65">
                  {rec.description}
                </p>
              )}
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   GapsPanel — opportunities right-rail (T7)
   ───────────────────────────────────────────────────────────── */
function GapsPanel({
  result,
  embedded = false,
}: {
  result: RankingResult;
  embedded?: boolean;
}) {
  const gaps = result.llmAnalysis?.gaps ?? [];
  if (gaps.length === 0) return null;
  const tone = (impact: string) =>
    impact === "high"
      ? { c: "#ef4444", b: "var(--color-danger-soft)" }
      : impact === "medium"
        ? { c: "#D9A441", b: "var(--color-amber-soft)" }
        : { c: "#11151C", b: "rgba(17,21,28,0.05)" };

  return (
    <section
      className={`bg-white border border-line-soft rounded-[14px] overflow-hidden ${
        embedded ? "" : "shadow-premium"
      }`}
    >
      {!embedded && (
        <header className="px-6 lg:px-7 py-4 flex items-center justify-between border-b border-line-soft gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: "#D9A441" }}
            />
            <SectionTitle>Gaps to fix</SectionTitle>
            <InfoTip content="Specific gaps where competitors outperform you. High-impact gaps are the fastest path to climbing — click any gap for the details." />
          </div>
          <span className="font-mono-display text-[10px] tracking-widest text-alloro-navy/40 uppercase shrink-0">
            {gaps.length}
          </span>
        </header>
      )}
      <ul className="divide-y divide-line-soft">
        {gaps.map((g, i) => {
          const t = tone(g.impact);
          return (
            <li key={i} className="px-6 py-4 lg:px-7">
              <div className="flex items-start gap-3">
                <span
                  className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.18em]"
                  style={{ color: t.c, background: t.b }}
                >
                  {g.impact}
                </span>
                <div className="min-w-0">
                  <h4 className="text-[13.5px] font-bold text-alloro-navy">
                    {FACTOR_LABEL[g.type] ||
                      g.type
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (c) => c.toUpperCase())}
                  </h4>
                  <p className="mt-2 max-w-[72ch] text-[12.5px] leading-relaxed text-alloro-navy/65">
                    {g.reason}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Performance Dashboard View Component
function PerformanceDashboard({
  result,
  insight,
  onOpenEngage,
  engagementSummary,
}: {
  result: RankingResult;
  insight?: string;
  onOpenEngage: () => void;
  engagementSummary?: React.ReactNode;
}) {
  const [detailsModal, setDetailsModal] = useState<"score" | "gaps" | null>(null);
  const competitors = result.rawData?.competitors || [];
  const score = getOwnerVisibleScore(result);
  const gaugePrev = getComparablePreviousScore(result);
  const overviewInsight = getOverviewDisplayInsight(
    result,
    insight ?? getOverviewFallbackInsight(result),
    score,
  );
  const overviewHighlights = getOverviewDisplayHighlights(
    result,
    overviewInsight,
    score,
  );

  // Market average rating (from curated competitors) — surfaced in the
  // overview local search summary so the star rating keeps its comparison context.
  const marketAvgRating =
    competitors.length > 0
      ? competitors.reduce((sum, c) => sum + (c.averageRating || 0), 0) /
        competitors.length
      : 4.5;

  return (
    <div
      data-wizard-target="rankings-score"
      className="space-y-5 lg:space-y-6"
    >
      <MeaningHero
        insight={overviewInsight}
        insightHighlights={overviewHighlights}
        score={<HealthGauge value={score} prev={gaugePrev} />}
        scoreTooltip="This 0-100 score summarizes the local visibility signals behind the estimate, including reviews, rating, category match, profile activity, and consistency. It explains why the estimate looks the way it does; it is not a guaranteed Google rank."
        estimateSummary={
          <LocalSearchEstimateSummary
            result={result}
            marketAvgRating={marketAvgRating}
          />
        }
        actions={
          <ScoreCardCtas
            onOpenScoreDetails={() => setDetailsModal("score")}
            onOpenGaps={() => setDetailsModal("gaps")}
            score={score}
          />
        }
        insightAction={
          <button
            type="button"
            onClick={onOpenEngage}
            className="inline-flex items-center gap-2 rounded-[10px] bg-alloro-orange px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition-colors hover:bg-alloro-orange/90 focus:outline-none focus:ring-2 focus:ring-alloro-orange/35"
          >
            Open Alloro Engage GBP Posts
            <ChevronRight size={14} />
          </button>
        }
      />
      <NextMoves result={result} />
      {engagementSummary}
      <SearchPositionSection result={result} />

      <DetailsModal
        open={detailsModal === "score"}
        title={`Why you scored ${Math.round(score)}/100`}
        eyebrow="Score details"
        onClose={() => setDetailsModal(null)}
      >
        <div className="space-y-5">
          <DriversPanel result={result} embedded />
          <FactorBreakdown result={result} embedded />
        </div>
      </DetailsModal>
      <DetailsModal
        open={detailsModal === "gaps"}
        title="How to close the gap"
        eyebrow="Gaps to fix"
        onClose={() => setDetailsModal(null)}
      >
        <GapsPanel result={result} embedded />
      </DetailsModal>
    </div>
  );
}

export default RankingsDashboard;
