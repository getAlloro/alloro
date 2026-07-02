/**
 * Unit tests — LocationLifecycleService (plans/07032026-multi-location-billing, Phase B).
 *
 * Load-bearing guarantees:
 *   • Cancel branch matrix: quantity decrement (proration none) / last-active
 *     → subscription cancel_at_period_end / no-sub → immediate cancelled.
 *   • Write ordering: DB status first, Stripe second, compensating revert to
 *     active when the Stripe call fails.
 *   • Reopen: pending → free restore (clear cancel_at_period_end + quantity
 *     back, no proration); cancelled → paid re-add via the Phase A charge.
 *   • Tenant scope: another org's location is indistinguishable from missing.
 *   • Finalizer: flips only due pending rows; count returned; idempotent by
 *     predicate.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStripe = {
  subscriptions: { retrieve: vi.fn(), update: vi.fn() },
  subscriptionItems: { update: vi.fn() },
};

vi.mock("../config/stripe", () => ({
  getStripe: () => mockStripe,
  isStripeConfigured: vi.fn(() => true),
  getStripeMode: () => "test",
  getDefaultPriceId: () => "price_test_default",
}));

vi.mock("../models/LocationModel", () => ({
  LocationModel: {
    findById: vi.fn(),
    countActiveByOrganizationId: vi.fn(),
    findDuePendingCancellations: vi.fn(),
    markPendingCancellation: vi.fn(),
    markCancelled: vi.fn(),
    markActive: vi.fn(),
    transaction: vi.fn(async (cb: (trx: unknown) => Promise<unknown>) =>
      cb({} as never)
    ),
  },
}));

vi.mock("../models/OrganizationModel", () => ({
  OrganizationModel: { findById: vi.fn() },
}));

vi.mock(
  "../controllers/billing/feature-services/LocationBillingService",
  () => ({
    retrieveSubscriptionItem: vi.fn(),
    chargeForQuantityIncrease: vi.fn(),
    getAddLocationQuote: vi.fn(),
  })
);

vi.mock("../controllers/billing/feature-utils/billingEmails", () => ({
  sendLocationLifecycleEmail: vi.fn(async () => undefined),
  sendQuantityUpdateEmail: vi.fn(async () => undefined),
}));

import {
  cancelLocation,
  reopenLocation,
  finalizeDueCancellations,
} from "../controllers/locations/feature-services/LocationLifecycleService";
import { LocationModel } from "../models/LocationModel";
import { OrganizationModel } from "../models/OrganizationModel";
import {
  retrieveSubscriptionItem,
  chargeForQuantityIncrease,
  getAddLocationQuote,
} from "../controllers/billing/feature-services/LocationBillingService";

const NOW_SEC = Math.floor(Date.now() / 1000);
const org = {
  id: 41,
  name: "Test Org",
  stripe_customer_id: "cus_test",
  stripe_subscription_id: "sub_test",
  billing_quantity_override: null,
};
const itemView = (quantity: number) => ({
  itemId: "si_test",
  quantity,
  unitAmount: 200000,
  currency: "usd",
  interval: "month",
  periodStart: NOW_SEC - 15 * 86400,
  periodEnd: NOW_SEC + 15 * 86400,
});
const loc = (status: string, id = 7) =>
  ({
    id,
    organization_id: 41,
    name: "Branch Office",
    status,
    cancel_effective_at:
      status === "pending_cancellation" ? new Date() : null,
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(OrganizationModel.findById).mockResolvedValue(org as never);
  vi.mocked(LocationModel.transaction).mockImplementation(async (cb) =>
    cb({} as never)
  );
  vi.mocked(LocationModel.markPendingCancellation).mockResolvedValue(1);
  vi.mocked(LocationModel.markCancelled).mockResolvedValue(1);
  vi.mocked(LocationModel.markActive).mockResolvedValue(1);
});

describe("cancelLocation — branch matrix", () => {
  it("decrements quantity with proration none when other active locations remain", async () => {
    vi.mocked(LocationModel.findById).mockResolvedValue(loc("active"));
    vi.mocked(retrieveSubscriptionItem).mockResolvedValue(
      itemView(3) as never
    );
    vi.mocked(LocationModel.countActiveByOrganizationId).mockResolvedValue({
      count: 3,
    } as never);
    mockStripe.subscriptionItems.update.mockResolvedValue({});

    const result = await cancelLocation(41, 7);

    expect(LocationModel.markPendingCancellation).toHaveBeenCalledWith(
      7,
      expect.any(Date)
    );
    expect(mockStripe.subscriptionItems.update).toHaveBeenCalledWith(
      "si_test",
      { quantity: 2, proration_behavior: "none" }
    );
    expect(result.billing.action).toBe("quantity_decremented");
    expect(result.billing.effectiveAt).toBeTruthy();
  });

  it("schedules the whole subscription to end when cancelling the LAST active location", async () => {
    vi.mocked(LocationModel.findById).mockResolvedValue(loc("active"));
    vi.mocked(retrieveSubscriptionItem).mockResolvedValue(
      itemView(1) as never
    );
    vi.mocked(LocationModel.countActiveByOrganizationId).mockResolvedValue({
      count: 1,
    } as never);
    mockStripe.subscriptions.update.mockResolvedValue({});

    const result = await cancelLocation(41, 7);

    expect(mockStripe.subscriptions.update).toHaveBeenCalledWith("sub_test", {
      cancel_at_period_end: true,
    });
    expect(mockStripe.subscriptionItems.update).not.toHaveBeenCalled();
    expect(result.billing.action).toBe("subscription_ending");
  });

  it("cancels immediately for orgs without a reachable subscription", async () => {
    vi.mocked(OrganizationModel.findById).mockResolvedValue({
      ...org,
      stripe_subscription_id: null,
    } as never);
    vi.mocked(LocationModel.findById).mockResolvedValue(loc("active"));
    vi.mocked(LocationModel.countActiveByOrganizationId).mockResolvedValue({
      count: 2,
    } as never);

    const result = await cancelLocation(41, 7);

    expect(LocationModel.markCancelled).toHaveBeenCalledWith(7);
    expect(mockStripe.subscriptionItems.update).not.toHaveBeenCalled();
    expect(result.billing.action).toBe("none");
  });

  it("reverts the status to active when the Stripe call fails (DB-first ordering)", async () => {
    vi.mocked(LocationModel.findById).mockResolvedValue(loc("active"));
    vi.mocked(retrieveSubscriptionItem).mockResolvedValue(
      itemView(3) as never
    );
    vi.mocked(LocationModel.countActiveByOrganizationId).mockResolvedValue({
      count: 3,
    } as never);
    mockStripe.subscriptionItems.update.mockRejectedValue(
      new Error("stripe down")
    );

    await expect(cancelLocation(41, 7)).rejects.toMatchObject({
      code: "LOCATION_BILLING_ERROR",
    });
    expect(LocationModel.markPendingCancellation).toHaveBeenCalled();
    expect(LocationModel.markActive).toHaveBeenCalledWith(7);
  });

  it("rejects a non-active location", async () => {
    vi.mocked(LocationModel.findById).mockResolvedValue(
      loc("pending_cancellation")
    );
    await expect(cancelLocation(41, 7)).rejects.toMatchObject({
      code: "LOCATION_NOT_ACTIVE",
    });
  });

  it("treats another org's location as not found (tenant scope)", async () => {
    vi.mocked(LocationModel.findById).mockResolvedValue({
      id: 7,
      organization_id: 999,
      name: "Foreign",
      status: "active",
    } as never);
    await expect(cancelLocation(41, 7)).rejects.toMatchObject({
      code: "LOCATION_NOT_FOUND",
    });
    expect(LocationModel.markPendingCancellation).not.toHaveBeenCalled();
  });
});

describe("reopenLocation", () => {
  it("pending → free restore: clears cancel_at_period_end and restores quantity with proration none", async () => {
    vi.mocked(LocationModel.findById).mockResolvedValue(
      loc("pending_cancellation")
    );
    vi.mocked(retrieveSubscriptionItem).mockResolvedValue(
      itemView(1) as never
    );
    mockStripe.subscriptions.retrieve.mockResolvedValue({
      cancel_at_period_end: true,
      cancel_at: null,
    });
    mockStripe.subscriptions.update.mockResolvedValue({});
    vi.mocked(LocationModel.countActiveByOrganizationId).mockResolvedValue({
      count: 2,
    } as never);
    mockStripe.subscriptionItems.update.mockResolvedValue({});

    const result = await reopenLocation(41, 7);

    expect(LocationModel.markActive).toHaveBeenCalledWith(7);
    expect(mockStripe.subscriptions.update).toHaveBeenCalledWith("sub_test", {
      cancel_at_period_end: false,
    });
    expect(mockStripe.subscriptionItems.update).toHaveBeenCalledWith(
      "si_test",
      { quantity: 2, proration_behavior: "none" }
    );
    expect(result.billing.action).toBe("subscription_resumed");
    expect(result.billing.chargedNow).toBeNull();
  });

  it("cancelled → paid re-add through the Phase A charge path", async () => {
    vi.mocked(LocationModel.findById).mockResolvedValue(loc("cancelled"));
    vi.mocked(getAddLocationQuote).mockResolvedValue({
      mode: "quantity",
      newMonthlyTotal: 400000,
      currency: "usd",
    } as never);
    vi.mocked(LocationModel.countActiveByOrganizationId).mockResolvedValue({
      count: 2,
    } as never);
    vi.mocked(chargeForQuantityIncrease).mockResolvedValue(98765);

    const result = await reopenLocation(41, 7);

    expect(LocationModel.markActive).toHaveBeenCalledWith(7, expect.anything());
    expect(chargeForQuantityIncrease).toHaveBeenCalledWith(
      expect.objectContaining({ id: 41 }),
      "reopen-7",
      2
    );
    expect(result.billing.action).toBe("charged");
    expect(result.billing.chargedNow).toBe(98765);
  });

  it("cancelled + stale echo → QUOTE_STALE before any write", async () => {
    vi.mocked(LocationModel.findById).mockResolvedValue(loc("cancelled"));
    vi.mocked(getAddLocationQuote).mockResolvedValue({
      mode: "quantity",
      newMonthlyTotal: 400000,
    } as never);

    await expect(
      reopenLocation(41, 7, { expectedNewMonthlyTotal: 111 })
    ).rejects.toMatchObject({ code: "QUOTE_STALE" });
    expect(LocationModel.markActive).not.toHaveBeenCalled();
  });

  it("rejects reopening an active location", async () => {
    vi.mocked(LocationModel.findById).mockResolvedValue(loc("active"));
    await expect(reopenLocation(41, 7)).rejects.toMatchObject({
      code: "LOCATION_NOT_REOPENABLE",
    });
  });
});

describe("finalizeDueCancellations", () => {
  it("flips every due pending row and returns the count", async () => {
    vi.mocked(LocationModel.findDuePendingCancellations).mockResolvedValue([
      loc("pending_cancellation", 7),
      loc("pending_cancellation", 8),
    ] as never);

    const flipped = await finalizeDueCancellations(new Date());

    expect(flipped).toBe(2);
    expect(LocationModel.markCancelled).toHaveBeenCalledWith(7);
    expect(LocationModel.markCancelled).toHaveBeenCalledWith(8);
  });

  it("is a no-op when nothing is due", async () => {
    vi.mocked(LocationModel.findDuePendingCancellations).mockResolvedValue(
      [] as never
    );
    const flipped = await finalizeDueCancellations(new Date());
    expect(flipped).toBe(0);
    expect(LocationModel.markCancelled).not.toHaveBeenCalled();
  });
});
