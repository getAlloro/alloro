/**
 * Billing Routes
 *
 * Stripe billing endpoints for subscription management.
 *
 * IMPORTANT: The webhook route uses express.raw() for Stripe signature
 * verification. It must NOT go through the JSON body parser.
 */

import express from "express";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware, requireRole } from "../middleware/rbac";
import * as BillingController from "../controllers/billing/BillingController";
import { validate } from "../middleware/validate";
import { checkoutSchema } from "../validation/billing.schemas";

const billingRoutes = express.Router();

// ─── Authenticated Endpoints ───

// POST /api/billing/checkout — Create Stripe Checkout Session
// Validation: WARN-ONLY for this pass — logs would-be rejections of the
// { tier, isOnboarding } body (field names + issue codes only) and lets the
// request through. Flip to enforce only after a clean soak. The controller's
// own `tier ∈ {DWY,DFY}` guard stays in place alongside this.
billingRoutes.post(
  "/checkout",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin"),
  validate(checkoutSchema),
  BillingController.createCheckout
);

// POST /api/billing/portal — Create Stripe Customer Portal session
billingRoutes.post(
  "/portal",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin"),
  BillingController.createPortal
);

// GET /api/billing/status — Get current subscription status
billingRoutes.get(
  "/status",
  authenticateToken,
  rbacMiddleware,
  BillingController.getStatus
);

// GET /api/billing/details — Get detailed billing info (invoices, payment method, etc.)
billingRoutes.get(
  "/details",
  authenticateToken,
  rbacMiddleware,
  BillingController.getDetails
);

// ─── Public Webhook Endpoint ───
// Uses raw body parser for Stripe signature verification.
// No auth — verified by Stripe webhook signature.
billingRoutes.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  BillingController.handleWebhook
);

export default billingRoutes;
