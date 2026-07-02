/**
 * Billing route schemas (src/routes/billing.ts) — NON-WEBHOOK bodies only.
 *
 * The Stripe webhook (POST /api/billing/webhook) is DELIBERATELY EXCLUDED: it
 * uses the Express raw body parser so its body is a signature-verified Buffer, not JSON, and
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

/**
 * POST /api/locations/purchase — the paid location-add flow.
 * ENFORCED from day one (new endpoint, no legacy clients): a malformed body
 * on a payment endpoint must be rejected, never soaked.
 * `expectedNewMonthlyTotal` is the client-echoed quote total in cents, used
 * for consent integrity (server rejects with QUOTE_STALE on mismatch).
 */
export const purchaseLocationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Location name is required")
    .max(255),
  domain: z.string().trim().max(255).nullish(),
  gbp: z.object({
    accountId: z.string().trim().max(255).optional().default(""),
    locationId: z.string().trim().min(1, "GBP profile is required").max(255),
    displayName: z
      .string()
      .trim()
      .min(1, "GBP display name is required")
      .max(255),
  }),
  expectedNewMonthlyTotal: z.number().int().nonnegative().nullish(),
});

export type PurchaseLocationBody = z.infer<typeof purchaseLocationSchema>;
