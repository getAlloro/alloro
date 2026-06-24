/**
 * PatientJourneyPipeline — the horizontal card + arrow funnel.
 *
 * Lays out the stage cards joined by arrow connectors (the validated
 * `funnel-pipeline.html` visual). Owns the row-level interaction state: which
 * card is hovered (lift it, dim the rest) and a single floating tooltip
 * positioned over the active card. Runs the staggered entrance animation once
 * on mount; reduced-motion users get the final state with no animation.
 *
 * Stage values + conversions come straight from the typed contract — a stage
 * with `value === null` renders its own empty state inside the card, and a
 * `null` conversion renders an em-dash arrow.
 *
 * Spec: plans/06242026-patient-journey-insights/spec.html (T7)
 */

import { forwardRef, useEffect, useRef, useState } from "react";
import type {
  PatientJourney,
  PatientJourneyConversion,
  PatientJourneyStage,
} from "../../../types/patientJourney";
import { PatientJourneyStageCard } from "./PatientJourneyStageCard";
import { PatientJourneyArrow } from "./PatientJourneyArrow";
import { conversionInto, formatPct, stageTooltip } from "./patientJourney.utils";

interface TooltipState {
  index: number;
  left: number;
  top: number;
}

/** Floating detail tooltip for the hovered stage card. */
const PipelineTooltip = forwardRef<
  HTMLDivElement,
  {
    left: number;
    top: number;
    stage: PatientJourneyStage;
    conversion: PatientJourneyConversion | null;
    isFirst: boolean;
  }
>(function PipelineTooltip({ left, top, stage, conversion, isFirst }, ref) {
  const note = stageTooltip(stage);
  return (
    <div
      ref={ref}
      role="tooltip"
      style={{ left, top }}
      className="pointer-events-none fixed z-[60] w-max max-w-[240px] rounded-[11px] bg-alloro-navy px-[14px] py-[11px] text-white shadow-[0_16px_40px_rgba(0,0,0,0.26)]"
    >
      <div className="font-display text-[15px] font-semibold tabular-nums">
        {stage.value !== null
          ? stage.value.toLocaleString()
          : "Not connected yet"}
      </div>
      <div className="mt-1 text-[12px] leading-snug text-white/80">
        {stage.label}
        {note ? `: ${note}` : ""}
      </div>
      <div className="mt-1.5 text-[11px] font-bold text-[#F4D9A0]">
        {isFirst || conversion === null
          ? "Top of your funnel"
          : `↓ ${formatPct(conversion.pct)} from the step before`}
      </div>
    </div>
  );
});

interface PatientJourneyPipelineProps {
  journey: PatientJourney;
}

export function PatientJourneyPipeline({
  journey,
}: PatientJourneyPipelineProps) {
  const { stages, conversions, leakStageKey } = journey;
  const isMultiLocation = journey.location.isMultiLocation;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [animate, setAnimate] = useState(false);
  const tipRef = useRef<HTMLDivElement | null>(null);

  // Trigger the entrance animation once after first paint.
  useEffect(() => {
    setAnimate(true);
    const id = window.setTimeout(() => setAnimate(false), 1100);
    return () => window.clearTimeout(id);
  }, []);

  // Hide the tooltip on scroll so it never floats detached from its card.
  useEffect(() => {
    const onScroll = () => {
      setActiveIndex(null);
      setTooltip(null);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleHoverStart = (el: HTMLElement, index: number) => {
    setActiveIndex(index);
    const rect = el.getBoundingClientRect();
    const tipWidth = 240;
    const left = Math.max(
      8,
      Math.min(
        rect.left + rect.width / 2 - tipWidth / 2,
        window.innerWidth - tipWidth - 8,
      ),
    );
    // Provisional top above the card; refined once the tip measures itself.
    setTooltip({ index, left, top: rect.top - 12 });
  };

  // Refine vertical placement after the tooltip has a measured height.
  useEffect(() => {
    if (tooltip === null || tipRef.current === null) return;
    const card = document.querySelector<HTMLElement>(
      `[data-pj-stage="${tooltip.index}"]`,
    );
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const th = tipRef.current.offsetHeight;
    const above = rect.top - th - 10;
    const top = above < 8 ? rect.bottom + 10 : above;
    if (Math.abs(top - tooltip.top) > 1) {
      setTooltip((prev) => (prev ? { ...prev, top } : prev));
    }
  }, [tooltip]);

  const handleHoverEnd = () => {
    setActiveIndex(null);
    setTooltip(null);
  };

  const activeStage = tooltip !== null ? stages[tooltip.index] : null;
  const activeConversion =
    activeStage !== null
      ? conversionInto(conversions, activeStage.key)
      : null;

  return (
    <div className="relative">
      <div
        className={[
          "flex items-stretch gap-0 overflow-x-auto overflow-y-hidden px-[2px] pb-6 pt-4",
          activeIndex !== null ? "[&_.pj-dimmable]:opacity-[0.42]" : "",
        ].join(" ")}
      >
        {stages.map((stage, index) => {
          const conv = index > 0 ? conversions[index - 1] : null;
          const isLeak = stage.key === leakStageKey;
          const isGoal = index === stages.length - 1;
          const revenueValue = isGoal ? journey.revenue.value : null;
          const isActive = activeIndex === index;
          return (
            <div key={stage.key} className="contents">
              {conv ? (
                <div
                  className={
                    activeIndex !== null && !isActive
                      ? "pj-dimmable transition-opacity"
                      : "transition-opacity"
                  }
                >
                  <PatientJourneyArrow
                    pct={conv.pct}
                    caption={conv.label}
                    isLeak={conv.isLeak}
                    animate={animate}
                  />
                </div>
              ) : null}
              <div
                data-pj-stage={index}
                className={[
                  "flex flex-1",
                  activeIndex !== null && !isActive
                    ? "pj-dimmable saturate-[0.75] transition-all"
                    : "transition-all",
                ].join(" ")}
              >
                <PatientJourneyStageCard
                  stage={stage}
                  index={index}
                  total={stages.length}
                  isLeak={isLeak}
                  isActive={isActive}
                  animate={animate}
                  isMultiLocation={isMultiLocation}
                  revenueValue={revenueValue}
                  onHoverStart={handleHoverStart}
                  onHoverEnd={handleHoverEnd}
                />
              </div>
            </div>
          );
        })}
      </div>

      {tooltip !== null && activeStage !== null ? (
        <PipelineTooltip
          ref={tipRef}
          left={tooltip.left}
          top={tooltip.top}
          stage={activeStage}
          conversion={activeConversion}
          isFirst={tooltip.index === 0}
        />
      ) : null}
    </div>
  );
}
