/**
 * PatientJourneyPipeline — the horizontal card + arrow funnel.
 *
 * Lays out the stage cards joined by arrow connectors (the validated
 * `funnel-pipeline.html` visual). Owns the row-level interaction state: which
 * card is selected and which full source-detail popover is open. Runs the
 * staggered entrance animation once on mount; reduced-motion users get the
 * final state with no animation.
 *
 * Stage values + conversions come straight from the typed contract — a stage
 * with `value === null` renders its own empty state inside the card, and a
 * `null` conversion renders an em-dash arrow.
 *
 * Spec: plans/06242026-patient-journey-insights/spec.html (T7, Rev 9)
 */

import { useEffect, useState } from "react";
import type { PatientJourney } from "../../../types/patientJourney";
import { PatientJourneyStageCard } from "./PatientJourneyStageCard";
import { PatientJourneyArrow } from "./PatientJourneyArrow";
import { PatientJourneyDetailDeck } from "./PatientJourneyDetailDeck";
import {
  conversionCaption,
  conversionHelpText,
  shouldShowConversionPct,
} from "./patientJourney.utils";

interface PatientJourneyPipelineProps {
  journey: PatientJourney;
}

// Bleeds the scroll container 20px past the card edges so hover lift-shadows fit.
const PIPELINE_SCROLLER_CLASS =
  "flex items-stretch gap-0 overflow-x-auto overflow-y-hidden -mx-5 px-5 pb-7 pt-16";

export function PatientJourneyPipeline({
  journey,
}: PatientJourneyPipelineProps) {
  const { stages, conversions } = journey;
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [animate, setAnimate] = useState(false);

  // Trigger the entrance animation once after first paint.
  useEffect(() => {
    setAnimate(true);
    const id = window.setTimeout(() => setAnimate(false), 1100);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (selectedIndex === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedIndex(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIndex]);

  return (
    <div className="relative">
      <div
        className={[
          PIPELINE_SCROLLER_CLASS,
          selectedIndex !== null ? "[&_.pj-dimmable]:opacity-[0.42]" : "",
        ].join(" ")}
      >
        {stages.map((stage, index) => {
          const conv = index > 0 ? conversions[index - 1] : null;
          const isActive = selectedIndex === index;
          return (
            <div key={stage.key} className="contents">
              {conv ? (
                <div
                  className={
                    selectedIndex !== null && !isActive
                      ? "pj-dimmable flex self-stretch transition-opacity"
                      : "flex self-stretch transition-opacity"
                  }
                >
                  <PatientJourneyArrow
                    pct={conv.pct}
                    caption={conversionCaption(conv.toKey)}
                    isLeak={conv.isLeak && shouldShowConversionPct(conv.toKey)}
                    animate={animate}
                    showPct={shouldShowConversionPct(conv.toKey)}
                    helpText={conversionHelpText(conv.toKey)}
                  />
                </div>
              ) : null}
              <div
                data-pj-stage={index}
                className={[
                  "flex flex-1",
                  selectedIndex !== null && !isActive
                    ? "pj-dimmable saturate-[0.75] transition-all"
                    : "transition-all",
                ].join(" ")}
              >
                <PatientJourneyStageCard
                  stage={stage}
                  index={index}
                  total={stages.length}
                  isLeak={false}
                  isActive={isActive}
                  animate={animate}
                  onSelect={() => setSelectedIndex(index)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {selectedIndex !== null ? (
        <PatientJourneyDetailDeck
          journey={journey}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onClose={() => setSelectedIndex(null)}
        />
      ) : null}
    </div>
  );
}
