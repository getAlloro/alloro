/**
 * PatientJourneyStageCard — one funnel stage card.
 *
 * Ports the `.pl-card` visual from the validated mock: stage count, label,
 * and the leak / goal / flow treatments. Adds an honest
 * per-stage empty state for `value === null || !available` ("not connected
 * yet") and a count-up entrance that respects reduced-motion. Click selection
 * is driven by the parent pipeline so the detail popover can stay row-level.
 *
 * Spec: plans/06242026-patient-journey-insights/spec.html (T7)
 */

import { useEffect, useRef, useState } from "react";
import type { PatientJourneyStage } from "../../../types/patientJourney";
import {
  resolveStageKind,
  stageGateLabel,
  stageGateSubtext,
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
  flow: "border-line-soft bg-white shadow-[0_12px_28px_rgba(17,21,28,0.07)]",
  leak: "border-[1.5px] border-[#B7831F] bg-[rgba(217,164,65,0.14)] shadow-[0_12px_28px_rgba(183,131,31,0.13)]",
  goal: "border-[#212D40] bg-[#212D40] shadow-[0_14px_30px_rgba(17,21,28,0.2)]",
};

interface PatientJourneyStageCardProps {
  stage: PatientJourneyStage;
  index: number;
  total: number;
  isLeak: boolean;
  isActive: boolean;
  animate: boolean;
  onSelect: () => void;
}

export function PatientJourneyStageCard({
  stage,
  index,
  total,
  isLeak,
  isActive,
  animate,
  onSelect,
}: PatientJourneyStageCardProps) {
  const cardRef = useRef<HTMLButtonElement | null>(null);
  const available = stage.available && stage.value !== null;
  const kind = resolveStageKind(index, total, isLeak);
  const count = useCountUp(available ? stage.value : null, animate);
  const isGoal = kind === "goal";
  const label = stageGateLabel(stage);
  const subtext = stageGateSubtext(stage);

  const countColor = isGoal ? "text-white" : "text-alloro-navy";
  const labelColor = isGoal ? "text-white/85" : "text-alloro-navy/75";
  const mutedColor = isGoal ? "text-white/55" : "text-ink-muted";

  return (
    <button
      type="button"
      ref={cardRef}
      onClick={onSelect}
      aria-pressed={isActive}
      aria-expanded={isActive}
      aria-controls={isActive ? "patient-journey-detail-popover" : undefined}
      aria-label={`Show details for ${label}`}
      className={[
        "relative flex flex-1 appearance-none flex-col items-center justify-center gap-[6px] rounded-[14px] border px-3 py-[15px] text-center",
        "min-w-[116px] cursor-pointer transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-alloro-orange/20",
        KIND_CLASSES[kind],
        isActive
          ? "-translate-y-[3px] shadow-[0_16px_34px_rgba(17,21,28,0.18)] z-[3]"
          : "",
        animate
          ? "motion-safe:animate-[plpop_0.5s_cubic-bezier(.2,.7,.2,1)_forwards] motion-safe:opacity-0"
          : "",
      ].join(" ")}
    >
      {available ? (
        <div className="flex items-baseline justify-center gap-[7px]">
          <span
            className={`font-display text-[27px] font-semibold leading-none tabular-nums ${countColor}`}
          >
            {count}
          </span>
        </div>
      ) : (
        <div className="flex items-baseline justify-center gap-[7px]">
          <span
            className={`font-display text-[27px] font-semibold leading-none ${isGoal ? "text-white/40" : "text-alloro-navy/30"}`}
          >
            —
          </span>
        </div>
      )}

      <div className={`text-center text-[12.5px] font-semibold ${labelColor}`}>
        {label}
      </div>

      <div
        className={`text-center text-[10px] font-medium leading-tight ${mutedColor}`}
      >
        {subtext}
      </div>

      {!available ? (
        <div
          className={`text-center text-[10.5px] font-medium leading-tight ${mutedColor}`}
        >
          Not connected yet
        </div>
      ) : null}
    </button>
  );
}
