/**
 * PatientJourneyContextCards — the two "what's shaping your funnel" cards.
 *
 * Ports the `.pl-info-card` pair from the validated mock: local rank and
 * reviews. Each card renders an honest empty state when its context source is
 * unavailable rather than printing zeros.
 *
 * Spec: plans/06242026-patient-journey-insights/spec.html (T7)
 */

import type { ReactNode } from "react";
import { Trophy, Star } from "lucide-react";
import type { PatientJourneyContext } from "../../../types/patientJourney";

function InfoCardShell({
  icon,
  stat,
  lines,
}: {
  icon: ReactNode;
  stat: string;
  lines: string[];
}) {
  return (
    <div className="flex flex-col gap-[7px] rounded-[14px] border border-[#E7CE8E] bg-[#FAEEDA] px-[15px] py-[13px]">
      <div className="flex items-center gap-[9px]">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-[#E7CE8E] bg-white text-[#B7831F]">
          {icon}
        </span>
        <span className="text-[13.5px] font-bold tabular-nums text-alloro-navy">
          {stat}
        </span>
      </div>
      <div>
        {lines.map((line) => (
          <div key={line} className="text-[11.5px] leading-snug text-[#7d6a45]">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

interface PatientJourneyContextCardsProps {
  context: PatientJourneyContext;
}

export function PatientJourneyContextCards({
  context,
}: PatientJourneyContextCardsProps) {
  const { rank, reviews } = context;

  const rankStat =
    rank.available && rank.position !== null
      ? rank.totalCompetitors !== null
        ? `#${rank.position} of ${rank.totalCompetitors} locally`
        : `#${rank.position} locally`
      : "Rank not available yet";

  // FIX 4: the stored-row count is dropped here so it cannot contradict
  // Google's all-time total (the aggregate lives on exactly one surface, GBP).
  const reviewStat =
    reviews.available && reviews.rating !== null
      ? `${reviews.rating.toFixed(1)}★`
      : "Reviews not connected yet";

  const reviewLines: string[] = [];
  // Lead with the Memorable card's caught insight + one move, when present.
  if (reviews.card) {
    reviewLines.push(reviews.card.headline);
    reviewLines.push(reviews.card.action);
  }
  if (reviews.available) {
    if (reviews.newThisMonth !== null) {
      reviewLines.push(`${reviews.newThisMonth} new reviews this month`);
    }
    if (reviews.replyRatePct !== null) {
      reviewLines.push(`Replied to ${Math.round(reviews.replyRatePct)}%`);
    }
  }
  if (reviewLines.length === 0) {
    reviewLines.push("Connect your Google Business Profile to track reviews");
  }

  const rankLines: string[] = rank.available
    ? ["Your local search standing"]
    : ["Run a ranking to see where you stand"];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <InfoCardShell
        icon={<Trophy width={14} height={14} aria-hidden="true" />}
        stat={rankStat}
        lines={rankLines}
      />
      <InfoCardShell
        icon={<Star width={14} height={14} aria-hidden="true" />}
        stat={reviewStat}
        lines={reviewLines}
      />
    </div>
  );
}
