import { useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Star } from "lucide-react";
import { useGbpPublishedLocalPosts } from "../../../hooks/queries/useGbpAutomationQueries";
import { useDashboardMetrics } from "../../../hooks/queries/useDashboardMetrics";
import {
  buildCompetitorComparisonRows,
  getComparisonInsight,
} from "../rankings/competitorComparison";
import { ActionBanner } from "../ActionBanner";
import { StatBox } from "../StatBox";
import { TONE_COLOR } from "../focus/statusRules";
import { RankingsMapCard } from "./RankingsMapCard";
import type { RankingResult } from "../RankingsDashboard";
import { useLabels } from "../../../hooks/useLabels";
import { useAuth } from "../../../hooks/useAuth";
import { formatGeneratedCopyForOrg } from "../../../utils/generatedCopy";
import { formatDataMonth } from "../../../utils/timeframe";
import {
  formatRatingVsMarket,
  resolveMarketRating,
  resolveRankDisplay,
  resolveReviewsLast30d,
} from "./rankingsHubDerivation";

/**
 * RankingsHubSurface — simplified Local Rankings surface (redesign).
 *
 * Rendered by RankingsDashboard's Overview branch in place of
 * PerformanceDashboard. Anchors on rank + competitor map, the competitors
 * strip, three vitals, and one action. The Visibility Score and Practice
 * Health score are dropped entirely.
 *
 * The dormant MONTH/QTR/YTD toggle was removed (feedback #5) — it rendered
 * permanently greyed (PERIOD_TOGGLE_ENABLED=false) with no wired state.
 * rankingPeriod.ts is kept as the future enable point.
 *
 * Spec: plans/06102026-local-rankings-simplification/spec.html (T3);
 * clarity pass: plans/06132026-local-rankings-clarity (T1, T4, T5).
 */

const POST_OVERDUE_DAYS = 15; // mirrors GbpEngagementSummaryCard

function daysSince(value: string | null | undefined): number | null {
  if (!value) return null;
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / 86_400_000));
}

export function RankingsHubSurface({
  result,
  organizationId,
  locationId,
}: {
  result: RankingResult;
  organizationId: number | null;
  locationId: number | null;
}) {
  const navigate = useNavigate();
  const labels = useLabels();
  const { userProfile } = useAuth();

  // The REAL status — no longer defaulted to "ok", which printed a confident
  // rank on a status we never confirmed. Used only to pick the not-ranked message.
  const status = result.searchStatus;
  // The hero rank + denominator, resolved honestly: a rank shows only when
  // SerpApi status is exactly "ok", and any "of M" comes from the SAME SerpApi
  // result universe as the position — never the curated competitor count
  // (stageReaders.readRank carries no denominator for exactly this reason).
  const rankDisplay = resolveRankDisplay(result);
  const rank = rankDisplay.position;

  // Canonical review total + rating (feedback #5 + cross-plan): read from
  // dashboard-metrics — the SAME source Practice Hub uses — so both surfaces
  // show one number (resolves the 163-vs-152 split where Rankings was reading
  // the per-run scrape snapshot in rawData.client_gbp). Fall back to the
  // scrape values while metrics are still loading so the card never blanks.
  const { data: metrics } = useDashboardMetrics(organizationId, locationId);
  const clientGbp = result.rawData?.client_gbp ?? null;
  const avgRating =
    metrics?.reviews?.current_rating ?? clientGbp?.averageRating ?? null;
  const reviewCount =
    metrics?.reviews?.total_review_count ?? clientGbp?.totalReviewCount ?? null;
  // 30-day review velocity keeps its existing source: dashboard-metrics has no
  // rolling-30d field (reviews_this_month is a calendar-month count). null when
  // the scrape carried none — rendered as "—", never a measured "0".
  const reviewsLast30d = resolveReviewsLast30d(clientGbp);

  const competitors = result.rawData?.competitors ?? [];
  // null when there are no rated competitors — the UI shows "—", never the
  // invented constant 4.5. Unrated competitors are skipped, not folded in as 0.
  const marketAvgRating = resolveMarketRating(competitors);

  // Last GBP post age — same source GbpEngagementSummaryCard uses.
  const { data: publishedPosts } = useGbpPublishedLocalPosts(
    organizationId,
    locationId,
    true,
    { page: 1, limit: 1 },
  );
  const latestPost = publishedPosts?.posts[0];
  const postAgeDays = daysSince(latestPost?.createTime || latestPost?.updateTime);
  const postOverdue = postAgeDays === null || postAgeDays > POST_OVERDUE_DAYS;

  const topAction = result.llmAnalysis?.top_recommendations?.[0] ?? null;

  const comparisonInsight = useMemo(() => {
    const rows = buildCompetitorComparisonRows(result);
    return formatGeneratedCopyForOrg(
      getComparisonInsight(rows, "mapsPosition"),
      userProfile?.organizationType,
    );
  }, [result, userProfile?.organizationType]);

  // A stale rank loses its confident color: the "#3 = great, current" green is
  // exactly the half-truth the freshness guard exists to strip. The number
  // stays (it is a real, if old, measurement) but reads muted and dated.
  const rankColorClass = rankDisplay.stale
    ? "text-alloro-navy/45"
    : rank !== null && rank <= 3
      ? "text-alloro-orange"
      : rank !== null && rank <= 10
        ? "text-alloro-navy"
        : "text-alloro-navy/45";

  const reviewsValue: ReactNode =
    reviewCount !== null && avgRating !== null ? (
      <span className="inline-flex items-center gap-1.5">
        {reviewCount.toLocaleString()} · {avgRating.toFixed(1)}
        <Star size={15} className="fill-amber-400 text-amber-400" />
      </span>
    ) : reviewCount !== null ? (
      reviewCount.toLocaleString()
    ) : (
      "—"
    );

  return (
    <div className="mx-auto w-full max-w-[960px] space-y-6">
      {/* Hero: rank + competitor map */}
      <section
        data-wizard-target="rankings-score"
        className="grid grid-cols-1 gap-5 rounded-[14px] border border-line-soft bg-white p-5 shadow-premium lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:p-6"
      >
        <div className="flex flex-col justify-center">
          {rankDisplay.show && rank !== null ? (
            <>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted">
                You rank
              </div>
              <div className="mt-1 flex items-baseline gap-3">
                <span
                  className={`font-display text-[72px] font-medium leading-[0.85] tracking-tight tabular-nums lg:text-[88px] ${rankColorClass}`}
                >
                  #{rank}
                </span>
                {rankDisplay.outOf !== null && (
                  <span className="text-[13px] font-semibold text-ink-muted">
                    of {rankDisplay.outOf} nearby
                  </span>
                )}
              </div>
              <p className="mt-3 text-[13px] font-medium leading-relaxed text-alloro-navy">
                for{" "}
                <span className="font-bold text-alloro-navy">
                  {result.searchQuery ?? "your tracked search"}
                </span>
              </p>
              {rankDisplay.stale && rankDisplay.checkedAt && (
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                  Last checked {formatDataMonth(rankDisplay.checkedAt)} · may be out of date
                </p>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="font-display text-3xl font-medium tracking-tight text-alloro-navy">
                {status === "not_in_top_20"
                  ? "Not ranked in top 20"
                  : status === "bias_unavailable"
                    ? `Couldn't locate your ${labels.orgNoun} on Google`
                    : status === "api_error"
                      ? "Google search temporarily unavailable"
                      : "Local search estimate pending"}
              </span>
              <p className="max-w-[46ch] text-[13px] font-medium leading-relaxed text-alloro-navy">
                for{" "}
                <span className="font-bold text-alloro-navy">
                  {result.searchQuery ?? "your tracked search"}
                </span>
                .
              </p>
            </div>
          )}
        </div>

        <RankingsMapCard
          locationId={locationId}
          searchResults={result.selectedCompetitorSearchResults}
        />
      </section>

      {/* Competitors strip → manage competitors. Moved up (feedback #6) to sit
          directly below the rank+map hero, above the vitals. */}
      {result.locationId && (
        <button
          type="button"
          data-wizard-target="rankings-competitors"
          onClick={() =>
            navigate(
              `/dashboard/competitors/${result.locationId}/onboarding?mode=reselect`,
            )
          }
          className="group flex w-full items-center justify-between gap-3 rounded-[14px] border border-line-soft bg-white px-5 py-4 text-left shadow-premium transition-colors hover:border-alloro-orange/40"
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: TONE_COLOR.positive }}
            />
            <span className="truncate text-[14px] font-semibold text-alloro-navy">
              {comparisonInsight}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[10px] font-black uppercase tracking-widest text-ink-muted transition-colors group-hover:text-alloro-orange">
            <span className="hidden sm:inline">Manage competitor list</span>
            <ChevronRight size={16} />
          </span>
        </button>
      )}

      {/* Three vitals */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatBox
          label="Reviews"
          value={reviewsValue}
          sub={
            reviewsLast30d === null
              ? "All-time total · recent activity not measured"
              : `All-time total · ${reviewsLast30d} ${reviewsLast30d === 1 ? "review" : "reviews"} last 30 days`
          }
        />
        <StatBox
          label="Last post"
          value={postAgeDays === null ? "No post yet" : `${postAgeDays}d`}
          sub={postOverdue ? "overdue" : "current"}
          tone={postOverdue ? "warn" : "ink"}
        />
        <StatBox
          label="Rating vs Market"
          value={formatRatingVsMarket(avgRating, marketAvgRating)}
          sub="Google rating · you / market"
        />
      </div>

      {/* One action */}
      {topAction && (
        <ActionBanner
          hub="rankings-hub"
          eyebrow="1 Action"
          title={topAction.title}
          description={topAction.description ?? null}
          wizardTarget="rankings-action"
        />
      )}
    </div>
  );
}

export default RankingsHubSurface;
