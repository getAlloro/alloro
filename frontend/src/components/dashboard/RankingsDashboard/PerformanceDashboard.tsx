import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { MeaningHero } from "../shared/MeaningHero";
import { DetailsModal } from "../shared/DetailsModal";
import type { RankingResult } from "../rankingsDashboard.types";
import {
  getComparablePreviousScore,
  getOwnerVisibleScore,
  getOverviewDisplayInsight,
  getOverviewDisplayHighlights,
  getOverviewFallbackInsight,
} from "../rankingsDashboard.utils";
import { HealthGauge } from "./HealthGauge";
import { LocalSearchEstimateSummary } from "./LocalSearchEstimateSummary";
import { ScoreCardCtas } from "./ScoreCardCtas";
import { NextMoves } from "./NextMoves";
import { SearchPositionSection } from "./SearchPositionSection";
import { DriversPanel } from "./DriversPanel";
import { FactorBreakdown } from "./FactorBreakdown";
import { GapsPanel } from "./GapsPanel";

// Performance Dashboard View Component
export function PerformanceDashboard({
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
        scoreTooltip="This 0-100 score summarizes the profile signals behind the estimate, including reviews, rating, category match, profile activity, and consistency. It explains why the estimate looks the way it does; it is not a guaranteed Google rank."
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
