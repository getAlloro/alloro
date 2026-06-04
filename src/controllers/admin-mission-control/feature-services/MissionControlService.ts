import { isStripeConfigured } from "../../../config/stripe";
import {
  MissionControlModel,
  MissionControlOrgBase,
} from "../../../models/MissionControlModel";
import {
  buildTwelveMonthBuckets,
  MissionControlMonthBucket,
  MissionControlPaymentMethodSummary,
  roundCurrency,
  StripeFreshness,
} from "../feature-utils/missionControlFormatters";
import {
  buildUnavailableRevenue,
  getStripeRevenueByOrg,
  StripeRevenueResult,
  StripeStatus,
} from "./MissionControlStripeService";

export interface MissionControlSummary {
  expectedMrr: number;
  monthToDatePaid: number;
  previousMonthPaid: number;
  lifetimePaid: number;
  activeStripeClientCount: number;
  adminGrantedActiveCount: number;
  noPaymentMethodCount: number;
  failedOrPastDueCount: number;
  cancelingCount: number;
}

export interface MissionControlOrganization {
  id: number;
  name: string;
  domain: string | null;
  createdAt: string;
  organizationType: "health" | "saas" | null;
  subscriptionTier: "DWY" | "DFY" | null;
  subscriptionStatus: MissionControlOrgBase["subscription_status"];
  archivedAt: string | null;
  isTest: boolean;
  stripeStatus: StripeStatus;
  paymentMethod: MissionControlPaymentMethodSummary | null;
  expectedMonthlyAmount: number;
  monthToDatePaid: number;
  lifetimePaid: number;
  lastPayment: {
    date: string;
    amount: number;
    status: string;
  } | null;
  paymentSparkline: MissionControlMonthBucket[];
  historyComplete: boolean;
  userCount: number;
  adminUsers: {
    id: number;
    name: string;
    email: string;
    role: "admin";
  }[];
  locationCount: number;
  hasGbpConnection: boolean;
  websiteStatus: string | null;
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
}

export interface MissionControlData {
  generatedAt: string;
  stripeFreshness: StripeFreshness;
  summary: MissionControlSummary;
  revenueTrend: MissionControlMonthBucket[];
  organizations: MissionControlOrganization[];
  movementSignals: string[];
}

export async function getMissionControlData(): Promise<MissionControlData> {
  const baseData = await MissionControlModel.getBaseData();
  const now = new Date();
  const stripeResults = await getStripeRevenueByOrg(baseData.organizations, now);

  const organizations = baseData.organizations.map((org) => {
    const stripeResult = stripeResults.get(org.id) ?? buildUnavailableRevenue(now);
    const latestPms = baseData.latestPms[org.id];
    const latestRanking = baseData.latestRankings[org.id];
    const adminUsers = (baseData.adminUsers[org.id] ?? []).map((user) => ({
      id: user.id,
      name: user.name || user.email,
      email: user.email,
      role: user.role,
    }));

    return {
      id: org.id,
      name: org.name,
      domain: org.domain,
      createdAt: org.created_at.toISOString(),
      organizationType: org.organization_type,
      subscriptionTier: org.subscription_tier,
      subscriptionStatus: org.subscription_status,
      archivedAt: org.archived_at ? org.archived_at.toISOString() : null,
      isTest: org.is_sandbox,
      stripeStatus: stripeResult.stripeStatus,
      paymentMethod: stripeResult.paymentMethod,
      expectedMonthlyAmount: stripeResult.expectedMonthlyAmount,
      monthToDatePaid: stripeResult.monthToDatePaid,
      lifetimePaid: stripeResult.lifetimePaid,
      lastPayment: stripeResult.lastPayment,
      paymentSparkline: stripeResult.paymentSparkline,
      historyComplete: stripeResult.historyComplete,
      userCount: baseData.userCounts[org.id] ?? 0,
      adminUsers,
      locationCount: baseData.locationCounts[org.id] ?? 0,
      hasGbpConnection: baseData.gbpConnections[org.id] ?? false,
      websiteStatus: baseData.websites[org.id]?.status ?? null,
      pendingTaskCount: baseData.pendingTaskCounts[org.id] ?? 0,
      unreadNotificationCount: baseData.unreadNotificationCounts[org.id] ?? 0,
      latestPms: latestPms
        ? {
            id: latestPms.id,
            status: latestPms.status,
            timestamp: latestPms.timestamp.toISOString(),
            isClientApproved: latestPms.is_client_approved,
          }
        : null,
      latestRanking: latestRanking
        ? {
            id: latestRanking.id,
            status: latestRanking.status,
            rankScore: latestRanking.rank_score,
            searchPosition: latestRanking.search_position,
            createdAt: latestRanking.created_at.toISOString(),
          }
        : null,
      riskFlags: stripeResult.riskFlags,
    };
  }).sort(compareRevenueFirst);

  const activeOrganizations = organizations.filter(
    (org) => !org.archivedAt && !org.isTest,
  );
  const activeBaseOrganizations = baseData.organizations.filter(
    (org) => !org.archived_at && !org.is_sandbox,
  );

  const data: MissionControlData = {
    generatedAt: now.toISOString(),
    stripeFreshness: isStripeConfigured() ? "fresh" : "unavailable",
    summary: summarize(activeOrganizations, stripeResults, activeBaseOrganizations),
    revenueTrend: buildRevenueTrend(activeOrganizations, now),
    organizations,
    movementSignals: buildMovementSignals(activeOrganizations),
  };

  return data;
}

function compareRevenueFirst(
  a: MissionControlOrganization,
  b: MissionControlOrganization,
): number {
  if (b.lifetimePaid !== a.lifetimePaid) return b.lifetimePaid - a.lifetimePaid;
  if (b.monthToDatePaid !== a.monthToDatePaid) {
    return b.monthToDatePaid - a.monthToDatePaid;
  }
  if (b.expectedMonthlyAmount !== a.expectedMonthlyAmount) {
    return b.expectedMonthlyAmount - a.expectedMonthlyAmount;
  }
  return a.name.localeCompare(b.name);
}

function summarize(
  organizations: MissionControlOrganization[],
  stripeResults: Map<number, StripeRevenueResult>,
  orgs: MissionControlOrgBase[],
): MissionControlSummary {
  return {
    expectedMrr: roundCurrency(
      organizations.reduce((sum, org) => sum + org.expectedMonthlyAmount, 0),
    ),
    monthToDatePaid: roundCurrency(
      organizations.reduce((sum, org) => sum + org.monthToDatePaid, 0),
    ),
    previousMonthPaid: roundCurrency(
      organizations.reduce(
        (sum, org) =>
          sum + (stripeResults.get(org.id)?.previousMonthPaid ?? 0),
        0,
      ),
    ),
    lifetimePaid: roundCurrency(
      organizations.reduce((sum, org) => sum + org.lifetimePaid, 0),
    ),
    activeStripeClientCount: organizations.filter(
      (org) => org.stripeStatus === "active",
    ).length,
    adminGrantedActiveCount: orgs.filter(
      (org) => org.subscription_status === "active" && !org.stripe_customer_id,
    ).length,
    noPaymentMethodCount: organizations.filter((org) =>
      org.riskFlags.includes("no_payment_method"),
    ).length,
    failedOrPastDueCount: organizations.filter((org) =>
      org.riskFlags.includes("past_due"),
    ).length,
    cancelingCount: organizations.filter((org) =>
      org.riskFlags.includes("canceling"),
    ).length,
  };
}

function buildRevenueTrend(
  organizations: MissionControlOrganization[],
  now: Date,
): MissionControlMonthBucket[] {
  const buckets = buildTwelveMonthBuckets(now);
  const bucketIndex = new Map(buckets.map((bucket) => [bucket.month, bucket]));

  for (const organization of organizations) {
    for (const month of organization.paymentSparkline) {
      const bucket = bucketIndex.get(month.month);
      if (bucket) {
        bucket.amount = roundCurrency(bucket.amount + month.amount);
      }
    }
  }

  return buckets;
}

function buildMovementSignals(
  organizations: MissionControlOrganization[],
): string[] {
  const expectedMrr = roundCurrency(
    organizations.reduce((sum, org) => sum + org.expectedMonthlyAmount, 0),
  );
  const noPaymentMethod = organizations.filter((org) =>
    org.riskFlags.includes("no_payment_method"),
  ).length;
  const paymentRisk = organizations.filter(
    (org) =>
      org.riskFlags.includes("past_due") || org.riskFlags.includes("canceling"),
  ).length;
  const topRevenue = [...organizations].sort(
    (a, b) => b.lifetimePaid - a.lifetimePaid,
  )[0];

  return [
    `Expected MRR is $${expectedMrr.toLocaleString()} across active Stripe subscriptions.`,
    `${noPaymentMethod} organizations need payment-method attention.`,
    `${paymentRisk} organizations are past due or canceling.`,
    topRevenue
      ? `${topRevenue.name} leads lifetime received revenue at $${topRevenue.lifetimePaid.toLocaleString()}.`
      : "No paid invoice history is available yet.",
  ];
}
