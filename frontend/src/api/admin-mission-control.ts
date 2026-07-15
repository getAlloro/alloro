import { apiGet, apiPost } from "./index";
import type { ActiveIntegration } from "../types/integrations";

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
  organizationType: "health" | "generic" | null;
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

export type MissionControlTelemetryRange =
  | "7d"
  | "30d"
  | "90d"
  | "mtd"
  | "12m"
  | "ytd";

// 12m and ytd aggregate by calendar month; the rest plot daily.
export type MissionControlTelemetryGranularity = "day" | "month";

export function telemetryRangeGranularity(
  range: MissionControlTelemetryRange,
): MissionControlTelemetryGranularity {
  return range === "12m" || range === "ytd" ? "month" : "day";
}

export type MissionControlTelemetrySummary = {
  activeOrganizations: number;
  activeUsers: number;
  totalSessions: number;
  totalPageViews: number;
  totalActiveMinutes: number;
  averageActiveMinutesPerUser: number;
  inactivePaidOrganizations: number;
};

export type MissionControlTelemetryDailyPoint = {
  date: string;
  activeUsers: number;
  // Distinct orgs in the bucket — present on the aggregate view's points only.
  activeOrganizations?: number;
  pageViews: number;
  activeMinutes: number;
};

export type MissionControlTelemetrySurfaceRow = {
  surface: string;
  pageViews: number;
  activeUsers: number;
  activeOrganizations: number;
  activeMinutes: number;
  lastOrganizationId: number | null;
  lastOrganizationName: string | null;
  lastUserId: number | null;
  lastUserName: string | null;
  lastUserEmail: string | null;
};

export type MissionControlTelemetryPageRow = {
  routeTemplate: string;
  pageLabel: string | null;
  surface: string | null;
  pageViews: number;
  activeUsers: number;
  activeOrganizations: number;
  activeMinutes: number;
  lastOrganizationId: number | null;
  lastOrganizationName: string | null;
  lastUserId: number | null;
  lastUserName: string | null;
  lastUserEmail: string | null;
};

export type MissionControlTelemetryOrganizationRow = {
  organizationId: number;
  organizationName: string;
  domain: string | null;
  activeUsers: number;
  sessions: number;
  pageViews: number;
  activeMinutes: number;
  lastActiveAt: string | null;
  topSurface: string | null;
  isLowEngagement?: boolean;
};

export type MissionControlTelemetryUserRow = {
  userId: number;
  name: string | null;
  email: string;
  role: string | null;
  sessions: number;
  pageViews: number;
  activeMinutes: number;
  lastActiveAt: string | null;
  topSurface: string | null;
};

export type MissionControlTelemetryOrganizationSummary = {
  activeUsers: number;
  totalSessions: number;
  totalPageViews: number;
  totalActiveMinutes: number;
  averageActiveMinutesPerUser: number;
  lastActiveAt: string | null;
  topSurface: string | null;
};

export type MissionControlTelemetryMovementRow = {
  id: string;
  eventName: string;
  eventLabel: string;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  sessionId: string;
  routeTemplate: string | null;
  surface: string | null;
  pageLabel: string | null;
  activeSeconds: number;
  activeMinutes: number;
  occurredAt: string;
  createdAt: string;
};

export type MissionControlTelemetryData = {
  generatedAt: string;
  range: MissionControlTelemetryRange;
  includePilot: boolean;
  includeAdmin: boolean;
  summary: MissionControlTelemetrySummary;
  dailyUsage: MissionControlTelemetryDailyPoint[];
  surfaceUsage: MissionControlTelemetrySurfaceRow[];
  pageUsage: MissionControlTelemetryPageRow[];
  organizationUsage: MissionControlTelemetryOrganizationRow[];
};

export type MissionControlTelemetryOrganizationDetailData = {
  generatedAt: string;
  range: MissionControlTelemetryRange;
  includePilot: boolean;
  includeAdmin: boolean;
  organization: MissionControlTelemetryOrganizationRow;
  summary: MissionControlTelemetryOrganizationSummary;
  dailyUsage: MissionControlTelemetryDailyPoint[];
  surfaceUsage: MissionControlTelemetrySurfaceRow[];
  pageUsage: MissionControlTelemetryPageRow[];
  users: MissionControlTelemetryUserRow[];
  recentMovements: MissionControlTelemetryMovementRow[];
};

export type MissionControlTelemetryUserDetailData = {
  generatedAt: string;
  range: MissionControlTelemetryRange;
  includePilot: boolean;
  includeAdmin: boolean;
  organization: MissionControlTelemetryOrganizationRow;
  user: MissionControlTelemetryUserRow;
  dailyUsage: MissionControlTelemetryDailyPoint[];
  surfaceUsage: MissionControlTelemetrySurfaceRow[];
  pageUsage: MissionControlTelemetryPageRow[];
  recentMovements: MissionControlTelemetryMovementRow[];
};

export type MissionControlTelemetryUsersData = {
  generatedAt: string;
  range: MissionControlTelemetryRange;
  includePilot: boolean;
  includeAdmin: boolean;
  organizationId: number;
  users: MissionControlTelemetryUserRow[];
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
    throw new Error(
      response.error?.message || "Failed to load Mission Control",
    );
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

export async function adminGetMissionControlTelemetry(
  range: MissionControlTelemetryRange,
  includePilot = false,
  includeAdmin = false,
): Promise<MissionControlTelemetryData> {
  const query = new URLSearchParams({
    range,
    includePilot: String(includePilot),
    includeAdmin: String(includeAdmin),
  });
  const response: ApiEnvelope<MissionControlTelemetryData> = await apiGet({
    path: `/admin/mission-control/telemetry?${query.toString()}`,
  });

  if (!response.success || !response.data) {
    throw new Error(
      response.error?.message || "Failed to load Mission Control telemetry",
    );
  }

  return response.data;
}

export async function adminGetMissionControlTelemetryOrganizationDetail(
  organizationId: number,
  range: MissionControlTelemetryRange,
  includePilot = false,
  includeAdmin = false,
): Promise<MissionControlTelemetryOrganizationDetailData> {
  const query = new URLSearchParams({
    range,
    includePilot: String(includePilot),
    includeAdmin: String(includeAdmin),
  });
  const response: ApiEnvelope<MissionControlTelemetryOrganizationDetailData> =
    await apiGet({
      path: `/admin/mission-control/telemetry/organizations/${organizationId}/detail?${query.toString()}`,
    });

  if (!response.success || !response.data) {
    throw new Error(
      response.error?.message || "Failed to load organization telemetry detail",
    );
  }

  return response.data;
}

export async function adminGetMissionControlTelemetryUserDetail(
  organizationId: number,
  userId: number,
  range: MissionControlTelemetryRange,
  includePilot = false,
  includeAdmin = false,
): Promise<MissionControlTelemetryUserDetailData> {
  const query = new URLSearchParams({
    range,
    includePilot: String(includePilot),
    includeAdmin: String(includeAdmin),
  });
  const response: ApiEnvelope<MissionControlTelemetryUserDetailData> =
    await apiGet({
      path: `/admin/mission-control/telemetry/organizations/${organizationId}/users/${userId}/detail?${query.toString()}`,
    });

  if (!response.success || !response.data) {
    throw new Error(
      response.error?.message || "Failed to load user telemetry detail",
    );
  }

  return response.data;
}

export async function adminGetMissionControlTelemetryUsers(
  organizationId: number,
  range: MissionControlTelemetryRange,
  includePilot = false,
  includeAdmin = false,
): Promise<MissionControlTelemetryUsersData> {
  const query = new URLSearchParams({
    range,
    includePilot: String(includePilot),
    includeAdmin: String(includeAdmin),
  });
  const response: ApiEnvelope<MissionControlTelemetryUsersData> = await apiGet({
    path: `/admin/mission-control/telemetry/organizations/${organizationId}/users?${query.toString()}`,
  });

  if (!response.success || !response.data) {
    throw new Error(
      response.error?.message || "Failed to load organization telemetry users",
    );
  }

  return response.data;
}
