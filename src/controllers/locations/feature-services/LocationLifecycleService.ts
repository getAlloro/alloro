/**
 * LocationLifecycleService — cancel / reopen / finalize for locations.
 *
 * Lifecycle: active → pending_cancellation → cancelled. Nothing is ever
 * deleted — a cancelled location keeps every downstream row and can always
 * be reopened (owner decision, plans/07032026-multi-location-billing Phase B).
 *
 * Billing mechanics per direction (quantity = count of ACTIVE locations):
 *   cancel (not last)  → DB: pending_cancellation with effective date =
 *                        subscription period end; Stripe: quantity decrement
 *                        with proration "none" — the already-paid current
 *                        period is untouched, the next invoice is lower.
 *   cancel (last)      → Stripe cannot hold quantity 0: schedule the whole
 *                        subscription to cancel at period end instead.
 *   reopen (pending)   → DB: active; Stripe: clear cancel_at_period_end and/or
 *                        restore quantity with proration "none" (already paid).
 *   reopen (cancelled) → a paid re-add: Phase A's prorated charge path runs
 *                        inside the status-restoring transaction.
 *   no-sub / foreign-mode / flat-rate → status-only transitions, no Stripe
 *                        mutation (flat-rate keeps period-end timing when the
 *                        subscription is reachable; otherwise immediate).
 *
 * Write ordering (spec risk R1): DB status transition first, Stripe second,
 * compensating status revert if the Stripe call fails — a later quantity sync
 * self-heals from status, so drift converges on DB truth.
 */

import Stripe from "stripe";
import { getStripe, isStripeConfigured } from "../../../config/stripe";
import {
  LocationModel,
  ILocation,
} from "../../../models/LocationModel";
import {
  OrganizationModel,
  IOrganization,
} from "../../../models/OrganizationModel";
import {
  retrieveSubscriptionItem,
  chargeForQuantityIncrease,
  getAddLocationQuote,
  type SubscriptionItemView,
} from "../../billing/feature-services/LocationBillingService";
import { BillingLocationError } from "../../billing/feature-utils/BillingLocationError";
import { sendLocationLifecycleEmail } from "../../billing/feature-utils/billingEmails";
import { LocationError } from "../feature-utils/LocationError";
import logger from "../../../lib/logger";

export interface LifecycleResult {
  location: ILocation;
  billing: {
    action:
      | "quantity_decremented"
      | "subscription_ending"
      | "quantity_restored"
      | "subscription_resumed"
      | "charged"
      | "none";
    effectiveAt: string | null;
    /** Cents paid now (reopen-after-cancelled only) */
    chargedNow: number | null;
  };
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function requireOrgLocation(
  organizationId: number,
  locationId: number
): Promise<{ org: IOrganization; location: ILocation }> {
  const [org, location] = await Promise.all([
    OrganizationModel.findById(organizationId),
    LocationModel.findById(locationId),
  ]);
  if (!org) {
    throw new LocationError("LOCATION_NOT_FOUND", "Organization not found.", {
      organizationId,
    });
  }
  if (!location || location.organization_id !== organizationId) {
    // §5.5/§11.7 — a location outside the caller's org is indistinguishable
    // from a missing one
    throw new LocationError("LOCATION_NOT_FOUND", "Location not found.", {
      locationId,
    });
  }
  return { org, location };
}

/**
 * Reachable subscription item, or null for no-sub / foreign-mode orgs
 * (both are status-only paths — never a hard failure).
 */
async function getReachableItem(
  org: IOrganization
): Promise<SubscriptionItemView | null> {
  if (!isStripeConfigured() || !org.stripe_subscription_id) return null;
  try {
    return await retrieveSubscriptionItem(
      getStripe(),
      org.stripe_subscription_id
    );
  } catch (error) {
    if (
      (error instanceof Stripe.errors.StripeInvalidRequestError &&
        error.code === "resource_missing") ||
      error instanceof BillingLocationError
    ) {
      logger.warn(
        `[LocationLifecycle] Billing objects unavailable for org ${org.id} — proceeding status-only`
      );
      return null;
    }
    throw error;
  }
}

// ─── Cancel ───

export async function cancelLocation(
  organizationId: number,
  locationId: number
): Promise<LifecycleResult> {
  const { org, location } = await requireOrgLocation(
    organizationId,
    locationId
  );

  if (location.status !== "active") {
    throw new LocationError(
      "LOCATION_NOT_ACTIVE",
      location.status === "pending_cancellation"
        ? "This location is already scheduled for cancellation."
        : "This location is already cancelled.",
      { locationId, status: location.status }
    );
  }

  const item = await getReachableItem(org);
  const isFlatRate = org.billing_quantity_override != null;
  const activeCountRow =
    await LocationModel.countActiveByOrganizationId(organizationId);
  const remainingActive = (Number(activeCountRow?.count) || 1) - 1;

  // No reachable subscription: nothing is billed, cancel immediately
  if (!item) {
    await LocationModel.markPendingCancellation(locationId, new Date());
    await LocationModel.markCancelled(locationId);
    logger.info(
      `[LocationLifecycle] Location ${locationId} (org ${organizationId}) cancelled immediately — no reachable subscription`
    );
    void sendLocationLifecycleEmail(
      org,
      location.name,
      "cancelled_immediately",
      null
    );
    const updated = await LocationModel.findById(locationId);
    return {
      location: updated as ILocation,
      billing: { action: "none", effectiveAt: null, chargedNow: null },
    };
  }

  const effectiveAt = item.periodEnd
    ? new Date(item.periodEnd * 1000)
    : new Date(Date.now() + THIRTY_DAYS_MS);
  if (!item.periodEnd) {
    logger.warn(
      `[LocationLifecycle] Subscription item for org ${organizationId} has no period end — defaulting cancel_effective_at to +30d`
    );
  }

  // DB first
  await LocationModel.markPendingCancellation(locationId, effectiveAt);

  // Stripe second, with compensating revert
  let action: LifecycleResult["billing"]["action"] = "none";
  try {
    if (!isFlatRate) {
      const stripe = getStripe();
      if (remainingActive >= 1) {
        await stripe.subscriptionItems.update(item.itemId, {
          quantity: remainingActive,
          proration_behavior: "none",
        });
        action = "quantity_decremented";
      } else {
        // Stripe cannot hold quantity 0 — the last active location ends the
        // subscription itself at period end (owner decision, no floor guard)
        await stripe.subscriptions.update(
          org.stripe_subscription_id as string,
          { cancel_at_period_end: true }
        );
        action = "subscription_ending";
      }
    }
  } catch (stripeError) {
    await LocationModel.markActive(locationId);
    logger.error(
      { err: (stripeError as Error)?.message },
      `[LocationLifecycle] Stripe update failed cancelling location ${locationId} (org ${organizationId}) — status reverted to active`
    );
    throw new BillingLocationError(
      "LOCATION_BILLING_ERROR",
      "Could not update billing for this cancellation. Nothing was changed — try again.",
      null
    );
  }

  logger.info(
    `[LocationLifecycle] Location ${locationId} (org ${organizationId}) pending cancellation until ${effectiveAt.toISOString()} (${action})`
  );
  void sendLocationLifecycleEmail(
    org,
    location.name,
    action === "subscription_ending" ? "subscription_ending" : "cancel_scheduled",
    effectiveAt
  );

  const updated = await LocationModel.findById(locationId);
  return {
    location: updated as ILocation,
    billing: {
      action,
      effectiveAt: effectiveAt.toISOString(),
      chargedNow: null,
    },
  };
}

// ─── Reopen ───

export async function reopenLocation(
  organizationId: number,
  locationId: number,
  input?: { expectedNewMonthlyTotal?: number | null }
): Promise<LifecycleResult> {
  const { org, location } = await requireOrgLocation(
    organizationId,
    locationId
  );

  if (location.status === "pending_cancellation") {
    return reopenPending(org, location);
  }
  if (location.status === "cancelled") {
    return reopenCancelled(org, location, input);
  }
  throw new LocationError(
    "LOCATION_NOT_REOPENABLE",
    "This location is already active.",
    { locationId }
  );
}

/** Free undo inside the already-paid period. */
async function reopenPending(
  org: IOrganization,
  location: ILocation
): Promise<LifecycleResult> {
  const previousEffectiveAt = location.cancel_effective_at;

  // DB first
  await LocationModel.markActive(location.id);

  let action: LifecycleResult["billing"]["action"] = "none";
  try {
    const item = await getReachableItem(org);
    if (item && org.billing_quantity_override == null) {
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(
        org.stripe_subscription_id as string
      );
      if (sub.cancel_at_period_end || sub.cancel_at) {
        await stripe.subscriptions.update(
          org.stripe_subscription_id as string,
          { cancel_at_period_end: false }
        );
        action = "subscription_resumed";
      }
      const activeRow = await LocationModel.countActiveByOrganizationId(
        org.id
      );
      const targetQuantity = Number(activeRow?.count) || 1;
      if (item.quantity !== targetQuantity) {
        // Already paid for this period — restore with no proration
        await stripe.subscriptionItems.update(item.itemId, {
          quantity: targetQuantity,
          proration_behavior: "none",
        });
        if (action === "none") action = "quantity_restored";
      }
    }
  } catch (stripeError) {
    if (previousEffectiveAt) {
      await LocationModel.markPendingCancellation(
        location.id,
        previousEffectiveAt
      );
    }
    logger.error(
      { err: (stripeError as Error)?.message },
      `[LocationLifecycle] Stripe update failed reopening pending location ${location.id} (org ${org.id}) — status reverted`
    );
    throw new BillingLocationError(
      "LOCATION_BILLING_ERROR",
      "Could not update billing for this reopen. Nothing was changed — try again.",
      null
    );
  }

  logger.info(
    `[LocationLifecycle] Location ${location.id} (org ${org.id}) reopened from pending cancellation (${action})`
  );
  void sendLocationLifecycleEmail(org, location.name, "reopened", null);

  const updated = await LocationModel.findById(location.id);
  return {
    location: updated as ILocation,
    billing: { action, effectiveAt: null, chargedNow: null },
  };
}

/** Paid re-add — reuses Phase A's quote + synchronous prorated charge. */
async function reopenCancelled(
  org: IOrganization,
  location: ILocation,
  input?: { expectedNewMonthlyTotal?: number | null }
): Promise<LifecycleResult> {
  const quote = await getAddLocationQuote(org.id);

  if (
    input?.expectedNewMonthlyTotal != null &&
    quote.newMonthlyTotal != null &&
    input.expectedNewMonthlyTotal !== quote.newMonthlyTotal
  ) {
    throw new BillingLocationError(
      "QUOTE_STALE",
      "The billing amounts changed since the quote was shown. Review the updated summary and confirm again.",
      { expected: input.expectedNewMonthlyTotal, actual: quote.newMonthlyTotal }
    );
  }

  let chargedNow: number | null = null;

  await LocationModel.transaction(async (trx) => {
    await LocationModel.markActive(location.id, trx);
    if (quote.mode === "quantity") {
      const activeRow = await LocationModel.countActiveByOrganizationId(
        org.id,
        trx
      );
      const targetQuantity = Math.max(Number(activeRow?.count) || 0, 1);
      chargedNow = await chargeForQuantityIncrease(
        org,
        `reopen-${location.id}`,
        targetQuantity
      );
    } else if (quote.mode === "unavailable") {
      logger.warn(
        `[LocationLifecycle] Reopening location ${location.id} for org ${org.id} WITHOUT billing mutation — Stripe objects unavailable`
      );
    }
  });

  logger.info(
    `[LocationLifecycle] Location ${location.id} (org ${org.id}) reopened from cancelled (mode=${quote.mode}, chargedNow=${chargedNow ?? "n/a"})`
  );
  void sendLocationLifecycleEmail(org, location.name, "reopened", null);

  const updated = await LocationModel.findById(location.id);
  return {
    location: updated as ILocation,
    billing: {
      action: quote.mode === "quantity" ? "charged" : "none",
      effectiveAt: null,
      chargedNow,
    },
  };
}

// ─── Finalize (worker) ───

/**
 * Flip due pending_cancellation rows to cancelled. Idempotent by predicate —
 * the query only ever returns rows still pending with a passed effective
 * date, so re-runs and overlapping ticks are safe (§21.1). No Stripe calls:
 * quantity/subscription changes happened at cancel time.
 */
export async function finalizeDueCancellations(now: Date): Promise<number> {
  const due = await LocationModel.findDuePendingCancellations(now);
  for (const location of due) {
    await LocationModel.markCancelled(location.id);
    logger.info(
      `[LocationLifecycle] Finalized cancellation of location ${location.id} (org ${location.organization_id}) — effective ${location.cancel_effective_at?.toISOString?.() ?? location.cancel_effective_at}`
    );
  }
  return due.length;
}
