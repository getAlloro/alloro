import { motion } from "framer-motion";
import {
  TrendingUp,
  RefreshCw,
  MapPin,
  Star,
  Trophy,
  Zap,
  Users,
  Info,
  Loader2,
  BarChart3,
  Target,
} from "lucide-react";
import {
  ActionButton,
  Badge,
  HorizontalProgressBar,
} from "../../../components/ui/DesignSystem";
import {
  staggerContainer,
  cardVariants,
} from "../../../lib/animations";
import type { RankingResult } from "../practiceRanking.types";

// Admin Results View - Technical Details
export function RankingResultsView({
  result,
  onRefreshCompetitors,
  refreshingCompetitors,
}: {
  result: RankingResult;
  onRefreshCompetitors?: () => void;
  refreshingCompetitors?: boolean;
}) {
  const factors = result.rankingFactors;
  const competitors =
    (result.rawData?.competitors as Array<{
      name: string;
      rankScore: number;
      rankPosition: number;
      totalReviews: number;
      averageRating: number;
      reviewsLast30d?: number;
      primaryCategory?: string;
    }>) || [];

  const getScoreColorLocal = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <motion.div
      className="space-y-6"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {/* Location Info Header */}
      {result.gbpLocationName && (
        <motion.div
          className="flex items-center gap-2 text-sm text-gray-600"
          variants={cardVariants}
        >
          <MapPin className="h-4 w-4" />
          <span className="font-medium">{result.gbpLocationName}</span>
          {result.location && (
            <>
              <span className="text-gray-400">•</span>
              <span>{result.location}</span>
            </>
          )}
          {result.specialty && (
            <>
              <span className="text-gray-400">•</span>
              <Badge variant="default">{result.specialty}</Badge>
            </>
          )}
        </motion.div>
      )}

      {/* Keywords Used for Ranking */}
      {result.rankKeywords && (
        <motion.div
          className="rounded-xl border border-gray-200 bg-gray-50 p-4"
          variants={cardVariants}
        >
          <h4 className="mb-2 text-sm font-semibold text-gray-700">
            Keywords Used for Ranking
          </h4>
          <div className="flex flex-wrap gap-2">
            {result.rankKeywords.split(",").map((kw: string) => (
              <Badge key={kw.trim()} variant="info">
                {kw.trim()}
              </Badge>
            ))}
          </div>
        </motion.div>
      )}

      {/* Apify Search Parameters (for debugging) */}
      {result.searchParams && (
        <motion.div
          className="rounded-xl border border-amber-200 bg-amber-50 p-4"
          variants={cardVariants}
        >
          <h4 className="mb-2 text-sm font-semibold text-amber-700 flex items-center gap-2">
            <Info className="h-4 w-4" />
            Apify Search Parameters (Debug)
          </h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-600">City:</span>{" "}
              <span className="font-medium text-gray-900">
                {result.searchParams.city || "(not set)"}
              </span>
            </div>
            <div>
              <span className="text-gray-600">State:</span>{" "}
              <span className="font-medium text-gray-900">
                {result.searchParams.state || "(not set)"}
              </span>
            </div>
            <div>
              <span className="text-gray-600">County:</span>{" "}
              <span className="font-medium text-gray-900">
                {result.searchParams.county || "(not set)"}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Postal Code:</span>{" "}
              <span className="font-medium text-gray-900">
                {result.searchParams.postalCode || "(not set)"}
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Score Overview */}
      <motion.div className="grid gap-4 md:grid-cols-4" variants={cardVariants}>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-500">Rank Score</span>
            <Trophy className={`w-5 h-5 ${getScoreColorLocal(Number(result.rankScore))}`} />
          </div>
          <div className={`text-3xl font-bold ${getScoreColorLocal(Number(result.rankScore))}`}>
            {Number(result.rankScore).toFixed(1)}
            <span className="text-sm font-normal text-gray-400">/100</span>
          </div>
          <div className="mt-2">
            <HorizontalProgressBar value={Number(result.rankScore)} height={6} />
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-500">Position</span>
            <Users className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">
            #{result.rankPosition}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            of {result.totalCompetitors} competitors
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-500">Reviews</span>
            <Star className="w-5 h-5 text-yellow-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {result.rawData?.client_gbp?.totalReviewCount || 0}
          </div>
          <p className="text-sm text-gray-500 mt-1">total reviews</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-500">Rating</span>
            <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-3xl font-bold text-gray-900">
              {(
                factors?.star_rating?.value ??
                result.rawData?.client_gbp?.averageRating ??
                0
              ).toFixed(1)}
            </span>
            <span className="text-sm text-gray-400">/5.0</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">average rating</p>
        </div>
      </motion.div>

      {/* LLM Analysis Summary */}
      {result.llmAnalysis?.client_summary && (
        <motion.div
          className="rounded-xl border border-blue-200 bg-blue-50 p-4"
          variants={cardVariants}
        >
          <h4 className="mb-2 font-semibold text-blue-900">Analysis Summary</h4>
          <p className="text-sm text-blue-800 whitespace-pre-wrap">
            {result.llmAnalysis.client_summary}
          </p>
        </motion.div>
      )}

      {/* Ranking Factors Breakdown */}
      {(() => {
        const COMPETITIVE_KEYS = [
          "category_match",
          "review_count",
          "star_rating",
          "keyword_name",
          "nap_consistency",
          "sentiment",
        ];
        const CLIENT_ONLY_KEYS = ["review_velocity", "gbp_activity"];

        const FACTOR_LABELS: Record<string, string> = {
          category_match: "Category Match",
          review_count: "Review Count",
          star_rating: "Star Rating",
          keyword_name: "Keyword in Name",
          nap_consistency: "NAP Consistency",
          sentiment: "Sentiment",
          review_velocity: "Review Velocity",
          gbp_activity: "GBP Activity",
        };

        const getBarColor = (pct: number) => {
          if (pct >= 80) return { bar: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-100", badge: "bg-emerald-100 text-emerald-700" };
          if (pct >= 60) return { bar: "bg-amber-400", text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-100", badge: "bg-amber-100 text-amber-700" };
          return { bar: "bg-red-400", text: "text-red-700", bg: "bg-red-50", border: "border-red-100", badge: "bg-red-100 text-red-700" };
        };

        type FactorValue = { score: number; weight: number; weighted: number; details?: string; value?: number };

        const renderFactor = (
          key: string,
          value: FactorValue,
          index: number,
        ) => {
          const pct = Math.round((value?.score ?? 0) * 100);
          const colors = getBarColor(pct);
          const weightPct = Math.round((value?.weight ?? 0) * 100);

          return (
            <motion.div
              key={key}
              className={`rounded-lg border ${colors.border} ${colors.bg} p-3`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.04 }}
            >
              <div className="flex items-start justify-between mb-1.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {FACTOR_LABELS[key] || key.replace(/_/g, " ")}
                    </span>
                    <span className="text-[10px] font-medium text-gray-400 tabular-nums">
                      {weightPct}% weight
                    </span>
                  </div>
                  {value?.details && (
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      {value.details}
                    </p>
                  )}
                </div>
                <div className="flex items-baseline gap-1.5 ml-3 flex-shrink-0">
                  <span className={`text-lg font-bold tabular-nums ${colors.text}`}>
                    {pct}
                  </span>
                  <span className="text-xs text-gray-400">/100</span>
                </div>
              </div>
              <div className="w-full h-1.5 bg-white/60 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full ${colors.bar} rounded-full`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1], delay: index * 0.04 + 0.2 }}
                />
              </div>
            </motion.div>
          );
        };

        const competitiveFactors = factors
          ? COMPETITIVE_KEYS.filter((k) => k in factors).map((k) => [k, (factors as Record<string, FactorValue>)[k]] as [string, FactorValue])
          : [];
        const clientFactors = factors
          ? CLIENT_ONLY_KEYS.filter((k) => k in factors).map((k) => [k, (factors as Record<string, FactorValue>)[k]] as [string, FactorValue])
          : [];

        return (
          <motion.div
            className="rounded-xl border border-gray-200 bg-white p-5"
            variants={cardVariants}
          >
            {/* Competitive Factors */}
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-4.5 w-4.5 text-gray-700" />
              <h4 className="font-semibold text-gray-900 text-sm tracking-tight">
                Competitive Ranking Factors
              </h4>
              <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                Used for rank position
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {competitiveFactors.map(([key, value], i) =>
                renderFactor(key, value, i),
              )}
            </div>

            {/* Client-Only Insights */}
            {clientFactors.length > 0 && (
              <>
                <div className="flex items-center gap-2 mt-5 mb-3">
                  <Zap className="h-4 w-4 text-blue-500" />
                  <h4 className="font-semibold text-gray-900 text-sm tracking-tight">
                    Client-Only Insights
                  </h4>
                  <span className="text-[10px] font-medium text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                    Not used in competitive ranking
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {clientFactors.map(([key, value], i) =>
                    renderFactor(key, value, competitiveFactors.length + i),
                  )}
                </div>
              </>
            )}
          </motion.div>
        );
      })()}

      {/* Top Competitors */}
      <motion.div
        className="rounded-xl border border-gray-200 bg-white p-5"
        variants={cardVariants}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-4.5 w-4.5 text-gray-700" />
            <h4 className="font-semibold text-gray-900 text-sm tracking-tight">
              Top Competitors
            </h4>
          </div>
          {onRefreshCompetitors && (
            <ActionButton
              label={refreshingCompetitors ? "Refreshing..." : "Refresh"}
              icon={
                refreshingCompetitors ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )
              }
              onClick={onRefreshCompetitors}
              variant="secondary"
              disabled={refreshingCompetitors}
            />
          )}
        </div>
        <div className="space-y-1.5">
          {(() => {
            const clientEntry = {
              name: result.gbpLocationName || result.specialty,
              rankScore: Number(result.rankScore),
              rankPosition: result.rankPosition,
              totalReviews:
                result.rawData?.client_gbp?.totalReviewCount || 0,
              averageRating:
                factors?.star_rating?.value ??
                result.rawData?.client_gbp?.averageRating ??
                0,
              primaryCategory:
                result.rawData?.client_gbp?.primaryCategory ||
                result.specialty,
              isClient: true,
            };

            const allEntries = [
              clientEntry,
              ...competitors.map((c) => ({ ...c, isClient: false })),
            ].sort((a, b) => a.rankPosition - b.rankPosition);

            const topScore = Math.max(...allEntries.map((e) => e.rankScore), 1);

            return allEntries.slice(0, 10).map((comp, idx) => {
              const scorePct = Math.round((comp.rankScore / topScore) * 100);
              const scoreColor = comp.rankScore >= 80
                ? "text-emerald-700"
                : comp.rankScore >= 60
                  ? "text-amber-700"
                  : "text-red-600";
              const barColor = comp.rankScore >= 80
                ? "bg-emerald-500"
                : comp.rankScore >= 60
                  ? "bg-amber-400"
                  : "bg-red-400";

              return (
                <motion.div
                  key={idx}
                  className={`rounded-lg border p-3 ${
                    comp.isClient
                      ? "border-blue-200 bg-blue-50/50"
                      : "border-gray-100 bg-gray-50/50"
                  }`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                >
                  <div className="flex items-center gap-3">
                    {/* Rank */}
                    <div className="flex-shrink-0 w-8 text-center">
                      {comp.rankPosition === 1 ? (
                        <Trophy className="h-4.5 w-4.5 text-amber-500 mx-auto" />
                      ) : (
                        <span className="text-sm font-bold text-gray-400 tabular-nums">
                          {comp.rankPosition}
                        </span>
                      )}
                    </div>

                    {/* Name + Category */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900 truncate">
                          {comp.name}
                        </span>
                        {comp.isClient && (
                          <span className="text-[10px] font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded flex-shrink-0">
                            YOU
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-400">
                        {comp.primaryCategory || "—"}
                      </span>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Reviews</div>
                        <div className="text-sm font-bold text-gray-800 tabular-nums">{comp.totalReviews.toLocaleString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Rating</div>
                        <div className="text-sm font-bold text-gray-800 tabular-nums flex items-center justify-end gap-0.5">
                          {comp.averageRating?.toFixed(1) || "—"}
                          <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                        </div>
                      </div>
                      <div className="text-right w-14">
                        <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Score</div>
                        <div className={`text-sm font-bold tabular-nums ${scoreColor}`}>
                          {comp.rankScore?.toFixed(1) || "—"}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Score bar */}
                  <div className="mt-2 w-full h-1 bg-gray-200/60 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full ${barColor} rounded-full`}
                      initial={{ width: 0 }}
                      animate={{ width: `${scorePct}%` }}
                      transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1], delay: idx * 0.04 + 0.2 }}
                    />
                  </div>
                </motion.div>
              );
            });
          })()}
        </div>
      </motion.div>

      {/* LLM Analysis Details */}
      {result.llmAnalysis && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Gaps */}
          {result.llmAnalysis.gaps && result.llmAnalysis.gaps.length > 0 && (
            <motion.div
              className="rounded-xl border border-gray-200 bg-white p-5"
              variants={cardVariants}
            >
              <div className="flex items-center gap-2 mb-4">
                <Target className="h-4.5 w-4.5 text-gray-700" />
                <h4 className="font-semibold text-gray-900 text-sm tracking-tight">
                  Identified Gaps
                </h4>
              </div>
              <div className="space-y-2">
                {result.llmAnalysis.gaps.map((gap, idx) => {
                  const impactColors = gap.impact === "high"
                    ? "border-red-200 bg-red-50"
                    : gap.impact === "medium"
                      ? "border-amber-200 bg-amber-50"
                      : "border-gray-100 bg-gray-50";
                  const impactBadge = gap.impact === "high"
                    ? "bg-red-100 text-red-700"
                    : gap.impact === "medium"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-gray-100 text-gray-600";

                  return (
                    <motion.div
                      key={idx}
                      className={`rounded-lg border ${impactColors} p-3`}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${impactBadge} flex-shrink-0 mt-0.5`}>
                          {gap.impact}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900">
                            {gap.area || gap.query_class}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                            {gap.reason}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Drivers */}
          {result.llmAnalysis.drivers &&
            result.llmAnalysis.drivers.length > 0 && (
              <motion.div
                className="rounded-xl border border-gray-200 bg-white p-5"
                variants={cardVariants}
              >
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="h-4.5 w-4.5 text-gray-700" />
                  <h4 className="font-semibold text-gray-900 text-sm tracking-tight">
                    Key Drivers
                  </h4>
                </div>
                <div className="space-y-1.5">
                  {result.llmAnalysis.drivers.map((driver, idx) => {
                    const isPositive = driver.direction === "positive";
                    const isNegative = driver.direction === "negative";

                    return (
                      <motion.div
                        key={idx}
                        className={`flex items-center justify-between rounded-lg border p-2.5 ${
                          isPositive
                            ? "border-emerald-100 bg-emerald-50/50"
                            : isNegative
                              ? "border-red-100 bg-red-50/50"
                              : "border-gray-100 bg-gray-50/50"
                        }`}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.04 }}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                              isPositive
                                ? "bg-emerald-500"
                                : isNegative
                                  ? "bg-red-500"
                                  : "bg-gray-400"
                            }`}
                          />
                          <span className="text-sm font-medium text-gray-800">
                            {(driver.factor || "").replace(/_/g, " ")}
                          </span>
                        </div>
                        <span className={`text-xs font-semibold tabular-nums ${
                          isPositive
                            ? "text-emerald-600"
                            : isNegative
                              ? "text-red-600"
                              : "text-gray-500"
                        }`}>
                          {isPositive ? "+" : isNegative ? "−" : ""}{driver.weight}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}
        </div>
      )}

      {/* Data Source Info */}
      <div className="grid gap-4 md:grid-cols-2">
        <motion.div
          className="rounded-xl border border-gray-200 bg-gray-50 p-4"
          variants={cardVariants}
        >
          <h4 className="text-sm font-semibold text-gray-900 mb-2">
            Data Collection
          </h4>
          <div className="space-y-1 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>Competitors Discovered:</span>
              <span className="font-medium">
                {result.rawData?.competitors_discovered ||
                  result.rawData?.competitors?.length ||
                  0}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Data Source:</span>
              <span className="font-medium">
                {result.rawData?.competitors_from_cache ? "Cached" : "Fresh"}
              </span>
            </div>
          </div>
        </motion.div>
        <motion.div
          className="rounded-xl border border-gray-200 bg-gray-50 p-4"
          variants={cardVariants}
        >
          <h4 className="text-sm font-semibold text-gray-900 mb-2">
            GBP Profile
          </h4>
          <div className="space-y-1 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>Category:</span>
              <span className="font-medium truncate max-w-[100px]">
                {result.rawData?.client_gbp?.primaryCategory || "N/A"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Latest Posts (30d):</span>
              <span className="font-medium">
                {result.rawData?.client_gbp?.postsLast30d ?? 0}
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
