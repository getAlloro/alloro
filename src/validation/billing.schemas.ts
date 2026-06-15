/**
 * Billing route schemas (src/routes/billing.ts) — NON-WEBHOOK bodies only.
 *
 * The Stripe webhook (POST /api/billing/webhook) is DELIBERATELY EXCLUDED: it
 * uses express.raw() so its body is a signature-verified Buffer, not JSON, and
 * must never be reshaped. The GET endpoints (/status, /details) and /portal
 * take no client body (org comes from the authed RBAC context). That leaves
 * /checkout as the only body-bearing, validatable route here.
 *
 * PERMISSIVE-FIRST (warn-only soak): assert the shape the controller hard-checks
 * (`tier` ∈ {DWY,DFY}) and keep `isOnboarding` an optional boolean.
 */

import { z } from "zod";

/** Plan tiers the checkout controller accepts. Mirrors the inline guard. */
export const BILLING_TIERS = ["DWY", "DFY"] as const;

/**
 * POST /api/billing/checkout — { tier, isOnboarding? }
 * Controller requires tier ∈ {DWY,DFY}; isOnboarding is coerced to a strict
 * boolean there (`=== true`), so accept it loosely as an optional boolean.
 */
export const checkoutSchema = z
  .object({
    tier: z.enum(BILLING_TIERS, {
      message: "tier must be either 'DWY' or 'DFY'",
    }),
    isOnboarding: z.boolean().optional(),
  })
  .passthrough();

export type CheckoutBody = z.infer<typeof checkoutSchema>;
