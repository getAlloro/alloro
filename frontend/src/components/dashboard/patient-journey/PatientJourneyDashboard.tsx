/**
 * PatientJourneyDashboard — the Patient Journey Insights surface.
 *
 * Renders the validated horizontal funnel (cards + arrows), the advisor
 * summary, and rank/reviews context from the typed `usePatientJourney()`
 * payload. Title and journey wording come from `useLabels()` so a
 * `generic`-type org reads "Customer Journey Insights" end-to-end. Mirrors
 * RankingsDashboard's props + loading/error/empty structure. Per-stage empty
 * states live inside the pipeline cards; this file owns the whole-screen
 * loading / error / no-data states.
 *
 * Spec: plans/06242026-patient-journey-insights/spec.html (T7)
 */

import { useEffect, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { usePatientJourney } from "../../../hooks/queries/usePatientJourney";
import { useLabels } from "../../../hooks/useLabels";
import { useLocationContext } from "../../../contexts/locationContext";
import { PatientJourneyPipeline } from "./PatientJourneyPipeline";
import { PatientJourneyContextCards } from "./PatientJourneyContextCards";
import {
  MONTH_HISTORY_LIMIT,
  formatPrecisePct,
  monthKeyFromOffset,
} from "./patientJourney.utils";

const MONTH_NAV_BUTTON_CLASS =
  "rounded-lg border border-line-soft p-1.5 text-ink-muted transition-colors hover:bg-slate-50 hover:text-alloro-navy disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-ink-muted";

interface PatientJourneyDashboardProps {
  organizationId: number | null;
  locationId: number | null;
}

function LoadingState() {
  return (
    <div className="mx-auto w-full max-w-[1040px] px-4 py-10 sm:px-8">
      <div className="mb-6 h-8 w-64 animate-pulse rounded-full bg-slate-100" />
      <div className="mb-6 h-24 animate-pulse rounded-[16px] bg-slate-100" />
      <div className="flex gap-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-32 flex-1 animate-pulse rounded-[14px] bg-slate-100"
          />
        ))}
      </div>
    </div>
  );
}

function CenteredCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-premium">
        {children}
      </div>
    </div>
  );
}

interface MonthNavigationProps {
  monthOffset: number;
  onStep: (delta: number) => void;
}

/** Prev/next month chevrons, clamped to [current − 11 … current] months. */
function MonthNavigation({ monthOffset, onStep }: MonthNavigationProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Previous month"
        disabled={monthOffset <= 1 - MONTH_HISTORY_LIMIT}
        onClick={() => onStep(-1)}
        className={MONTH_NAV_BUTTON_CLASS}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Next month"
        disabled={monthOffset >= 0}
        onClick={() => onStep(1)}
        className={MONTH_NAV_BUTTON_CLASS}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function advisorBannerText(
  conversions: Array<{ toKey: string; pct: number | null }>,
  periodLabel: string,
  isCurrentMonth: boolean,
): string {
  const leadConversion = conversions.find((conversion) => conversion.toKey === "leads");
  if (leadConversion?.pct === null || leadConversion?.pct === undefined) {
    return "Your lead pipeline is ready. Review each step to see where visibility, visits, and leads are moving.";
  }
  const timePhrase = isCurrentMonth ? "this month" : `in ${periodLabel}`;
  return `Your visibility is strong. Your website conversion is your largest opportunity. Only ${formatPrecisePct(leadConversion.pct)} of website visitors contacted your practice ${timePhrase}.`;
}

export function PatientJourneyDashboard({
  organizationId,
  locationId,
}: PatientJourneyDashboardProps) {
  const labels = useLabels();
  const { signalContentReady } = useLocationContext();
  // 0 = current month, -1 = last month … clamped at MONTH_HISTORY_LIMIT months.
  const [monthOffset, setMonthOffset] = useState(0);
  // The current month keeps the period-less query key so the Practice Hub
  // summary card's request stays deduped with this screen's.
  const period = monthOffset < 0 ? monthKeyFromOffset(monthOffset) : undefined;
  const { data, isLoading, isFetching, isError, error, refetch } =
    usePatientJourney(organizationId, locationId, period);

  // A location switch always lands back on the current month.
  useEffect(() => {
    setMonthOffset(0);
  }, [locationId]);

  // Signal the location-transition overlay once the surface has resolved.
  useEffect(() => {
    if (!isLoading) signalContentReady();
  }, [isLoading, signalContentReady]);

  if (isLoading) return <LoadingState />;

  if (isError) {
    return (
      <CenteredCard>
        <div className="mx-auto mb-4 w-fit rounded-2xl bg-red-50 p-4">
          <AlertCircle className="h-10 w-10 text-red-500" />
        </div>
        <h3 className="mb-2 font-display text-xl font-medium tracking-tight text-alloro-navy">
          Unable to load {labels.journeyInsights}
        </h3>
        <p className="mb-6 text-sm font-bold text-slate-500">
          {error instanceof Error ? error.message : "Something went wrong."}
        </p>
        <button
          onClick={() => refetch()}
          className="mx-auto flex items-center gap-2 rounded-xl bg-alloro-orange px-6 py-3 text-sm font-black uppercase tracking-widest text-white transition-colors hover:bg-orange-600"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </button>
      </CenteredCard>
    );
  }

  if (!data) {
    return (
      <CenteredCard>
        <div className="mx-auto mb-4 w-fit rounded-2xl bg-slate-100 p-4">
          <TrendingUp className="h-10 w-10 text-slate-400" />
        </div>
        <h3 className="mb-2 font-display text-xl font-medium tracking-tight text-alloro-navy">
          {labels.journeyInsights} coming soon
        </h3>
        <p className="text-sm font-bold text-slate-500">
          Connect your data sources to see your {labels.customer} funnel from
          search to booked {labels.customers}.
        </p>
      </CenteredCard>
    );
  }

  return (
    <div className="min-h-screen bg-alloro-bg pb-14 font-body text-alloro-navy">
      <main className="mx-auto w-full max-w-[1040px] space-y-6 px-4 py-10 sm:px-8">
        <header>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-alloro-navy/45">
            Lead pipeline overview
          </div>
          <h1 className="font-display text-[28px] font-medium tracking-tight text-alloro-navy">
            {labels.journeyInsights}
          </h1>
          <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-alloro-navy/55">
            Three gates from Google visibility to website leads, with source
            details one click away.
          </p>
        </header>

        {/* Advisor summary — descriptive only, never a prediction. */}
        <div className="rounded-[16px] border border-cream-line bg-cream px-7 py-5 shadow-premium sm:px-8 sm:py-6">
          <p className="max-w-[860px] font-display text-[16.5px] leading-[1.55] text-alloro-navy sm:text-[18px]">
            {advisorBannerText(
              data.conversions,
              data.period.label,
              monthOffset === 0,
            )}
          </p>
        </div>

        {/* The pipeline + context cards */}
        <section className="rounded-[14px] border border-line-soft bg-white px-6 pb-7 pt-6 shadow-premium">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Your Lead Pipeline{" "}
              <span className="font-medium text-ink-muted/60">
                &middot; {data.period.label}
              </span>
            </p>
            <MonthNavigation
              monthOffset={monthOffset}
              onStep={(delta) => setMonthOffset((offset) => offset + delta)}
            />
          </div>

          {/* Dim (and lock) the month-scoped content while a step refetches;
              the previous month stays visible via the hook's placeholderData.
              The key remount resets card selection per month. */}
          <div
            className={
              isFetching && !isLoading
                ? "pointer-events-none opacity-50 transition-opacity"
                : "transition-opacity"
            }
          >
            <PatientJourneyPipeline
              key={data.period.startDate}
              journey={data}
            />

            <div className="mt-6 border-t border-line-soft pt-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                What&rsquo;s influencing your leads
              </p>
              <PatientJourneyContextCards context={data.context} />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default PatientJourneyDashboard;
