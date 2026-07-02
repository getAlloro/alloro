/**
 * LocationBillingService — quote + paid purchase flow for adding a location.
 *
 * The consent contract: the client sees a quote (per-location price, current →
 * new monthly total, prorated charge today), confirms, and only then is the
 * location created — "create after paid".
 *
 * Atomicity: the DB inserts and the Stripe charge run inside ONE transaction —
 * insert first (all constraint guards fire before any money moves), then the
 * quantity update with `payment_behavior: "error_if_incomplete"` (Stripe
 * rejects the whole update if the immediate prorated invoice cannot be paid),
 * then commit. A declined card rolls everything back; no compensating logic.
 *
 * Idempotency: the Stripe call carries a deterministic idempotency key and the
 * target quantity is derived from the DB row count, so a retry after a
 * commit-failure re-runs as a no-op quantity update instead of double-charging.
 *
 * Billing branch matrix (server-resolved — client input is display-only):
 *   - quantity        → active sub, per-location billing: charge + create
 *   - flat_rate       → billing_quantity_override set: $0 change, create only
 *   - no_subscription → admin-granted / Stripe unconfigured: create only
 *   - unavailable     → Stripe objects unreachable from this environment's key
 *                       (foreign-mode ids, e.g. prod-cloned rows on dev):
 *                       create only, warn — never attempt a mutation
 */

import Stripe from "stripe";
import { getStripe, isStripeConfigured } from "../../../config/stripe";
import {
  OrganizationModel,
  IOrganization,
} from "../../../models/OrganizationModel";
import { LocationModel, ILocation } from "../../../models/LocationModel";
import {
  GooglePropertyModel,
  IGoogleProperty,
} from "../../../models/GooglePropertyModel";
import { createLocationInTransaction } from "../../locations/LocationService";
import { BillingLocationError } from "../feature-utils/BillingLocationError";
import { sendQuantityUpdateEmail } from "../feature-utils/billingEmails";
import logger from "../../../lib/logger";

// ─── Types ───

export type LocationBillingMode =
  | "quantity"
  | "flat_rate"
  | "no_subscription"
  | "unavailable";

export interface AddLocationQuote {
  mode: LocationBillingMode;
  currency: string | null;
  interval: string | null;
  /** Per-location price in cents */
  unitAmount: number | null;
  currentQuantity: number | null;
  newQuantity: number | null;
  /** Cents */
  currentMonthlyTotal: number | null;
  /** Cents */
  newMonthlyTotal: number | null;
  /** Cents charged immediately on confirm (prorated remainder of the cycle) */
  proratedChargeNow: number | null;
  /** ISO date the current billing period ends (full new total applies after) */
  periodEnd: string | null;
}

export interface PurchaseLocationInput {
  name: string;
  domain?: string | null;
  gbp: { accountId: string; locationId: string; displayName: string };
  /** Client-echoed total (cents) from the quote it displayed — consent integrity */
  expectedNewMonthlyTotal?: number | null;
}

export interface PurchaseLocationResult {
  location: ILocation & { googleProperties: IGoogleProperty[] };
  billing: {
    mode: LocationBillingMode;
    /** Cents actually invoiced now (null when nothing was charged) */
    chargedNow: number | null;
    newMonthlyTotal: number | null;
    currency: string | null;
  };
}

// ─── Internals ───

function isForeignModeStripeError(error: unknown): boolean {
  return (
    error instanceof Stripe.errors.StripeInvalidRequestError &&
    error.code === "resource_missing"
  );
}

/** Stripe idempotency keys must be ≤255 chars; GBP ids can carry slashes. */
function sanitizeKeyPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
}

interface SubscriptionItemView {
  itemId: string;
  quantity: number;
  unitAmount: number | null;
  currency: string | null;
  interval: string | null;
  periodStart: number | null;
  periodEnd: number | null;
}

async function retrieveSubscriptionItem(
  stripe: Stripe,
  subscriptionId: string
): Promise<SubscriptionItemView> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });
  const item = subscription.items.data[0];
  if (!item) {
    throw new BillingLocationError(
      "BILLING_OBJECTS_UNAVAILABLE",
      "Subscription has no items.",
      { subscriptionId }
    );
  }
  return {
    itemId: item.id,
    quantity: item.quantity ?? 1,
    unitAmount: item.price?.unit_amount ?? null,
    currency: item.price?.currency ?? null,
    interval: item.price?.recurring?.interval ?? null,
    periodStart: item.current_period_start ?? null,
    periodEnd: item.current_period_end ?? null,
  };
}

/**
 * Prorated amount (cents) for going quantity → quantity+1 right now.
 * Prefers Stripe's own invoice preview; falls back to time-remaining
 * arithmetic if the preview call fails (both round to whole cents).
 */
async function previewProratedCharge(
  stripe: Stripe,
  subscriptionId: string,
  item: SubscriptionItemView,
  newQuantity: number
): Promise<number | null> {
  try {
    const preview = await stripe.invoices.createPreview({
      subscription: subscriptionId,
      subscription_details: {
        items: [{ id: item.itemId, quantity: newQuantity }],
        proration_behavior: "always_invoice",
      },
    });
    if (typeof preview.total === "number") return Math.max(preview.total, 0);
  } catch (previewError) {
    logger.warn(
      { detail: (previewError as Error)?.message },
      `[LocationBilling] Invoice preview failed for sub ${subscriptionId}; falling back to arithmetic estimate`
    );
  }

  if (
    item.unitAmount == null ||
    item.periodStart == null ||
    item.periodEnd == null ||
    item.periodEnd <= item.periodStart
  ) {
    return null;
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const remaining = Math.min(
    Math.max(item.periodEnd - nowSec, 0) / (item.periodEnd - item.periodStart),
    1
  );
  const addedQuantity = newQuantity - item.quantity;
  return Math.round(item.unitAmount * addedQuantity * remaining);
}

// ─── Quote ───

export async function getAddLocationQuote(
  orgId: number
): Promise<AddLocationQuote> {
  const org = await OrganizationModel.findById(orgId);
  if (!org) {
    throw new BillingLocationError("ORG_NOT_FOUND", "Organization not found.", {
      orgId,
    });
  }

  const empty: AddLocationQuote = {
    mode: "no_subscription",
    currency: null,
    interval: null,
    unitAmount: null,
    currentQuantity: null,
    newQuantity: null,
    currentMonthlyTotal: null,
    newMonthlyTotal: null,
    proratedChargeNow: null,
    periodEnd: null,
  };

  if (!isStripeConfigured() || !org.stripe_subscription_id) {
    return empty;
  }

  if (org.billing_quantity_override != null) {
    // Flat-rate org: adding a location never changes the price
    return { ...empty, mode: "flat_rate", proratedChargeNow: 0 };
  }

  const stripe = getStripe();
  let item: SubscriptionItemView;
  try {
    item = await retrieveSubscriptionItem(stripe, org.stripe_subscription_id);
  } catch (error) {
    if (
      isForeignModeStripeError(error) ||
      error instanceof BillingLocationError
    ) {
      logger.warn(
        `[LocationBilling] Billing objects for org ${orgId} are unavailable with the configured Stripe key (foreign mode or stale clone) — quoting mode=unavailable`
      );
      return { ...empty, mode: "unavailable" };
    }
    throw error;
  }

  const newQuantity = item.quantity + 1;
  const proratedChargeNow = await previewProratedCharge(
    stripe,
    org.stripe_subscription_id,
    item,
    newQuantity
  );

  return {
    mode: "quantity",
    currency: item.currency,
    interval: item.interval,
    unitAmount: item.unitAmount,
    currentQuantity: item.quantity,
    newQuantity,
    currentMonthlyTotal:
      item.unitAmount != null ? item.unitAmount * item.quantity : null,
    newMonthlyTotal:
      item.unitAmount != null ? item.unitAmount * newQuantity : null,
    proratedChargeNow,
    periodEnd:
      item.periodEnd != null
        ? new Date(item.periodEnd * 1000).toISOString()
        : null,
  };
}

// ─── Purchase (create after paid) ───

/**
 * Charge for the added location by moving the subscription item to
 * `targetQuantity` with an immediate prorated invoice. Atomic on Stripe's
 * side: error_if_incomplete rejects the update when the invoice can't be paid.
 * Returns the cents invoiced now (best-effort), or null when the update was
 * already applied by a previous attempt (idempotent retry).
 */
async function chargeForAddedLocation(
  org: IOrganization,
  gbpExternalId: string,
  targetQuantity: number
): Promise<number | null> {
  const stripe = getStripe();
  const subscriptionId = org.stripe_subscription_id as string;
  const item = await retrieveSubscriptionItem(stripe, subscriptionId);

  if (item.quantity >= targetQuantity) {
    // A previous attempt charged but failed to commit the DB write; the
    // subscription already reflects this location. Do not charge again.
    logger.warn(
      `[LocationBilling] Subscription ${subscriptionId} already at quantity ${item.quantity} (target ${targetQuantity}) for org ${org.id} — skipping charge (idempotent retry)`
    );
    return null;
  }

  const idempotencyKey = `locadd-${org.id}-${sanitizeKeyPart(gbpExternalId)}-q${targetQuantity}`;

  try {
    await stripe.subscriptionItems.update(
      item.itemId,
      {
        quantity: targetQuantity,
        proration_behavior: "always_invoice",
        payment_behavior: "error_if_incomplete",
      },
      { idempotencyKey }
    );
  } catch (error) {
    if (error instanceof Stripe.errors.StripeCardError) {
      throw new BillingLocationError(
        "PAYMENT_FAILED",
        `Payment failed: ${error.message}`,
        { declineCode: error.decline_code ?? null }
      );
    }
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      const message = error.message || "";
      if (
        message.includes("no attached payment source") ||
        message.includes("default payment method")
      ) {
        throw new BillingLocationError(
          "NO_PAYMENT_METHOD",
          "No payment method on file. Add one in Billing before adding a location.",
          null
        );
      }
      if (error.code === "resource_missing") {
        throw new BillingLocationError(
          "BILLING_OBJECTS_UNAVAILABLE",
          "Billing objects are unavailable in this environment.",
          { subscriptionId }
        );
      }
      // error_if_incomplete surfaces unpayable invoices as invalid_request
      // errors that are not card errors (e.g. requires 3DS authentication)
      if (message.toLowerCase().includes("payment")) {
        throw new BillingLocationError(
          "PAYMENT_FAILED",
          `Payment could not be completed: ${error.message}`,
          null
        );
      }
    }
    throw error;
  }

  // Best-effort: report the actual invoiced amount for the receipt line
  try {
    const invoices = await stripe.invoices.list({
      subscription: subscriptionId,
      limit: 1,
    });
    const latest = invoices.data[0];
    if (
      latest &&
      latest.billing_reason === "subscription_update" &&
      Date.now() / 1000 - (latest.created ?? 0) < 180
    ) {
      return latest.amount_paid ?? null;
    }
  } catch (invoiceError) {
    logger.warn(
      { detail: (invoiceError as Error)?.message },
      `[LocationBilling] Could not fetch the proration invoice for org ${org.id}`
    );
  }
  return null;
}

export async function purchaseLocation(
  orgId: number,
  input: PurchaseLocationInput
): Promise<PurchaseLocationResult> {
  const org = await OrganizationModel.findById(orgId);
  if (!org) {
    throw new BillingLocationError("ORG_NOT_FOUND", "Organization not found.", {
      orgId,
    });
  }

  // Server-side quote recompute — the client's numbers are display-only (§5.4)
  const quote = await getAddLocationQuote(orgId);

  if (
    input.expectedNewMonthlyTotal != null &&
    quote.newMonthlyTotal != null &&
    input.expectedNewMonthlyTotal !== quote.newMonthlyTotal
  ) {
    throw new BillingLocationError(
      "QUOTE_STALE",
      "The billing amounts changed since the quote was shown. Review the updated summary and confirm again.",
      {
        expected: input.expectedNewMonthlyTotal,
        actual: quote.newMonthlyTotal,
      }
    );
  }

  let chargedNow: number | null = null;

  const location = await LocationModel.transaction(async (trx) => {
    // Inserts first: every constraint guard (GBP reuse, connection presence)
    // fires BEFORE any money moves. Commit happens only after a successful
    // charge, so the location is never visible unless it was paid for.
    const created = await createLocationInTransaction(
      trx,
      orgId,
      input.name,
      input.gbp,
      input.domain ?? null
    );

    if (quote.mode === "quantity") {
      const countRow = await LocationModel.countByOrganizationId(orgId, trx);
      const targetQuantity = Math.max(Number(countRow?.count) || 0, 1);
      chargedNow = await chargeForAddedLocation(
        org,
        input.gbp.locationId,
        targetQuantity
      );
    } else if (quote.mode === "unavailable") {
      logger.warn(
        `[LocationBilling] Creating location for org ${orgId} WITHOUT billing mutation — Stripe objects unavailable in this environment (mode=unavailable)`
      );
    }

    return created;
  });

  logger.info(
    `[LocationBilling] Location ${location.id} created for org ${orgId} (mode=${quote.mode}, chargedNow=${chargedNow ?? "n/a"})`
  );

  if (quote.mode === "quantity" && quote.currentQuantity != null) {
    // Post-commit notification; mirrors the legacy sync email
    void sendQuantityUpdateEmail(
      org,
      quote.currentQuantity,
      quote.newQuantity ?? quote.currentQuantity + 1,
      quote.unitAmount
    );
  }

  const googleProperties = await GooglePropertyModel.findByLocationId(
    location.id
  );

  return {
    location: { ...location, googleProperties },
    billing: {
      mode: quote.mode,
      chargedNow,
      newMonthlyTotal: quote.newMonthlyTotal,
      currency: quote.currency,
    },
  };
}
