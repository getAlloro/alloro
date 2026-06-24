/**
 * PatientJourneyStageCard — one funnel stage card.
 *
 * Ports the `.pl-card` visual from the validated mock: stage count, optional
 * revenue chip, label, and the leak / goal / flow treatments. Adds an honest
 * per-stage empty state for `value === null || !available` ("not connected
 * yet") and a count-up entrance that respects reduced-motion. Hover is driven
 * by the parent pipeline (active/dim classes) so the tooltip can be positioned
 * once at the row level.
 *
 * Spec: plans/06242026-patient-journey-insights/spec.html (T7)
 */

import { useEffect, useRef, useState } from "react";
import type { PatientJourneyStage } from "../../../types/patientJourney";
import {
  formatRevenue,
  isWholePracticeStage,
  resolveStageKind,
  type StageKind,
} from "./patientJourney.utils";

const COUNT_DURATION_MS = 950;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Animated count-up; renders the final value immediately under reduced motion. */
function useCountUp(target: number | null, enabled: boolean): string {
  const [display, setDisplay] = useState(() =>
    target === null ? "—" : target.toLocaleString(),
  );
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === null) {
      setDisplay("—");
      return;
    }
    if (!enabled || prefersReducedMotion()) {
      setDisplay(target.toLocaleString());
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / COUNT_DURATION_MS);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(target * eased).toLocaleString());
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, enabled]);

  return display;
}

const KIND_CLASSES: Record<StageKind, string> = {
  flow: "border-line-soft bg-white",
  leak: "border-[1.5px] border-[#B7831F] bg-[rgba(217,164,65,0.14)]",
  goal: "border-[#212D40] bg-[#212D40]",
};

interface PatientJourneyStageCardProps {
  stage: PatientJourneyStage;
  index: number;
  total: number;
  isLeak: boolean;
  isActive: boolean;
  animate: boolean;
  isMultiLocation: boolean;
  /** Revenue value to show as a chip on the goal stage; null hides it. */
  revenueValue?: number | null;
  onHoverStart: (el: HTMLElement, index: number) => void;
  onHoverEnd: () => void;
}

export function PatientJourneyStageCard({
  stage,
  index,
  total,
  isLeak,
  isActive,
  animate,
  isMultiLocation,
  revenueValue = null,
  onHoverStart,
  onHoverEnd,
}: PatientJourneyStageCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const available = stage.available && stage.value !== null;
  const kind = resolveStageKind(index, total, isLeak);
  const count = useCountUp(available ? stage.value : null, animate);
  const revenue = formatRevenue(revenueValue);
  const wholePractice = isWholePracticeStage(stage, isMultiLocation);
  const isGoal = kind === "goal";

  const countColor = isGoal ? "text-white" : "text-alloro-navy";
  const labelColor = isGoal ? "text-white/70" : "text-alloro-navy/70";
  const metaColor = isGoal
    ? "text-white/45"
    : kind === "leak"
      ? "text-[#946514]"
      : "text-ink-muted";

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => {
        if (cardRef.current) onHoverStart(cardRef.current, index);
      }}
      onMouseLeave={onHoverEnd}
      className={[
        "relative flex flex-1 flex-col gap-[5px] rounded-[14px] border px-[15px] py-4",
        "min-w-[122px] cursor-pointer transition-all duration-200",
        KIND_CLASSES[kind],
        isActive ? "-translate-y-[3px] shadow-[0_6px_18px_rgba(17,21,28,0.15)] z-[3]" : "",
        animate ? "motion-safe:animate-[plpop_0.5s_cubic-bezier(.2,.7,.2,1)_forwards] motion-safe:opacity-0" : "",
      ].join(" ")}
    >
      {available ? (
        <div className="flex items-baseline gap-[7px]">
          <span
            className={`font-display text-[27px] font-semibold leading-none tabular-nums ${countColor}`}
          >
            {count}
          </span>
          {revenue ? (
            <span className="font-display text-[15px] font-semibold text-alloro-orange">
              {revenue}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="flex items-baseline gap-[7px]">
          <span
            className={`font-display text-[27px] font-semibold leading-none ${isGoal ? "text-white/40" : "text-alloro-navy/30"}`}
          >
            —
          </span>
        </div>
      )}

      <div className={`text-[12.5px] font-semibold ${labelColor}`}>
        {stage.label}
      </div>

      {available ? (
        <div className={`text-[10.5px] font-medium leading-tight ${metaColor}`}>
          {stage.metaLabel}
          {wholePractice ? (
            <span className="mt-0.5 block text-[10px] font-semibold text-[#946514]">
              whole-practice website
            </span>
          ) : null}
        </div>
      ) : (
        <div
          className={`text-[10.5px] font-medium leading-tight ${isGoal ? "text-white/55" : "text-ink-muted"}`}
        >
          Not connected yet
        </div>
      )}
    </div>
  );
}
