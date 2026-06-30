/**
 * PatientJourneyArrow — the connector between two stage cards.
 *
 * Ports the `.pl-arrow` visual from the validated mock: the inbound conversion
 * percentage, a right-pointing arrow, and a caption. A `null` percentage (a
 * stage whose source is unavailable) renders an em-dash, never a fake 0%.
 *
 * Spec: plans/06242026-patient-journey-insights/spec.html (T7)
 */

import { formatPct } from "./patientJourney.utils";

interface PatientJourneyArrowProps {
  pct: number | null;
  caption: string;
  isLeak: boolean;
  animate: boolean;
}

export function PatientJourneyArrow({
  pct,
  caption,
  isLeak,
  animate,
}: PatientJourneyArrowProps) {
  const color = isLeak ? "text-[#B7831F]" : "text-[#c9c1b4]";
  const pctColor = isLeak ? "text-[#B7831F]" : "text-alloro-navy";
  const capColor = isLeak ? "text-[#B7831F] font-extrabold" : "text-ink-muted";

  return (
    <div
      className={[
        // Fill the stretched wrapper so the connector can sit at the card's
        // vertical midpoint.
        "flex h-full shrink-0 items-center justify-center px-[3px]",
        isLeak ? "w-[74px]" : "w-[66px]",
        color,
        animate ? "motion-safe:animate-[plfade_0.45s_ease_forwards] motion-safe:opacity-0" : "",
      ].join(" ")}
    >
      <div className="flex h-full w-full flex-col items-center justify-center gap-[3px] text-center">
        <div
          className={`tabular-nums font-bold ${isLeak ? "text-[13px]" : "text-[12px]"} ${pctColor}`}
        >
          {formatPct(pct)}
        </div>
        <svg
          viewBox="0 0 40 16"
          width="40"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={isLeak ? "motion-safe:animate-[plnudge_1.7s_ease-in-out_infinite]" : ""}
          aria-hidden="true"
        >
          <path d="M2 8h32" />
          <path d="M30 3l6 5-6 5" />
        </svg>
        <div
          className={`text-center text-[9px] uppercase leading-tight tracking-[0.03em] ${capColor}`}
        >
          {caption}
        </div>
      </div>
    </div>
  );
}
