/**
 * PatientJourneyDetailDeck — full click-open source detail popover.
 *
 * Uses only the existing patient-journey payload. The center card explains the
 * selected stage; adjacent cards stay summary-only and can be clicked to slide
 * the deck left/right.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { PatientJourney } from "../../../types/patientJourney";
import { conversionInto, stageGateLabel } from "./patientJourney.utils";
import { PatientJourneyDetailCard } from "./PatientJourneyDetailCard";

type PatientJourneyDetailDeckProps = {
  journey: PatientJourney;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
};

export function PatientJourneyDetailDeck({
  journey,
  selectedIndex,
  onSelect,
  onClose,
}: PatientJourneyDetailDeckProps) {
  const { stages, conversions, period } = journey;
  const stage = stages[selectedIndex];
  const prevStage = selectedIndex > 0 ? stages[selectedIndex - 1] : null;
  const nextStage =
    selectedIndex < stages.length - 1 ? stages[selectedIndex + 1] : null;
  const inbound = conversionInto(conversions, stage.key);
  const canGoPrevious = prevStage !== null;
  const canGoNext = nextStage !== null;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-pj-detail-popover
      className="fixed inset-0 z-[80] flex items-center justify-center bg-alloro-navy/55 px-4 py-6 backdrop-blur-[7px] sm:px-8"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-5 top-5 z-20 inline-flex h-11 w-11 items-center justify-center rounded-[10px] bg-transparent text-white/90 transition hover:bg-white/10 focus:outline-none focus:ring-4 focus:ring-white/20"
        aria-label="Close stage details"
      >
        <X className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => canGoPrevious && onSelect(selectedIndex - 1)}
        disabled={!canGoPrevious}
        className="absolute left-4 top-1/2 z-20 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-[12px] bg-transparent text-white/90 transition hover:bg-white/10 focus:outline-none focus:ring-4 focus:ring-white/20 disabled:cursor-not-allowed disabled:text-white/25 disabled:hover:bg-transparent sm:left-7"
        aria-label="Show previous stage"
      >
        <ChevronLeft className="h-7 w-7" />
      </button>
      <button
        type="button"
        onClick={() => canGoNext && onSelect(selectedIndex + 1)}
        disabled={!canGoNext}
        className="absolute right-4 top-1/2 z-20 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-[12px] bg-transparent text-white/90 transition hover:bg-white/10 focus:outline-none focus:ring-4 focus:ring-white/20 disabled:cursor-not-allowed disabled:text-white/25 disabled:hover:bg-transparent sm:right-7"
        aria-label="Show next stage"
      >
        <ChevronRight className="h-7 w-7" />
      </button>
      <section
        id="patient-journey-detail-popover"
        role="dialog"
        aria-modal="true"
        aria-label={`${stageGateLabel(stage)} details`}
        className="w-full max-w-[900px] px-4 motion-safe:animate-[plpop_0.22s_cubic-bezier(.2,.7,.2,1)_forwards] sm:px-12"
      >
        <div className="mb-5 text-center text-[12px] font-black uppercase tracking-[0.18em] text-white/70">
          Growth gate
        </div>

        <div>
          <PatientJourneyDetailCard
            stage={stage}
            period={period}
            inbound={inbound}
          />
        </div>

        <div className="mt-5 flex items-center justify-center gap-2">
          {stages.map((dotStage, index) => (
            <button
              key={dotStage.key}
              type="button"
              onClick={() => onSelect(index)}
              className={[
                "h-2.5 rounded-full transition-all focus:outline-none focus:ring-4 focus:ring-white/20",
                index === selectedIndex
                  ? "w-7 bg-white"
                  : "w-2.5 bg-white/35 hover:bg-white/60",
              ].join(" ")}
              aria-label={`Show ${stageGateLabel(dotStage)} details`}
              aria-current={index === selectedIndex ? "step" : undefined}
            />
          ))}
        </div>
      </section>
    </div>,
    document.body,
  );
}
