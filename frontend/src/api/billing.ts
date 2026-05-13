/**
 * Billing API Client
 *
 * Frontend functions for Stripe billing integration.
 * All calls go through the standard apiGet/apiPost helpers with JWT auth.
 */

import { apiGet, apiPost } from "./index";

// ─── Types ───

export interface BillingStatus {
  success: boolean;
  tier: string | null;
  subscriptionStatus: string;
  hasStripeSubscription: boolean;
  isAdminGranted: boolean;
  isLockedOut: boolean;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface BillingPaymentMethod {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface BillingInvoice {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  coupon: string | null;
  hostedInvoiceUrl: string | null;
}

export interface BillingDiscount {
  couponName: string;
  percentOff: number | null;
  amountOff: number | null;
}

export interface BillingDetails {
  success: boolean;
  paymentMethod: BillingPaymentMethod | null;
  invoices: BillingInvoice[];
  discount: BillingDiscount | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
}

export interface CheckoutResponse {
  success: boolean;
  url?: string;
  error?: string;
}

export interface PortalResponse {
  success: boolean;
  url?: string;
  error?: string;
}

// ─── API Functions ───

/**
 * Get the current billing/subscription status for the user's org.
 */
export async function getBillingStatus(): Promise<BillingStatus> {
  return apiGet({ path: "/billing/status" });
}

/**
 * Create a Stripe Checkout Session for subscribing to a plan.
 * Returns a URL to redirect the user to Stripe's hosted checkout page.
 *
 * @param tier - "DWY" or "DFY"
 * @param isOnboarding - true if called during the onboarding flow
 */
export async function createCheckoutSession(
  tier: "DWY" | "DFY",
  isOnboarding: boolean = false
): Promise<CheckoutResponse> {
  return apiPost({
    path: "/billing/checkout",
    passedData: { tier, isOnboarding },
  });
}

/**
 * Create a Stripe Customer Portal session for managing an existing subscription.
 * Returns a URL to redirect the user to Stripe's hosted portal.
 */
export async function createPortalSession(): Promise<PortalResponse> {
  return apiPost({
    path: "/billing/portal",
    passedData: {},
  });
}

/**
 * Get detailed billing info: payment method, invoices, discount, cancel state.
 */
export async function getBillingDetails(): Promise<BillingDetails> {
  return apiGet({ path: "/billing/details" });
}

/**
 * Admin: create a Stripe Checkout Session for an arbitrary organization.
 * Used by the "Add Payment" button in the admin Org Subscription view.
 * Returns a Stripe-hosted checkout URL that captures a card and starts the subscription.
 * Fix for BUG-01.
 */
export async function adminCreateCheckoutForOrg(
  orgId: number,
  tier: "DWY" | "DFY" | "growth" | "full" = "DFY",
): Promise<CheckoutResponse> {
  return apiPost({
    path: "/billing/admin/checkout",
    passedData: { orgId, tier, isOnboarding: false },
  });
}
