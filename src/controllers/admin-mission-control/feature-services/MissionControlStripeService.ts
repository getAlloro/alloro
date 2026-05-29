import Stripe from "stripe";
import { getStripe, isStripeConfigured } from "../../../config/stripe";
import { MissionControlOrgBase } from "../../../models/MissionControlModel";
import {
  buildTwelveMonthBuckets,
  centsToUsd,
  formatPaymentMethod,
  getExpectedMonthlyAmount,
  getInvoicePaidDate,
  getMonthKey,
  getUtcMonthStart,
  isWithinMonth,
  MissionControlMonthBucket,
  MissionControlPaymentMethodSummary,
  roundCurrency,
} from "../feature-utils/missionControlFormatters";

const STRIPE_CONCURRENCY = 4;
const MAX_INVOICE_PAGES = 4;
const INVOICE_PAGE_SIZE = 100;

export type StripeStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceling"
  | "cancelled"
  | "no_stripe_customer"
  | "no_subscription"
  | "admin_granted"
  | "unavailable";

export interface StripeRevenueResult {
  stripeStatus: StripeStatus;
  paymentMethod: MissionControlPaymentMethodSummary | null;
  expectedMonthlyAmount: number;
  monthToDatePaid: number;
  previousMonthPaid: number;
  lifetimePaid: number;
  lastPayment: {
    date: string;
    amount: number;
    status: string;
  } | null;
  paymentSparkline: MissionControlMonthBucket[];
  historyComplete: boolean;
  riskFlags: string[];
}

export async function getStripeRevenueByOrg(
  orgs: MissionControlOrgBase[],
  now: Date,
): Promise<Map<number, StripeRevenueResult>> {
  if (!isStripeConfigured()) {
    return new Map(
      orgs.map((org) => [org.id, buildUnavailableRevenue(now, org)]),
    );
  }

  const stripe = getStripe();
  const entries = await mapWithConcurrency(
    orgs,
    STRIPE_CONCURRENCY,
    async (org) => [org.id, await getOrgStripeRevenue(stripe, org, now)] as const,
  );

  return new Map(entries);
}

export function buildUnavailableRevenue(
  now: Date,
  org?: MissionControlOrgBase,
): StripeRevenueResult {
  return {
    stripeStatus: "unavailable",
    paymentMethod: null,
    expectedMonthlyAmount: 0,
    monthToDatePaid: 0,
    previousMonthPaid: 0,
    lifetimePaid: 0,
    lastPayment: null,
    paymentSparkline: buildTwelveMonthBuckets(now),
    historyComplete: false,
    riskFlags: org?.stripe_customer_id ? ["stripe_unavailable"] : [],
  };
}

async function getOrgStripeRevenue(
  stripe: Stripe,
  org: MissionControlOrgBase,
  now: Date,
): Promise<StripeRevenueResult> {
  if (!org.stripe_customer_id) {
    return buildNoCustomerRevenue(org, now);
  }

  try {
    const [subscription, invoices] = await Promise.all([
      getSubscription(stripe, org),
      listPaidInvoices(stripe, org.stripe_customer_id),
    ]);

    return buildStripeRevenue(org, subscription, invoices, now);
  } catch {
    return buildUnavailableRevenue(now, org);
  }
}

async function getSubscription(
  stripe: Stripe,
  org: MissionControlOrgBase,
): Promise<Stripe.Subscription | null> {
  if (org.stripe_subscription_id) {
    return stripe.subscriptions.retrieve(org.stripe_subscription_id, {
      expand: ["default_payment_method"],
    });
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: org.stripe_customer_id ?? undefined,
    status: "all",
    limit: 1,
  });

  return subscriptions.data[0] ?? null;
}

async function listPaidInvoices(
  stripe: Stripe,
  customerId: string,
): Promise<{ invoices: Stripe.Invoice[]; historyComplete: boolean }> {
  const invoices: Stripe.Invoice[] = [];
  let startingAfter: string | undefined;
  let page = 0;
  let hasMore = true;

  while (hasMore && page < MAX_INVOICE_PAGES) {
    const result = await stripe.invoices.list({
      customer: customerId,
      limit: INVOICE_PAGE_SIZE,
      starting_after: startingAfter,
    });
    invoices.push(...result.data.filter((invoice) => invoice.status === "paid"));
    hasMore = result.has_more;
    startingAfter = result.data[result.data.length - 1]?.id;
    page += 1;
  }

  return { invoices, historyComplete: !hasMore };
}

function buildStripeRevenue(
  org: MissionControlOrgBase,
  subscription: Stripe.Subscription | null,
  invoiceResult: { invoices: Stripe.Invoice[]; historyComplete: boolean },
  now: Date,
): StripeRevenueResult {
  const buckets = buildTwelveMonthBuckets(now);
  const bucketIndex = new Map(buckets.map((bucket) => [bucket.month, bucket]));
  const monthStart = getUtcMonthStart(now);
  const previousMonthStart = getUtcMonthStart(now, -1);
  let monthToDatePaid = 0;
  let previousMonthPaid = 0;
  let lifetimePaid = 0;
  let lastPayment: StripeRevenueResult["lastPayment"] = null;

  for (const invoice of invoiceResult.invoices) {
    const paidDate = getInvoicePaidDate(invoice);
    const amount = centsToUsd(invoice.amount_paid);
    lifetimePaid += amount;

    if (!lastPayment || paidDate > new Date(lastPayment.date)) {
      lastPayment = {
        date: paidDate.toISOString(),
        amount,
        status: invoice.status ?? "paid",
      };
    }

    if (isWithinMonth(paidDate, monthStart)) monthToDatePaid += amount;
    if (isWithinMonth(paidDate, previousMonthStart)) previousMonthPaid += amount;

    const bucket = bucketIndex.get(getMonthKey(paidDate));
    if (bucket) bucket.amount = roundCurrency(bucket.amount + amount);
  }

  const paymentMethod = formatPaymentMethod(
    subscription?.default_payment_method ?? null,
  );
  const stripeStatus = getStripeStatus(org, subscription);

  return {
    stripeStatus,
    paymentMethod,
    expectedMonthlyAmount: getExpectedMonthlyAmount(subscription),
    monthToDatePaid: roundCurrency(monthToDatePaid),
    previousMonthPaid: roundCurrency(previousMonthPaid),
    lifetimePaid: roundCurrency(lifetimePaid),
    lastPayment,
    paymentSparkline: buckets,
    historyComplete: invoiceResult.historyComplete,
    riskFlags: buildRiskFlags(org, stripeStatus, paymentMethod),
  };
}

function buildNoCustomerRevenue(
  org: MissionControlOrgBase,
  now: Date,
): StripeRevenueResult {
  const isAdminGranted = org.subscription_status === "active";
  return {
    stripeStatus: isAdminGranted ? "admin_granted" : "no_stripe_customer",
    paymentMethod: null,
    expectedMonthlyAmount: 0,
    monthToDatePaid: 0,
    previousMonthPaid: 0,
    lifetimePaid: 0,
    lastPayment: null,
    paymentSparkline: buildTwelveMonthBuckets(now),
    historyComplete: true,
    riskFlags: isAdminGranted ? ["no_stripe_customer", "no_payment_method"] : [],
  };
}

function getStripeStatus(
  org: MissionControlOrgBase,
  subscription: Stripe.Subscription | null,
): StripeStatus {
  if (!subscription) {
    return org.stripe_customer_id ? "no_subscription" : "no_stripe_customer";
  }
  if (subscription.cancel_at_period_end || subscription.cancel_at) {
    return "canceling";
  }
  if (subscription.status === "active") return "active";
  if (subscription.status === "trialing") return "trialing";
  if (subscription.status === "past_due" || subscription.status === "unpaid") {
    return "past_due";
  }
  if (subscription.status === "canceled") return "cancelled";
  return "no_subscription";
}

function buildRiskFlags(
  org: MissionControlOrgBase,
  stripeStatus: StripeStatus,
  paymentMethod: MissionControlPaymentMethodSummary | null,
): string[] {
  const flags = new Set<string>();
  if (org.subscription_status === "inactive") flags.add("locked");
  if (!paymentMethod) flags.add("no_payment_method");
  if (stripeStatus === "past_due") flags.add("past_due");
  if (stripeStatus === "canceling") flags.add("canceling");
  if (stripeStatus === "cancelled") flags.add("cancelled");
  if (stripeStatus === "no_subscription") flags.add("no_subscription");
  return Array.from(flags);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
}
