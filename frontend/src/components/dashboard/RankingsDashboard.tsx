import { useCallback, useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Trophy,
  AlertCircle,
  RefreshCw,
  Target,
  Settings,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { adminFetch } from "../../api";
import {
  useIsWizardActive,
  useWizardDemoData,
} from "../../contexts/OnboardingWizardContext";
import { useLocationContext } from "../../contexts/locationContext";
import { CompetitorOnboardingBanner } from "./CompetitorOnboardingBanner";
import { RankingInFlightBanner } from "./RankingInFlightBanner";
import { getInFlightRanking } from "../../api/practiceRanking";
import { RankingsLoadingState } from "./rankings/RankingsLoadingState";
import { GbpAutomationPanel } from "./gbp-automation/GbpAutomationPanel";
import { GbpEngagementSummaryCard } from "./gbp-automation/GbpEngagementSummaryCard";
import { RankingsHubSurface } from "./rankings-hub/RankingsHubSurface";
// The Engage tab moved to its own page (/gbp-manager) — only the view TYPE
// is still needed for the retained (unreachable) engage branch below.
// plans/06102026-reviews-posts-page (T6).
import { type RankingsDashboardView } from "./rankings/RankingsDashboardViewTabs";
import { logger } from "../../lib/logger";
import type {
  RankingResult,
  RankingsDashboardProps,
} from "./rankingsDashboard.types";
import { PerformanceDashboard } from "./RankingsDashboard/PerformanceDashboard";

export type { RankingResult, RankingsDashboardProps };

// Redesign flag: the simplified RankingsHubSurface replaces PerformanceDashboard
// on the Overview tab. Kept as a const (not deleted) so the legacy tree stays
// type-checked and trivially restorable; flip to true to fall back.
// plans/06102026-local-rankings-simplification.
const USE_LEGACY_RANKINGS_DASHBOARD = false;

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
      // Fetch the latest rankings for all locations of this google account
      const response = await adminFetch(
        `/api/practice-ranking/latest?googleAccountId=${organizationId}${locationId ? `&locationId=${locationId}` : ""}`,
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
      logger.error("Error fetching rankings:", err);
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

  return (
    <div className="min-h-screen bg-alloro-bg font-body text-alloro-textDark pb-32 selection:bg-alloro-orange selection:text-white">
      <main className="w-full max-w-[960px] mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
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

        </div>

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

            {/* Selected Location Detail — simplified rankings hub (redesign).
                The legacy PerformanceDashboard tree is retained behind this
                flag (referenced so it still type-checks; dead branch is
                tree-shaken) for a clean delete once the redesign is confirmed.
                plans/06102026-local-rankings-simplification. */}
            {selectedRanking &&
              (USE_LEGACY_RANKINGS_DASHBOARD ? (
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
              ) : (
                <RankingsHubSurface
                  result={selectedRanking}
                  organizationId={organizationId}
                  locationId={selectedGbpAutomationLocationId}
                />
              ))}
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

export default RankingsDashboard;
