import { useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Star } from "lucide-react";
import { useGbpPublishedLocalPosts } from "../../../hooks/queries/useGbpAutomationQueries";
import {
  buildCompetitorComparisonRows,
  getComparisonInsight,
} from "../rankings/competitorComparison";
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
      className="inline-flex rounded-full p-0.5"
      style={{ background: "#EDEAE5" }}
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

function StatBox({
  label,
  value,
  sub,
  tone = "ink",
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: "ink" | "warn";
}) {
  return (
    <div className="rounded-[14px] border border-line-soft bg-white p-5 shadow-premium">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-alloro-navy/45">
        {label}
      </div>
      <div
        className="mt-2 font-display text-2xl font-medium leading-none tracking-tight tabular-nums"
        style={{ color: tone === "warn" ? "#B3503E" : "#1F1B16" }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1.5 text-[12px] font-semibold text-alloro-navy/45">{sub}</div>
      )}
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

  const rankColor =
    rank !== null && rank <= 3
      ? "#D66853"
      : rank !== null && rank <= 10
        ? "#1F1B16"
        : "rgba(31,27,22,0.45)";

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
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-alloro-navy/45">
                You rank
              </div>
              <div className="mt-1 flex items-baseline gap-3">
                <span
                  className="font-display text-[72px] font-medium leading-[0.85] tracking-tight tabular-nums lg:text-[88px]"
                  style={{ color: rankColor }}
                >
                  #{rank}
                </span>
                <span className="text-[13px] font-semibold text-alloro-navy/55">
                  of {nearby} nearby
                </span>
              </div>
              <p className="mt-3 text-[13px] font-medium leading-relaxed text-alloro-navy/70">
                for{" "}
                <span className="font-bold text-alloro-navy">
                  {result.searchQuery ?? "your tracked search"}
                </span>
              </p>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="font-display text-3xl font-medium tracking-tight text-alloro-navy/55">
                {status === "not_in_top_20"
                  ? "Not ranked in top 20"
                  : status === "bias_unavailable"
                    ? "Couldn't locate your practice on Google"
                    : status === "api_error"
                      ? "Google search temporarily unavailable"
                      : "Local search estimate pending"}
              </span>
              <p className="max-w-[46ch] text-[13px] font-medium leading-relaxed text-alloro-navy/60">
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
        <section
          data-wizard-target="rankings-action"
          className="rounded-[14px]"
          style={{ background: "#FAF1EC", border: "1px solid #EFDED4", padding: "18px 20px" }}
        >
          <div
            className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em]"
            style={{ color: "#B3503E" }}
          >
            1 Action
          </div>
          <p className="font-display text-lg font-medium leading-snug text-alloro-navy">
            {topAction.title}
          </p>
          {topAction.description && (
            <p className="mt-1 text-[13px] leading-relaxed text-alloro-navy/55">
              {topAction.description}
            </p>
          )}
        </section>
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
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#4F8A5B]" />
            <span className="truncate text-[14px] font-semibold text-alloro-navy">
              {comparisonInsight}
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-alloro-navy/40" />
        </button>
      )}
    </div>
  );
}

export default RankingsHubSurface;
