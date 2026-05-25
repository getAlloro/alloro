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
import { rbacMiddleware, requireRole, type RBACRequest } from "../middleware/rbac";
import * as BillingController from "../controllers/billing/BillingController";
import * as BillingService from "../controllers/billing/BillingService";
import { db } from "../database/connection";
import { createSetupIntent, confirmCardOnFile } from "../services/trialCardCapture";

const billingRoutes = express.Router();

// ─── Authenticated Endpoints ───

// POST /api/billing/checkout — Create Stripe Checkout Session
billingRoutes.post(
  "/checkout",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin"),
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

// POST /api/billing/cancel-reason — Log cancellation reason before Stripe portal
billingRoutes.post(
  "/cancel-reason",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false });

      const { reason, other_text } = req.body || {};

      // Log to behavioral_events
      const hasTable = await db.schema.hasTable("behavioral_events");
      if (hasTable) {
        await db("behavioral_events").insert({
          organization_id: orgId,
          event_type: "billing.cancel_reason",
          metadata: JSON.stringify({ reason, other_text: other_text || null }),
        });
      }

      // Create dream_team_task for Corey (every cancel reason gets human attention)
      try {
        const org = await db("organizations").where({ id: orgId }).first("name");
        await db("dream_team_tasks").insert({
          owner_name: "Corey",
          title: `Cancel intent: ${org?.name || `Org ${orgId}`}`,
          description: `Client indicated intent to cancel. Reason: ${reason}${other_text ? `. Detail: ${other_text}` : ""}. Org ID: ${orgId}.`,
          status: "open",
          priority: "urgent",
          source_type: "cancel_flow",
        });
      } catch {}

      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Billing] Cancel reason error:", err.message);
      return res.status(500).json({ success: false });
    }
  },
);

// POST /api/billing/pause — Pause subscription (up to 3 months)
billingRoutes.post(
  "/pause",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin"),
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false });

      const { reason, other_text } = req.body || {};

      // Update org status to paused
      await db("organizations").where({ id: orgId }).update({
        subscription_status: "paused",
        paused_at: new Date(),
        pause_reason: reason || null,
      });

      // Log to behavioral_events
      const hasTable = await db.schema.hasTable("behavioral_events");
      if (hasTable) {
        await db("behavioral_events").insert({
          organization_id: orgId,
          event_type: "billing.subscription_paused",
          metadata: JSON.stringify({ reason, other_text: other_text || null }),
        });
      }

      // Create task for follow-up
      try {
        const org = await db("organizations").where({ id: orgId }).first("name");
        await db("dream_team_tasks").insert({
          owner_name: "Corey",
          title: `Paused: ${org?.name || `Org ${orgId}`}`,
          description: `Client paused their account. Reason: ${reason}${other_text ? `. Detail: ${other_text}` : ""}. Follow up in 2 weeks.`,
          status: "open",
          priority: "high",
          source_type: "cancel_flow",
        });
      } catch {}

      return res.json({ success: true });
    } catch (err: any) {
      console.error("[Billing] Pause error:", err.message);
      return res.status(500).json({ success: false });
    }
  },
);

// POST /api/billing/setup-intent — Create a Stripe SetupIntent for card-on-file capture
billingRoutes.post(
  "/setup-intent",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin"),
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "Organization required" });

      const result = await createSetupIntent(orgId);
      if (!result) {
        return res.status(503).json({ success: false, error: "Billing is not configured" });
      }
      return res.json({ success: true, clientSecret: result.clientSecret });
    } catch (err: any) {
      console.error("[Billing] SetupIntent error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to create setup intent" });
    }
  }
);

// POST /api/billing/confirm-card — Confirm a card on file after SetupIntent completes
billingRoutes.post(
  "/confirm-card",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin"),
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "Organization required" });

      const { setupIntentId } = req.body;
      if (!setupIntentId) {
        return res.status(400).json({ success: false, error: "setupIntentId required" });
      }

      const confirmed = await confirmCardOnFile(orgId, setupIntentId);
      return res.json({ success: confirmed });
    } catch (err: any) {
      console.error("[Billing] Confirm card error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to confirm card" });
    }
  }
);

// POST /api/billing/create-portal-session — Alias for portal (used by cancel flow)
billingRoutes.post(
  "/create-portal-session",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin"),
  BillingController.createPortal
);

// POST /api/billing/admin/checkout — Admin creates a Stripe Checkout Session for any org
// Fixes BUG-01: admin "Add Payment" button in OrgSubscriptionSection had no backing route.
// Reuses BillingService.createCheckoutSession (already accepts arbitrary orgId).
billingRoutes.post(
  "/admin/checkout",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin"),
  async (req: RBACRequest, res) => {
    try {
      const { orgId, tier, isOnboarding } = req.body || {};

      const numericOrgId =
        typeof orgId === "number" ? orgId : parseInt(orgId, 10);
      if (!numericOrgId || Number.isNaN(numericOrgId)) {
        return res.status(400).json({
          success: false,
          error: "orgId required (numeric)",
        });
      }

      const validTiers = ["DWY", "DFY", "growth", "full"] as const;
      type ValidTier = (typeof validTiers)[number];
      const resolvedTier: ValidTier =
        tier && (validTiers as readonly string[]).includes(tier)
          ? (tier as ValidTier)
          : "DFY";

      const result = await BillingService.createCheckoutSession(
        numericOrgId,
        resolvedTier,
        Boolean(isOnboarding),
      );

      return res.json({ success: true, url: result.url });
    } catch (err: any) {
      const status = err?.statusCode || 500;
      const message = err?.message || "Failed to create checkout session";
      console.error("[Billing] Admin checkout error:", message);
      return res.status(status).json({ success: false, error: message });
    }
  },
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
