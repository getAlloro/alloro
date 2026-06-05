import { apiGet, apiPost } from "./index";
import type { ActiveIntegration } from "../components/Admin/integrations/ActiveIntegrationLogos";

export type StripeFreshness = "fresh" | "unavailable";

export type MissionControlStripeStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceling"
  | "cancelled"
  | "no_stripe_customer"
  | "no_subscription"
  | "admin_granted"
  | "unavailable";

export type MissionControlPaymentMethod = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

export type MissionControlMonthBucket = {
  month: string;
  amount: number;
};

export type MissionControlAdminUser = {
  id: number;
  name: string;
  email: string;
  role: "admin";
};

export type MissionControlSummary = {
  expectedMrr: number;
  monthToDatePaid: number;
  previousMonthPaid: number;
  lifetimePaid: number;
  activeStripeClientCount: number;
  adminGrantedActiveCount: number;
  noPaymentMethodCount: number;
  failedOrPastDueCount: number;
  cancelingCount: number;
};

export type MissionControlOrganization = {
  id: number;
  name: string;
  domain: string | null;
  createdAt: string;
  organizationType: "health" | "saas" | null;
  subscriptionTier: "DWY" | "DFY" | null;
  subscriptionStatus: "active" | "inactive" | "trial" | "cancelled";
  archivedAt: string | null;
  isTest: boolean;
  stripeStatus: MissionControlStripeStatus;
  paymentMethod: MissionControlPaymentMethod | null;
  expectedMonthlyAmount: number;
  monthToDatePaid: number;
  lifetimePaid: number;
  lastPayment: { date: string; amount: number; status: string } | null;
  paymentSparkline: MissionControlMonthBucket[];
  historyComplete: boolean;
  userCount: number;
  adminUsers: MissionControlAdminUser[];
  locationCount: number;
  hasGbpConnection: boolean;
  websiteStatus: string | null;
  activeIntegrations: ActiveIntegration[];
  pendingTaskCount: number;
  unreadNotificationCount: number;
  latestPms: {
    id: number;
    status: string;
    timestamp: string;
    isClientApproved: boolean;
  } | null;
  latestRanking: {
    id: number;
    status: string;
    rankScore: number | null;
    searchPosition: number | null;
    createdAt: string;
  } | null;
  riskFlags: string[];
};

export type MissionControlData = {
  generatedAt: string;
  stripeFreshness: StripeFreshness;
  summary: MissionControlSummary;
  revenueTrend: MissionControlMonthBucket[];
  organizations: MissionControlOrganization[];
  movementSignals: string[];
};

export type MissionControlInsight = {
  headline: string;
  narrative: string;
  bullets: string[];
  source: "ai" | "deterministic";
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T | null;
  error: { message: string } | null;
};

export async function adminGetMissionControl(
  refresh = false,
): Promise<MissionControlData> {
  const query = refresh ? "?refresh=true" : "";
  const response: ApiEnvelope<MissionControlData> = await apiGet({
    path: `/admin/mission-control${query}`,
  });

  if (!response.success || !response.data) {
    throw new Error(response.error?.message || "Failed to load Mission Control");
  }

  return response.data;
}

export async function adminGetMissionControlInsight(): Promise<{
  insight: MissionControlInsight;
  movementSignals: string[];
  generatedAt: string;
}> {
  const response: ApiEnvelope<{
    insight: MissionControlInsight;
    movementSignals: string[];
    generatedAt: string;
  }> = await apiPost({ path: "/admin/mission-control/insight" });

  if (!response.success || !response.data) {
    throw new Error(
      response.error?.message || "Failed to generate Mission Control insight",
    );
  }

  return response.data;
}
