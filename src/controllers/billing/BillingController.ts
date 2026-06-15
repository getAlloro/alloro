/**
 * Billing Controller
 *
 * HTTP layer for billing endpoints.
 * Handles request parsing, validation, and response formatting.
 * Business logic lives in BillingService.
 */

import { Response } from "express";
import { RBACRequest } from "../../middleware/rbac";
import { Request } from "express";
import * as BillingService from "./BillingService";
import logger from "../../lib/logger";

/**
 * POST /api/billing/checkout
 *
 * Create a Stripe Checkout Session for subscribing to a plan.
 * Only org admins can create checkout sessions.
 */
export async function createCheckout(
  req: RBACRequest,
  res: Response
): Promise<void> {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      res.status(400).json({
        success: false,
        error: "Organization required. Complete onboarding first.",
      });
      return;
    }

    const { tier, isOnboarding } = req.body;

    if (!tier || !["DWY", "DFY"].includes(tier)) {
      res.status(400).json({
        success: false,
        error: "tier must be either 'DWY' or 'DFY'",
      });
      return;
    }

    const result = await BillingService.createCheckoutSession(
      organizationId,
      tier,
      isOnboarding === true
    );

    res.json({ success: true, url: result.url });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "[Billing] Checkout error:");
    const statusCode = error?.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error?.message || "Failed to create checkout session",
    });
  }
}

/**
 * POST /api/billing/portal
 *
 * Create a Stripe Customer Portal session for managing an existing subscription.
 * Only org admins can access the portal.
 */
export async function createPortal(
  req: RBACRequest,
  res: Response
): Promise<void> {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      res.status(400).json({
        success: false,
        error: "Organization required.",
      });
      return;
    }

    const result = await BillingService.createPortalSession(organizationId);

    res.json({ success: true, url: result.url });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "[Billing] Portal error:");
    const statusCode = error?.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error?.message || "Failed to create portal session",
    });
  }
}

/**
 * GET /api/billing/status
 *
 * Get the current billing/subscription status for the user's organization.
 */
export async function getStatus(
  req: RBACRequest,
  res: Response
): Promise<void> {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      // No org yet — return minimal status
      res.json({
        success: true,
        tier: null,
        subscriptionStatus: "inactive",
        hasStripeSubscription: false,
        isAdminGranted: false,
        isLockedOut: false,
        stripeCustomerId: null,
        currentPeriodEnd: null,
      });
      return;
    }

    const status =
      await BillingService.getSubscriptionStatus(organizationId);

    res.json({ success: true, ...status });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "[Billing] Status error:");
    const statusCode = error?.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error?.message || "Failed to get billing status",
    });
  }
}

/**
 * GET /api/billing/details
 *
 * Get detailed billing info: payment method, invoices, discount, cancel state.
 */
export async function getDetails(
  req: RBACRequest,
  res: Response
): Promise<void> {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      res.json({
        success: true,
        paymentMethod: null,
        invoices: [],
        discount: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
      });
      return;
    }

    const details = await BillingService.getBillingDetails(organizationId);
    res.json({ success: true, ...details });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "[Billing] Details error:");
    const statusCode = error?.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error?.message || "Failed to get billing details",
    });
  }
}

/**
 * GET /api/admin/organizations/:id/billing
 *
 * Admin endpoint: get billing details for any organization.
 */
export async function getAdminDetails(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const orgId = parseInt(req.params.id, 10);
    if (isNaN(orgId)) {
      res.status(400).json({ success: false, error: "Invalid organization ID" });
      return;
    }

    const details = await BillingService.getBillingDetails(orgId);
    res.json({ success: true, ...details });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "[Billing] Admin details error:");
    const statusCode = error?.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error?.message || "Failed to get billing details",
    });
  }
}

/**
 * POST /api/billing/webhook
 *
 * Handle Stripe webhook events.
 * Public endpoint — no auth, but verified via Stripe signature.
 * Expects raw body (not JSON parsed).
 */
export async function handleWebhook(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const signature = req.headers["stripe-signature"] as string;

    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }

    // req.body should be a raw Buffer (set by route-level raw body parser)
    const event = BillingService.constructWebhookEvent(
      req.body as Buffer,
      signature
    );

    // Process the event
    await BillingService.handleWebhookEvent(event);

    // Always return 200 to Stripe — even if processing fails,
    // we don't want Stripe to keep retrying
    res.status(200).json({ received: true });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "[Stripe Webhook] Verification or processing error:");

    // Signature verification failure → 400
    if (error?.type === "StripeSignatureVerificationError") {
      res.status(400).json({ error: "Invalid webhook signature" });
      return;
    }

    // Processing error → still return 200 to prevent Stripe retries
    // (the event was valid, we just failed to process it)
    res.status(200).json({ received: true, error: "Processing failed" });
  }
}
