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
 *   <DashboardAlertStack />          (cascaded alerts: stale-data, upload nudge, setup)
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

import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useLocationContext } from "../../contexts/locationContext";
import { usePmsFocusPeriod } from "../../hooks/queries/usePmsFocusPeriod";
import { useRerunPmsInsights } from "../../hooks/queries/usePmsFileManagerQueries";
import { buildDashboardAlerts } from "../../utils/dashboardAlerts";
import { DashboardAlertStack } from "./alerts/DashboardAlertStack";
import { showErrorToast, showSparkleToast } from "../../lib/toast";
import type { PmsFocusPeriod } from "../../utils/pmsFocusPeriod";
import { Hero } from "./focus/Hero";
import { Trajectory } from "./focus/Trajectory";
import { ActionQueue } from "./focus/ActionQueue";
import WebsiteCard from "./focus/WebsiteCard";
import LocalRankingCard from "./focus/LocalRankingCard";
import PMSCard from "./focus/PMSCard";
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

export function DashboardOverview(props: DashboardOverviewProps) {
  const isWizardActive = useIsWizardActive();
  const navigate = useNavigate();
  const { userProfile, onboardingCompleted } = useAuth();
  const { selectedLocation } = useLocationContext();
  const organizationId =
    props.organizationId ?? userProfile?.organizationId ?? null;
  const locationId = props.locationId ?? selectedLocation?.id ?? null;
  const { period, insightsStale, isLoading } = usePmsFocusPeriod(
    organizationId,
    locationId,
  );
  const rerunInsights = useRerunPmsInsights(organizationId, locationId);
  const hasPmsData = isWizardActive
    ? true
    : isLoading || !organizationId
      ? true
      : period.hasPmsData;

  // "Get updated insights" on the dashboard kicks off the rerun, then routes to
  // the Referrals Hub where the animated processing card lives.
  const handleGetUpdatedInsights = async () => {
    if (!locationId) return;
    try {
      const response = await rerunInsights.mutateAsync();
      if (!response.success) {
        showErrorToast(
          "Couldn't refresh insights",
          response.error || "Please try again.",
        );
        return;
      }
      showSparkleToast(
        "Refreshing insights",
        "We're re-running the analysis with your latest data.",
      );
      navigate("/pmsStatistics");
    } catch {
      showErrorToast("Couldn't refresh insights", "Please try again.");
    }
  };

  const alerts = buildDashboardAlerts({
    insightsStale,
    focusPeriod: period,
    isOnboardingIncomplete: onboardingCompleted === false,
    actions: {
      // Stale + upload alerts are suppressed during the onboarding wizard.
      getUpdatedInsights: isWizardActive
        ? undefined
        : { onClick: handleGetUpdatedInsights, loading: rerunInsights.isPending },
      uploadData: isWizardActive ? undefined : { to: "/pmsStatistics" },
      continueSetup: { to: "/new-account-onboarding" },
    },
  });

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16 space-y-6">
      {alerts.length > 0 && <DashboardAlertStack alerts={alerts} />}
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
