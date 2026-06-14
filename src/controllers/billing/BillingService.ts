/**
 * Billing Service
 *
 * Handles Stripe integration for subscription billing:
 * - Checkout session creation
 * - Customer portal session creation
 * - Webhook event processing
 * - Subscription status queries
 */

import Stripe from "stripe";
import { getStripe, getDefaultPriceId, getWebhookSecret } from "../../config/stripe";
import {
  OrganizationModel,
  IOrganization,
} from "../../models/OrganizationModel";
import { LocationModel } from "../../models/LocationModel";
import { updateTier } from "../admin-organizations/feature-services/TierManagementService";
import { OrganizationUserModel } from "../../models/OrganizationUserModel";
import { sendEmail } from "../../emails/emailService";
import { isStripeConfigured } from "../../config/stripe";
import logger from "../../lib/logger";

// ─── Types ───

export interface BillingStatus {
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
  paymentMethod: BillingPaymentMethod | null;
  invoices: BillingInvoice[];
  discount: BillingDiscount | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
}

export interface CheckoutResult {
  url: string;
}

// ─── App URL for redirects ───

function getAppUrl(): string {
  return process.env.NODE_ENV === "production"
    ? "https://app.getalloro.com"
    : "http://localhost:5174";
}

// ─── Checkout Session ───

/**
 * Create a Stripe Checkout Session for a subscription.
 *
 * Single-product model: always uses the DFY price regardless of tier param.
 *
 * @param orgId - Organization ID
 * @param tier - Kept for API compatibility — always resolves to DFY
 * @param isOnboarding - Whether this is during onboarding (affects redirect URLs)
 */
export async function createCheckoutSession(
  orgId: number,
  tier: "DWY" | "DFY" = "DFY",
  isOnboarding: boolean = false
): Promise<CheckoutResult> {
  const stripe = getStripe();
  const appUrl = getAppUrl();

  const org = await OrganizationModel.findById(orgId);
  if (!org) {
    throw { statusCode: 404, message: "Organization not found" };
  }

  // Use org-specific price override, or fall back to default ($2,000/location)
  const priceId = org.stripe_price_id || getDefaultPriceId();

  // Quantity = override if set (flat-rate clients), otherwise location count
  let locationCount: number;
  if (org.billing_quantity_override != null) {
    locationCount = org.billing_quantity_override;
  } else {
    const locationCountResult =
      await LocationModel.countByOrganizationId(orgId);
    locationCount = Math.max(Number(locationCountResult?.count) || 0, 1);
  }

  // If org already has a Stripe customer, reuse it
  const customerOptions: Stripe.Checkout.SessionCreateParams["customer"] =
    org.stripe_customer_id || undefined;

  const successUrl = isOnboarding
    ? `${appUrl}/onboarding/payment-success?session_id={CHECKOUT_SESSION_ID}`
    : `${appUrl}/settings/billing?billing=success&session_id={CHECKOUT_SESSION_ID}`;

  const cancelUrl = isOnboarding
    ? `${appUrl}/onboarding/payment-cancelled`
    : `${appUrl}/settings/billing?cancelled=true`;

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    allow_promotion_codes: true,
    line_items: [
      {
        price: priceId,
        quantity: locationCount,
      },
    ],
    metadata: {
      organization_id: orgId.toString(),
      tier: "DFY",
      location_count: locationCount.toString(),
      is_onboarding: isOnboarding ? "true" : "false",
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  };

  // Attach existing customer or let Stripe create one
  if (customerOptions) {
    sessionParams.customer = customerOptions;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  if (!session.url) {
    throw { statusCode: 500, message: "Failed to create checkout session URL" };
  }

  return { url: session.url };
}

// ─── Customer Portal ───

/**
 * Create a Stripe Customer Portal session for managing an existing subscription.
 */
export async function createPortalSession(
  orgId: number
): Promise<CheckoutResult> {
  const stripe = getStripe();
  const appUrl = getAppUrl();

  const org = await OrganizationModel.findById(orgId);
  if (!org) {
    throw { statusCode: 404, message: "Organization not found" };
  }

  const stripeCustomerId = org.stripe_customer_id;
  if (!stripeCustomerId) {
    throw {
      statusCode: 400,
      message:
        "No Stripe subscription found. Use checkout to create a subscription first.",
    };
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${appUrl}/settings/billing`,
  });

  return { url: session.url };
}

// ─── Subscription Status ───

/**
 * Get the billing status for an organization.
 */
export async function getSubscriptionStatus(
  orgId: number
): Promise<BillingStatus> {
  const org = (await OrganizationModel.findBillingStatusFieldsById(
    orgId
  )) as any;

  if (!org) {
    throw { statusCode: 404, message: "Organization not found" };
  }

  const hasStripe = !!org.stripe_customer_id;
  const isLockedOut = org.subscription_status === "inactive";
  const isAdminGranted =
    !hasStripe && org.subscription_status === "active";

  // If we have a Stripe subscription, fetch period end + cancel state from Stripe
  let currentPeriodEnd: string | null = null;
  let cancelAtPeriodEnd = false;
  if (org.stripe_subscription_id) {
    try {
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(
        org.stripe_subscription_id
      ) as any;
      // cancel_at is a timestamp when cancellation is scheduled (via portal)
      // cancel_at_period_end is a boolean (via API direct cancel)
      // current_period_end was removed in Stripe SDK v20 — use cancel_at or billing_cycle_anchor
      const isCancelling = sub.cancel_at_period_end === true || !!sub.cancel_at;
      cancelAtPeriodEnd = isCancelling;

      if (sub.cancel_at) {
        currentPeriodEnd = new Date(sub.cancel_at * 1000).toISOString();
      } else if (sub.current_period_end) {
        currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString();
      }
    } catch (err: any) {
      logger.error({ err: err?.message || err }, `[Billing] Failed to fetch subscription ${org.stripe_subscription_id}:`);
    }
  }

  return {
    tier: org.subscription_tier,
    subscriptionStatus: org.subscription_status,
    hasStripeSubscription: hasStripe,
    isAdminGranted,
    isLockedOut,
    stripeCustomerId: org.stripe_customer_id,
    currentPeriodEnd,
    cancelAtPeriodEnd,
  };
}

// ─── Billing Details ───

/**
 * Get detailed billing information for an organization.
 * Fetches payment method, invoices, discount, and cancellation state from Stripe.
 * Returns null-safe defaults for orgs without Stripe.
 */
export async function getBillingDetails(
  orgId: number
): Promise<BillingDetails> {
  const org = (await OrganizationModel.findStripeIdsById(orgId)) as any;

  if (!org) {
    throw { statusCode: 404, message: "Organization not found" };
  }

  const result: BillingDetails = {
    paymentMethod: null,
    invoices: [],
    discount: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
  };

  if (!org.stripe_customer_id) {
    return result;
  }

  const stripe = getStripe();

  // Fetch payment method, invoices, and subscription in parallel
  const [invoicesResult, subscriptionResult] = await Promise.allSettled([
    stripe.invoices.list({
      customer: org.stripe_customer_id,
      limit: 12,
      expand: ["data.discount"],
    }),
    org.stripe_subscription_id
      ? stripe.subscriptions.retrieve(org.stripe_subscription_id, {
          expand: ["default_payment_method", "discount"],
        })
      : Promise.resolve(null),
  ]);

  // Extract invoices
  if (invoicesResult.status === "fulfilled" && invoicesResult.value) {
    result.invoices = invoicesResult.value.data.map((inv) => {
      let coupon: string | null = null;
      const discount = (inv as any).discount;
      if (discount?.coupon) {
        coupon = discount.coupon.name || discount.coupon.id;
      }
      return {
        id: inv.id,
        date: new Date((inv.created ?? 0) * 1000).toISOString(),
        amount: (inv.amount_paid ?? 0) / 100,
        currency: inv.currency ?? "usd",
        status: inv.status ?? "unknown",
        coupon,
        hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
      };
    });
  }

  // Extract subscription details (payment method, discount, cancel state)
  if (subscriptionResult.status === "fulfilled" && subscriptionResult.value) {
    const sub = subscriptionResult.value as any;

    // Payment method
    const pm = sub.default_payment_method;
    if (pm && typeof pm === "object" && pm.card) {
      result.paymentMethod = {
        brand: pm.card.brand ?? "unknown",
        last4: pm.card.last4 ?? "????",
        expMonth: pm.card.exp_month ?? 0,
        expYear: pm.card.exp_year ?? 0,
      };
    }

    // Active discount/coupon
    if (sub.discount?.coupon) {
      result.discount = {
        couponName: sub.discount.coupon.name || sub.discount.coupon.id,
        percentOff: sub.discount.coupon.percent_off ?? null,
        amountOff: sub.discount.coupon.amount_off
          ? sub.discount.coupon.amount_off / 100
          : null,
      };
    }

    // Cancellation state — cancel_at (timestamp) or cancel_at_period_end (boolean)
    result.cancelAtPeriodEnd = sub.cancel_at_period_end === true || !!sub.cancel_at;
    result.canceledAt = sub.canceled_at
      ? new Date(sub.canceled_at * 1000).toISOString()
      : null;
  }

  return result;
}

// ─── Webhook Event Processing ───

/**
 * Verify and construct a Stripe webhook event from raw body and signature.
 */
export function constructWebhookEvent(
  rawBody: Buffer,
  signature: string
): Stripe.Event {
  const stripe = getStripe();
  const webhookSecret = getWebhookSecret();
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

/**
 * Process a verified Stripe webhook event.
 * Handles subscription lifecycle events.
 */
export async function handleWebhookEvent(
  event: Stripe.Event
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(
        event.data.object as Stripe.Checkout.Session
      );
      break;

    case "invoice.payment_succeeded":
      await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
      break;

    case "invoice.payment_failed":
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
      break;

    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(
        event.data.object as Stripe.Subscription
      );
      break;

    case "customer.subscription.updated":
      await handleSubscriptionUpdated(
        event.data.object as Stripe.Subscription
      );
      break;

    default:
      logger.info(`[Stripe Webhook] Unhandled event type: ${event.type}`);
  }
}

// ─── Webhook Event Handlers ───

/**
 * Handle checkout.session.completed — first-time subscription creation.
 * Saves Stripe customer/subscription IDs and updates tier.
 */
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const orgId = session.metadata?.organization_id;
  const tier = session.metadata?.tier as "DWY" | "DFY" | undefined;

  if (!orgId) {
    logger.error(
      "[Stripe Webhook] checkout.session.completed missing organization_id in metadata"
    );
    return;
  }

  const organizationId = parseInt(orgId, 10);
  if (isNaN(organizationId)) {
    logger.error(
      `[Stripe Webhook] Invalid organization_id: ${orgId}`
    );
    return;
  }

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  logger.info(
    `[Stripe Webhook] Checkout completed for org ${organizationId}, tier: ${tier}`
  );

  const trx = await OrganizationModel.beginTransaction();
  try {
    // Save Stripe customer and subscription IDs
    await OrganizationModel.updateStripeIdentifiersOnCheckout(
      organizationId,
      {
        stripe_customer_id: customerId || null,
        stripe_subscription_id: subscriptionId || null,
        subscription_started_at: new Date(),
        subscription_updated_at: new Date(),
      },
      trx
    );

    // Update tier if specified (triggers DFY upgrade logic if applicable)
    if (tier && ["DWY", "DFY"].includes(tier)) {
      await updateTier(organizationId, tier, trx);
    }

    await trx.commit();
    logger.info(
      `[Stripe Webhook] Successfully processed checkout for org ${organizationId}`
    );
  } catch (error) {
    await trx.rollback();
    logger.error({ err: error }, `[Stripe Webhook] Error processing checkout for org ${organizationId}:`);
    throw error;
  }
}

/**
 * Handle invoice.payment_succeeded — recurring payment confirmation.
 * Ensures subscription_status stays active.
 */
async function handlePaymentSucceeded(
  invoice: Stripe.Invoice
): Promise<void> {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;

  if (!customerId) return;

  await OrganizationModel.updateSubscriptionStatusByCustomerId(
    customerId,
    "active"
  );

  logger.info(
    `[Stripe Webhook] Payment succeeded for customer ${customerId}`
  );
}

/**
 * Handle invoice.payment_failed — mark subscription as potentially inactive.
 */
async function handlePaymentFailed(
  invoice: Stripe.Invoice
): Promise<void> {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;

  if (!customerId) return;

  // Don't immediately lock out — Stripe will retry. Just log it.
  // If subscription is eventually cancelled, handleSubscriptionDeleted will fire.
  logger.warn(
    `[Stripe Webhook] Payment failed for customer ${customerId}`
  );
}

/**
 * Handle customer.subscription.deleted — subscription cancelled.
 */
async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  if (!customerId) return;

  await OrganizationModel.updateSubscriptionStatusByCustomerId(
    customerId,
    "cancelled"
  );

  logger.info(
    `[Stripe Webhook] Subscription deleted for customer ${customerId}`
  );
}

// ─── Subscription Quantity Sync ───

/**
 * Sync Stripe subscription quantity to match the org's current location count.
 * Called after location add/remove. Best-effort — never throws.
 */
export async function syncSubscriptionQuantity(
  organizationId: number
): Promise<void> {
  try {
    if (!isStripeConfigured()) return;

    const org = await OrganizationModel.findById(organizationId);
    if (!org?.stripe_subscription_id) return;

    // Use override if set (flat-rate clients), otherwise count locations
    let newQuantity: number;
    if (org.billing_quantity_override != null) {
      newQuantity = org.billing_quantity_override;
    } else {
      const result =
        await LocationModel.countByOrganizationId(organizationId);
      newQuantity = Math.max(Number(result?.count) || 0, 1);
    }

    // Get subscription from Stripe
    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(
      org.stripe_subscription_id
    );

    const item = subscription.items.data[0];
    if (!item) {
      logger.warn(
        `[Billing] No subscription items found for org ${organizationId}`
      );
      return;
    }

    const oldQuantity = item.quantity || 1;
    if (oldQuantity === newQuantity) return;

    // Update subscription item quantity (Stripe prorates automatically)
    await stripe.subscriptionItems.update(item.id, {
      quantity: newQuantity,
    });

    logger.info(
      `[Billing] Subscription quantity updated for org ${organizationId}: ${oldQuantity} → ${newQuantity}`
    );

    // Notify org admins via email
    try {
      const orgUsers = await OrganizationUserModel.listByOrgWithUsers(
        organizationId
      );
      const adminEmails = orgUsers
        .filter((u) => u.role === "admin")
        .map((u) => u.email)
        .filter(Boolean);

      if (adminEmails.length === 0) return;

      const unitPrice = item.price?.unit_amount
        ? (item.price.unit_amount / 100).toFixed(0)
        : "—";
      const newTotal = item.price?.unit_amount
        ? ((item.price.unit_amount / 100) * newQuantity).toLocaleString()
        : "—";
      const direction = newQuantity > oldQuantity ? "added" : "removed";

      await sendEmail({
        subject: `Your Alloro subscription has been updated`,
        body: `
          <div style="font-family: sans-serif; padding: 20px; max-width: 600px;">
            <h2 style="color: #1a1a1a;">Subscription Updated</h2>
            <p style="color: #4a5568; font-size: 16px;">
              A location was ${direction} for <strong>${org.name}</strong>, and your subscription has been automatically adjusted.
            </p>
            <div style="background: #f7f7f7; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 4px 0; color: #4a5568;">Previous: <strong>${oldQuantity}</strong> ${oldQuantity === 1 ? "location" : "locations"} × $${unitPrice}/mo</p>
              <p style="margin: 4px 0; color: #4a5568;">Updated: <strong>${newQuantity}</strong> ${newQuantity === 1 ? "location" : "locations"} × $${unitPrice}/mo</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 12px 0;" />
              <p style="margin: 4px 0; color: #1a1a1a; font-weight: bold;">New monthly total: $${newTotal}/mo</p>
            </div>
            <p style="color: #718096; font-size: 14px;">
              Any price difference for the current billing period will be prorated on your next invoice.
            </p>
          </div>
        `,
        recipients: adminEmails,
      });
    } catch (emailErr) {
      logger.warn({ detail: emailErr }, `[Billing] Failed to send quantity update email for org ${organizationId}:`);
    }
  } catch (error) {
    logger.error({ err: error }, `[Billing] Failed to sync subscription quantity for org ${organizationId}:`);
  }
}

/**
 * Handle customer.subscription.updated — plan change or status update.
 */
async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  if (!customerId) return;

  // Sync status
  const status =
    subscription.status === "active" ? "active" : "inactive";

  await OrganizationModel.updateSubscriptionStatusByCustomerId(
    customerId,
    status
  );

  logger.info(
    `[Stripe Webhook] Subscription updated for customer ${customerId}, status: ${status}`
  );
}
