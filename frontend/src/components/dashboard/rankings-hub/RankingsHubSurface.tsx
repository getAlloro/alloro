import { useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Star } from "lucide-react";
import { useGbpPublishedLocalPosts } from "../../../hooks/queries/useGbpAutomationQueries";
import {
  buildCompetitorComparisonRows,
  getComparisonInsight,
} from "../rankings/competitorComparison";
import { ActionBanner } from "../ActionBanner";
import { StatBox } from "../StatBox";
import { TONE_COLOR } from "../focus/statusRules";
import { RankingsMapCard } from "./RankingsMapCard";
import {
  RANKING_PERIODS,
  PERIOD_TOGGLE_ENABLED,
  PERIOD_DISABLED_TOOLTIP,
  type RankingPeriod,
} from "./rankingPeriod";
import type { RankingResult } from "../RankingsDashboard";

/**
 * RankingsHubSurface — simplified Local Rankings surface (redesign).
 *
 * Rendered by RankingsDashboard's Overview branch in place of
 * PerformanceDashboard. Anchors on rank + competitor map, three vitals, and
 * one action. The Visibility Score and Practice Health score are dropped
 * entirely. The MONTH/QTR/YTD toggle ships disabled (see rankingPeriod.ts).
 *
 * Spec: plans/06102026-local-rankings-simplification/spec.html (T3)
 */

const POST_OVERDUE_DAYS = 15; // mirrors GbpEngagementSummaryCard

function daysSince(value: string | null | undefined): number | null {
  if (!value) return null;
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / 86_400_000));
}

function PeriodToggle() {
  // Disabled until enough ranking history accumulates (PERIOD_TOGGLE_ENABLED).
  return (
    <div
      className="inline-flex rounded-full bg-[#EDEAE5] p-0.5"
      title={PERIOD_TOGGLE_ENABLED ? undefined : PERIOD_DISABLED_TOOLTIP}
    >
      {RANKING_PERIODS.map((p: RankingPeriod, i) => (
        <button
          key={p}
          type="button"
          disabled={!PERIOD_TOGGLE_ENABLED}
          aria-disabled={!PERIOD_TOGGLE_ENABLED}
          className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors ${
            i === 0 ? "bg-white text-alloro-navy shadow-sm" : "text-alloro-navy/45"
          } ${PERIOD_TOGGLE_ENABLED ? "" : "cursor-not-allowed"}`}
        >
          {p}
        </button>
      ))}
    </div>
  );
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

  const status = result.searchStatus ?? "ok";
  const rank = result.searchPosition;
  const compCount = result.selectedCompetitorSearchResults?.length ?? 0;
  const nearby = compCount > 0 ? compCount + 1 : result.totalCompetitors;

  const clientGbp = result.rawData?.client_gbp ?? null;
  const avgRating = clientGbp?.averageRating ?? null;
  const reviewCount = clientGbp?.totalReviewCount ?? null;
  const reviewsLast30d = clientGbp?.reviewsLast30d ?? 0;

  const competitors = result.rawData?.competitors ?? [];
  const marketAvgRating =
    competitors.length > 0
      ? competitors.reduce((sum, c) => sum + (c.averageRating || 0), 0) /
        competitors.length
      : null;

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
    return getComparisonInsight(rows, "mapsPosition");
  }, [result]);

  const rankColorClass =
    rank !== null && rank <= 3
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
      <div className="flex items-center justify-end">
        <PeriodToggle />
      </div>

      {/* Hero: rank + competitor map */}
      <section
        data-wizard-target="rankings-score"
        className="grid grid-cols-1 gap-5 rounded-[14px] border border-line-soft bg-white p-5 shadow-premium lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:p-6"
      >
        <div className="flex flex-col justify-center">
          {status === "ok" && rank !== null ? (
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
                <span className="text-[13px] font-semibold text-ink-muted">
                  of {nearby} nearby
                </span>
              </div>
              <p className="mt-3 text-[13px] font-medium leading-relaxed text-alloro-navy">
                for{" "}
                <span className="font-bold text-alloro-navy">
                  {result.searchQuery ?? "your tracked search"}
                </span>
              </p>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="font-display text-3xl font-medium tracking-tight text-alloro-navy">
                {status === "not_in_top_20"
                  ? "Not ranked in top 20"
                  : status === "bias_unavailable"
                    ? "Couldn't locate your practice on Google"
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

      {/* Three vitals */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatBox
          label="Reviews"
          value={reviewsValue}
          sub={`+${reviewsLast30d} / 30d`}
        />
        <StatBox
          label="Last post"
          value={postAgeDays === null ? "No post yet" : `${postAgeDays}d`}
          sub={postOverdue ? "overdue" : "current"}
          tone={postOverdue ? "warn" : "ink"}
        />
        <StatBox
          label="Rating vs mkt"
          value={
            avgRating !== null
              ? `${avgRating.toFixed(1)} / ${(marketAvgRating ?? 4.5).toFixed(1)}`
              : "—"
          }
          sub="you / market"
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

      {/* Bottom strip → manage competitors */}
      {result.locationId && (
        <button
          type="button"
          data-wizard-target="rankings-competitors"
          onClick={() =>
            navigate(
              `/dashboard/competitors/${result.locationId}/onboarding?mode=reselect`,
            )
          }
          className="flex w-full items-center justify-between gap-3 rounded-[14px] border border-line-soft bg-white px-5 py-4 text-left shadow-premium transition-colors hover:border-alloro-orange/40"
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
          <ChevronRight size={18} className="shrink-0 text-ink-muted" />
        </button>
      )}
    </div>
  );
}

export default RankingsHubSurface;
