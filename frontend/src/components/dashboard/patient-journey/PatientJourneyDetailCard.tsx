/**
 * PatientJourneyDetailCard — centered gate-detail card in the source deck.
 */

import type {
  PatientJourneyConversion,
  PatientJourneyPeriod,
  PatientJourneyStage,
} from "../../../types/patientJourney";
import { PatientJourneyDetailMetricCard } from "./PatientJourneyDetailMetricCard";
import { formatStageValue } from "./patientJourney.utils";
import { buildGateDetailContent } from "./patientJourneyDetailDeck.utils";

type PatientJourneyDetailCardProps = {
  stage: PatientJourneyStage;
  period: PatientJourneyPeriod;
  inbound: PatientJourneyConversion | null;
};

const DETAIL_CARD_SCROLL_CLASS = [
  "max-h-[calc(100vh-150px)]",
  "overflow-y-auto",
  "overscroll-contain",
  "[-ms-overflow-style:none]",
  "[scrollbar-width:none]",
  "[&::-webkit-scrollbar]:hidden",
].join(" ");

export function PatientJourneyDetailCard({
  stage,
  period,
  inbound,
}: PatientJourneyDetailCardProps) {
  const content = buildGateDetailContent(stage, period, inbound);
  const hasSummary = content.summary.length > 0;
  const hasInsights = content.insights.length > 0;

  return (
    <article
      key={stage.key}
      className={[
        "mx-auto flex w-full max-w-[760px] flex-col rounded-[16px]",
        "border border-white/80 bg-white px-6 py-6 text-left",
        "shadow-[0_22px_52px_rgba(17,21,28,0.22)]",
        "motion-safe:animate-[plpop_0.28s_cubic-bezier(.2,.7,.2,1)_forwards]",
        "sm:px-8 sm:py-7",
        DETAIL_CARD_SCROLL_CLASS,
      ].join(" ")}
      aria-live="polite"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-ink-muted">
            Gate details
          </p>
          <h3 className="mt-1 font-display text-[26px] font-semibold leading-none text-alloro-navy">
            {content.title}
          </h3>
        </div>
        <div className="font-display text-[34px] font-semibold leading-none tabular-nums text-alloro-navy">
          {formatStageValue(stage.value)}
        </div>
      </div>

      <p className="mt-4 max-w-[620px] text-[14px] font-semibold leading-snug text-ink-muted">
        {content.description}
      </p>

      {hasSummary ? (
        <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {content.summary.map((item) => (
            <PatientJourneyDetailMetricCard key={item.label} item={item} />
          ))}
        </dl>
      ) : null}

      {hasInsights ? (
        <section className="mt-5">
          <h4 className="text-[11px] font-black uppercase tracking-[0.12em] text-ink-muted">
            {content.insightsTitle}
          </h4>
          <div className="mt-3 space-y-2">
            {content.insights.map((item) => (
              <div
                key={`${item.label}-${item.value ?? ""}`}
                className="flex items-center justify-between gap-3 rounded-[12px] border border-line-soft bg-white px-4 py-3"
              >
                <span className="text-[12.5px] font-bold leading-snug text-alloro-navy">
                  {item.label}
                </span>
                {item.value ? (
                  <span className="shrink-0 text-[12px] font-extrabold text-ink-muted">
                    {item.value}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <p className="mt-5 rounded-[12px] border border-line-soft bg-white px-4 py-3 text-[12.5px] font-semibold leading-relaxed text-ink-muted">
        {content.footer}
      </p>
    </article>
  );
}
