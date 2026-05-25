import type Stripe from "stripe";

export type StripeFreshness = "fresh" | "unavailable";

export interface MissionControlMonthBucket {
  month: string;
  amount: number;
}

export interface MissionControlPaymentMethodSummary {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export function centsToUsd(cents: number | null | undefined): number {
  return roundCurrency((cents ?? 0) / 100);
}

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}`;
}

export function buildTwelveMonthBuckets(
  now: Date,
): MissionControlMonthBucket[] {
  const buckets: MissionControlMonthBucket[] = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    const bucketDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1),
    );
    buckets.push({ month: getMonthKey(bucketDate), amount: 0 });
  }
  return buckets;
}

export function getInvoicePaidDate(invoice: Stripe.Invoice): Date {
  const paidAt = invoice.status_transitions?.paid_at ?? invoice.created;
  return new Date((paidAt ?? 0) * 1000);
}

export function getExpectedMonthlyAmount(
  subscription: Stripe.Subscription | null,
): number {
  if (!subscription || subscription.status !== "active") return 0;

  return roundCurrency(
    subscription.items.data.reduce((sum, item) => {
      const quantity = item.quantity ?? 1;
      const unitAmount = centsToUsd(item.price?.unit_amount ?? 0);
      const recurring = item.price?.recurring;
      const intervalCount = recurring?.interval_count || 1;

      if (recurring?.interval === "year") {
        return sum + (unitAmount * quantity) / (12 * intervalCount);
      }

      if (recurring?.interval === "month") {
        return sum + (unitAmount * quantity) / intervalCount;
      }

      return sum;
    }, 0),
  );
}

export function formatPaymentMethod(
  paymentMethod: Stripe.PaymentMethod | string | null | undefined,
): MissionControlPaymentMethodSummary | null {
  if (!paymentMethod || typeof paymentMethod === "string") return null;
  if (!paymentMethod.card) return null;

  return {
    brand: paymentMethod.card.brand ?? "unknown",
    last4: paymentMethod.card.last4 ?? "0000",
    expMonth: paymentMethod.card.exp_month ?? 0,
    expYear: paymentMethod.card.exp_year ?? 0,
  };
}

export function isWithinMonth(date: Date, monthStart: Date): boolean {
  const nextMonth = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
  );
  return date >= monthStart && date < nextMonth;
}

export function getUtcMonthStart(date: Date, offsetMonths = 0): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offsetMonths, 1),
  );
}
