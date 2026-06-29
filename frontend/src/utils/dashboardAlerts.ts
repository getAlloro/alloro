import type {
  DashboardAlertAction,
  DashboardAlertModel,
} from "../components/dashboard/alerts/types";
import type { PmsFocusPeriod } from "./pmsFocusPeriod";

export type DashboardAlertCopy = {
  dataNameLower: string;
  uploadDataCta: string;
  insightsSubject: string;
  moneyLower: string;
  orgNoun?: string;
};

const DEFAULT_ALERT_COPY: DashboardAlertCopy = {
  dataNameLower: "PMS data",
  uploadDataCta: "Upload PMS data",
  insightsSubject: "referral",
  moneyLower: "production",
  orgNoun: "practice",
};

export type DashboardAlertInputs = {
  /** Server-computed: PMS data changed after the last completed run. */
  insightsStale: boolean;
  /** Calendar-based focus period (drives the "upload new month" nudge). */
  focusPeriod: PmsFocusPeriod;
  /** Org onboarding not yet complete. */
  isOnboardingIncomplete?: boolean;
  actions: {
    getUpdatedInsights?: Omit<DashboardAlertAction, "label">;
    uploadData?: Omit<DashboardAlertAction, "label">;
    continueSetup?: Omit<DashboardAlertAction, "label">;
  };
  copy?: DashboardAlertCopy;
};

/**
 * Build the prioritized dashboard alert list shared by the main dashboard and
 * the PMS Statistics surface. Order (priority desc): stale-insights, then the
 * calendar upload nudge, then the setup-progress banner. An alert is included
 * only when its condition holds and its action is supplied, so each surface can
 * opt out of alerts it does not own by omitting the action.
 */
export function buildDashboardAlerts({
  insightsStale,
  focusPeriod,
  isOnboardingIncomplete = false,
  actions,
  copy = DEFAULT_ALERT_COPY,
}: DashboardAlertInputs): DashboardAlertModel[] {
  const alerts: DashboardAlertModel[] = [];
  const orgNoun = copy.orgNoun ?? DEFAULT_ALERT_COPY.orgNoun;

  if (insightsStale && actions.getUpdatedInsights) {
    alerts.push({
      id: "pms-insights-stale",
      priority: 30,
      variant: "stale",
      eyebrow: "Updated data detected",
      title: "Your insights are out of date",
      body: `${copy.dataNameLower} was edited or removed since the last analysis. Re-run it to refresh your ${copy.insightsSubject} and ${copy.moneyLower} insights.`,
      action: { label: "Get updated insights", ...actions.getUpdatedInsights },
    });
  }

  if (focusPeriod.isStale && actions.uploadData) {
    alerts.push({
      id: "pms-upload-nudge",
      priority: 20,
      variant: "nudge",
      eyebrow: "Ready for the next focus?",
      title: focusPeriod.nudgeTitle,
      body: focusPeriod.nudgeBody,
      action: { label: copy.uploadDataCta, ...actions.uploadData },
    });
  }

  if (isOnboardingIncomplete && actions.continueSetup) {
    alerts.push({
      id: "setup-progress",
      priority: 10,
      variant: "setup",
      eyebrow: "Finish setup",
      title: `Finish setting up your ${orgNoun}`,
      body: "Complete onboarding to unlock your full dashboard.",
      action: { label: "Continue setup", ...actions.continueSetup },
    });
  }

  return alerts;
}
