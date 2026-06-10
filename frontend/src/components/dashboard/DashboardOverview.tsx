/**
 * DashboardOverview — Practice Hub (simplified redesign).
 *
 * Spec: plans/06092026-practice-hub-simplification/spec.html
 *
 * Collapses the previous dense Focus layout (Hero + Trajectory + ActionQueue
 * + three fat metric cards) into a calm, scannable surface:
 *
 *   <DashboardAlertStack />   (cascaded alerts: stale-data, upload nudge, setup)
 *   <PracticeHubHeader />     (PRACTICE HUB · YEAR TO DATE + greeting)
 *   <ProductionPanel />       (one YTD production chart)
 *   <OneThingBanner />        (the single top action — useTopAction)
 *   <StatCardRow />           (Referrals · Local rank · Reviews · Form subs)
 *
 * Data-load reduction vs. the old layout — these fetches are intentionally
 * NO LONGER made on this surface (the components that owned them are retired,
 * left on disk for the onboarding-wizard demo path but not mounted here):
 *   - useAgentData (Proofline trajectory paragraph) — Trajectory removed
 *   - useActionQueue (3–5 queued actions)            — ActionQueue removed
 *   - useLatestRanking (LLM summary + practice health) — LocalRankingCard removed
 *   - PMSCard's referral-mix / top-sources rendering — replaced by ProductionPanel
 *
 * Remaining fetches: useDashboardMetrics (4 cards + production pill),
 * usePmsKeyData (production series + referral MoM), useTopAction (the banner),
 * useFormSubmissionsTimeseries (form-subs this month), usePmsFocusPeriod
 * (alert/period logic).
 */

import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useLocationContext } from "../../contexts/locationContext";
import { usePmsFocusPeriod } from "../../hooks/queries/usePmsFocusPeriod";
import { useRerunPmsInsights } from "../../hooks/queries/usePmsFileManagerQueries";
import { buildDashboardAlerts } from "../../utils/dashboardAlerts";
import { DashboardAlertStack } from "./alerts/DashboardAlertStack";
import { showErrorToast, showSparkleToast } from "../../lib/toast";
import { ProductionPanel } from "./focus/ProductionPanel";
import { OneThingBanner } from "./focus/OneThingBanner";
import { StatCardRow } from "./focus/StatCardRow";
import { useIsWizardActive } from "../../contexts/OnboardingWizardContext";

interface DashboardOverviewProps {
  // Legacy props — kept for backward compatibility with Dashboard.tsx tab
  // dispatch. The card components self-fetch via useAuth + useLocationContext
  // and do not require these to be threaded down.
  organizationId?: number | null;
  locationId?: number | null;
}

function getGreeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function resolveFirstName(
  firstName?: string | null,
  email?: string | null,
): string {
  const first = firstName?.trim();
  if (first) return first;
  const local = email?.split("@")[0]?.trim();
  if (local) return local.charAt(0).toUpperCase() + local.slice(1);
  return "there";
}

function PracticeHubHeader({ firstName }: { firstName: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6B7280]">
          Practice Hub
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6B7280]">
          Year to date
        </span>
      </div>
      <h1 className="mt-3 font-display text-[34px] font-normal leading-tight tracking-tight text-[#1A1A1A]">
        {getGreeting()}, {firstName}
      </h1>
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
  const { period, insightsStale } = usePmsFocusPeriod(
    organizationId,
    locationId,
  );
  const rerunInsights = useRerunPmsInsights(organizationId, locationId);

  const firstName = resolveFirstName(
    userProfile?.firstName,
    userProfile?.email,
  );

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
    <div className="max-w-[960px] mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      {alerts.length > 0 && <DashboardAlertStack alerts={alerts} />}
      <PracticeHubHeader firstName={firstName} />

      <ProductionPanel />
      <OneThingBanner />
      <StatCardRow />
    </div>
  );
}
