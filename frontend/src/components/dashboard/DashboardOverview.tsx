/**
 * DashboardOverview — Focus tab content (Plan 2 redesign).
 *
 * Thin composition of the new card components under
 * `frontend/src/components/dashboard/focus/`. The legacy 1700-line file
 * was replaced wholesale; the new file is intentionally minimal and
 * delegates all heavy lifting to the child components, each of which
 * fetches its own data via React Query hooks.
 *
 * Plan: plans/04282026-no-ticket-focus-dashboard-frontend/spec.md (T20)
 *
 * Layout:
 *   <SetupProgressBanner />          (only when org incomplete)
 *   <FocusHeader />                  (small "Focus — {Month YYYY}" eyebrow)
 *   <Hero />                         (top_actions[0] from Summary v2)
 *   <Trajectory /> | <ActionQueue /> (2/1 grid)
 *   <WebsiteCard /> <LocalRankingCard /> <PMSCard />  (3-col grid)
 *
 * Data sources are the new endpoints from Plan 1 (backend):
 *   GET /api/dashboard/metrics
 *   GET /api/user/website/form-submissions/timeseries
 *   GET /api/practice-ranking/history
 * Plus existing endpoints for tasks (Hero/Queue), agents/latest (Trajectory),
 * pms/keyData (PMS card), practice-ranking/latest (Ranking card).
 */

import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useLocationContext } from "../../contexts/locationContext";
import { usePmsFocusPeriod } from "../../hooks/queries/usePmsFocusPeriod";
import type { PmsFocusPeriod } from "../../utils/pmsFocusPeriod";
import { Hero } from "./focus/Hero";
import { Trajectory } from "./focus/Trajectory";
import { ActionQueue } from "./focus/ActionQueue";
import WebsiteCard from "./focus/WebsiteCard";
import LocalRankingCard from "./focus/LocalRankingCard";
import PMSCard from "./focus/PMSCard";
import { SetupProgressBanner } from "./focus/SetupProgressBanner";
import { useIsWizardActive } from "../../contexts/OnboardingWizardContext";

interface DashboardOverviewProps {
  // Legacy props — kept for backward compatibility with Dashboard.tsx tab
  // dispatch. The new card components self-fetch via useAuth + useLocationContext
  // and do not require these to be threaded down.
  organizationId?: number | null;
  locationId?: number | null;
}

type FocusHeaderProps = {
  period: PmsFocusPeriod;
};

function FocusHeader({ period }: FocusHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-6 mb-6">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6B7280] mb-2">
          The month at a glance
        </div>
        <h2 className="font-display text-[28px] font-normal tracking-tight text-[#1A1A1A]">
          Focus — {period.focusMonthLabel}
        </h2>
        <p className="mt-1.5 text-[13px] text-[#6B7280] max-w-[540px] leading-relaxed">
          One priority. Everything else, in order.
        </p>
      </div>
      <div className="hidden md:flex flex-col items-end gap-3">
        <div className="flex items-center gap-3.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#6B7280]">
          <span>Period</span>
          <span className="font-display text-[22px] font-medium text-[#1A1A1A] tracking-tight">
            {period.periodLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

function PmsUploadNudge({ period }: { period: PmsFocusPeriod }) {
  if (!period.isStale) return null;

  return (
    <section className="flex flex-col gap-4 rounded-[14px] border border-[#E8E4DD] bg-[#FDFDFD] px-6 py-5 shadow-[0_14px_35px_rgba(17,21,28,0.06)] md:flex-row md:items-center md:justify-between">
      <div>
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-alloro-orange">
          Ready for the next focus?
        </div>
        <h3 className="font-display text-[22px] font-medium tracking-tight text-[#1A1A1A]">
          {period.nudgeTitle}
        </h3>
        <p className="mt-1 max-w-[640px] text-[13px] leading-relaxed text-[#6B7280]">
          {period.nudgeBody}
        </p>
      </div>
      <Link
        to="/pmsStatistics"
        className="inline-flex items-center justify-center rounded-full bg-alloro-orange px-5 py-3 text-[12px] font-bold uppercase tracking-[0.12em] text-white shadow-[0_8px_20px_rgba(214,104,83,0.28)] transition-all hover:-translate-y-px hover:bg-[#B86650]"
      >
        Upload PMS data
      </Link>
    </section>
  );
}

export function DashboardOverview(props: DashboardOverviewProps) {
  const isWizardActive = useIsWizardActive();
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();
  const organizationId =
    props.organizationId ?? userProfile?.organizationId ?? null;
  const locationId = props.locationId ?? selectedLocation?.id ?? null;
  const { period, isLoading } = usePmsFocusPeriod(
    organizationId,
    locationId,
  );
  const hasPmsData = isWizardActive
    ? true
    : isLoading || !organizationId
      ? true
      : period.hasPmsData;

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16 space-y-6">
      <SetupProgressBanner />
      {!isWizardActive && <PmsUploadNudge period={period} />}
      <FocusHeader period={period} />

      <Hero hasPmsData={hasPmsData} />

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Trajectory />
        <ActionQueue />
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <WebsiteCard />
        <LocalRankingCard />
        <PMSCard />
      </div>
    </div>
  );
}
