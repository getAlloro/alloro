/**
 * Unit tests — LocationBillingService (plans/07032026-multi-location-billing, Phase A).
 *
 * Load-bearing guarantees:
 *   • Quote branch matrix: no_subscription / flat_rate ($0) / quantity (math
 *     from the subscription item) / unavailable (foreign-mode Stripe ids).
 *   • Create-after-paid ordering: the location insert runs inside the same
 *     transaction as the charge; a declined card rejects the transaction so
 *     nothing is committed and the error carries PAYMENT_FAILED.
 *   • Idempotent retry: a subscription already at the target quantity is
 *     never charged again.
 *   • Consent integrity: a client-echoed total that disagrees with the
 *     server recompute rejects with QUOTE_STALE before any transaction.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Stripe from "stripe";

const mockStripe = {
  subscriptions: { retrieve: vi.fn() },
  subscriptionItems: { update: vi.fn() },
  invoices: {
    createPreview: vi.fn(),
    list: vi.fn(),
    finalizeInvoice: vi.fn(),
    pay: vi.fn(),
    voidInvoice: vi.fn(),
  },
};

vi.mock("../config/stripe", () => ({
  getStripe: () => mockStripe,
  isStripeConfigured: vi.fn(() => true),
  getStripeMode: () => "test",
  getDefaultPriceId: () => "price_test_default",
}));

vi.mock("../models/OrganizationModel", () => ({
  OrganizationModel: { findById: vi.fn() },
}));

vi.mock("../models/LocationModel", () => ({
  LocationModel: {
    transaction: vi.fn(async (cb: (trx: unknown) => Promise<unknown>) =>
      cb({})
    ),
    countByOrganizationId: vi.fn(),
  },
}));

vi.mock("../models/GooglePropertyModel", () => ({
  GooglePropertyModel: { findByLocationId: vi.fn(async () => []) },
}));

vi.mock("../controllers/locations/LocationService", () => ({
  createLocationInTransaction: vi.fn(),
}));

vi.mock("../controllers/billing/feature-utils/billingEmails", () => ({
  sendQuantityUpdateEmail: vi.fn(async () => undefined),
}));

import {
  getAddLocationQuote,
  purchaseLocation,
} from "../controllers/billing/feature-services/LocationBillingService";
import { BillingLocationError } from "../controllers/billing/feature-utils/BillingLocationError";
import { OrganizationModel } from "../models/OrganizationModel";
import { LocationModel } from "../models/LocationModel";
import { createLocationInTransaction } from "../controllers/locations/LocationService";
import { isStripeConfigured } from "../config/stripe";

const orgBase = {
  id: 41,
  name: "Test Org",
  stripe_customer_id: "cus_test",
  stripe_subscription_id: "sub_test",
  stripe_price_id: null,
  billing_quantity_override: null,
};

const NOW_SEC = Math.floor(Date.now() / 1000);
const subscriptionItem = (quantity: number) => ({
  items: {
    data: [
      {
        id: "si_test",
        quantity,
        price: {
          unit_amount: 200000,
          currency: "usd",
          recurring: { interval: "month" },
        },
        current_period_start: NOW_SEC - 15 * 86400,
        current_period_end: NOW_SEC + 15 * 86400,
      },
    ],
  },
});

const resourceMissing = () =>
  new Stripe.errors.StripeInvalidRequestError({
    type: "invalid_request_error",
    code: "resource_missing",
    message: "No such subscription",
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isStripeConfigured).mockReturnValue(true);
  vi.mocked(LocationModel.transaction).mockImplementation(async (cb) =>
    cb({} as never)
  );
});

describe("getAddLocationQuote — branch matrix", () => {
  it("returns no_subscription when the org has no Stripe subscription", async () => {
    vi.mocked(OrganizationModel.findById).mockResolvedValue({
      ...orgBase,
      stripe_subscription_id: null,
    } as never);

    const quote = await getAddLocationQuote(41);
    expect(quote.mode).toBe("no_subscription");
    expect(quote.proratedChargeNow).toBeNull();
  });

  it("returns flat_rate with a $0 charge for override orgs", async () => {
    vi.mocked(OrganizationModel.findById).mockResolvedValue({
      ...orgBase,
      billing_quantity_override: 1,
    } as never);

    const quote = await getAddLocationQuote(41);
    expect(quote.mode).toBe("flat_rate");
    expect(quote.proratedChargeNow).toBe(0);
    expect(mockStripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it("computes quantity-mode math from the subscription item", async () => {
    vi.mocked(OrganizationModel.findById).mockResolvedValue(orgBase as never);
    mockStripe.subscriptions.retrieve.mockResolvedValue(subscriptionItem(1));
    mockStripe.invoices.createPreview.mockResolvedValue({ total: 98765 });

    const quote = await getAddLocationQuote(41);
    expect(quote.mode).toBe("quantity");
    expect(quote.unitAmount).toBe(200000);
    expect(quote.currentQuantity).toBe(1);
    expect(quote.newQuantity).toBe(2);
    expect(quote.currentMonthlyTotal).toBe(200000);
    expect(quote.newMonthlyTotal).toBe(400000);
    expect(quote.proratedChargeNow).toBe(98765);
    expect(quote.periodEnd).toBeTruthy();
  });

  it("falls back to arithmetic proration when the preview call fails", async () => {
    vi.mocked(OrganizationModel.findById).mockResolvedValue(orgBase as never);
    mockStripe.subscriptions.retrieve.mockResolvedValue(subscriptionItem(1));
    mockStripe.invoices.createPreview.mockRejectedValue(new Error("preview down"));

    const quote = await getAddLocationQuote(41);
    // ~half the period remains → ~half the unit price, allow drift for test runtime
    expect(quote.proratedChargeNow).toBeGreaterThan(90000);
    expect(quote.proratedChargeNow).toBeLessThan(110000);
  });

  it("returns unavailable for foreign-mode Stripe ids (resource_missing)", async () => {
    vi.mocked(OrganizationModel.findById).mockResolvedValue(orgBase as never);
    mockStripe.subscriptions.retrieve.mockRejectedValue(resourceMissing());

    const quote = await getAddLocationQuote(41);
    expect(quote.mode).toBe("unavailable");
    expect(quote.unitAmount).toBeNull();
  });
});

describe("purchaseLocation — create after paid", () => {
  const input = {
    name: "South Orange",
    gbp: { accountId: "acc", locationId: "gbp-123", displayName: "South Orange GBP" },
  };
  const fakeLocation = { id: 9, organization_id: 41, name: "South Orange" };

  it("updates quantity then pays the proration invoice synchronously", async () => {
    vi.mocked(OrganizationModel.findById).mockResolvedValue(orgBase as never);
    mockStripe.subscriptions.retrieve.mockResolvedValue(subscriptionItem(1));
    mockStripe.invoices.createPreview.mockResolvedValue({ total: 98765 });
    mockStripe.subscriptionItems.update.mockResolvedValue({});
    mockStripe.invoices.list.mockResolvedValue({
      data: [
        {
          id: "in_test",
          billing_reason: "subscription_update",
          created: NOW_SEC,
          status: "open",
          amount_paid: 0,
        },
      ],
    });
    mockStripe.invoices.pay.mockResolvedValue({
      id: "in_test",
      status: "paid",
      amount_paid: 98765,
    });
    vi.mocked(createLocationInTransaction).mockResolvedValue(
      fakeLocation as never
    );
    vi.mocked(LocationModel.countByOrganizationId).mockResolvedValue({
      count: 2,
    } as never);

    const result = await purchaseLocation(41, input);

    expect(createLocationInTransaction).toHaveBeenCalledTimes(1);
    expect(mockStripe.subscriptionItems.update).toHaveBeenCalledWith(
      "si_test",
      {
        quantity: 2,
        proration_behavior: "always_invoice",
      },
      { idempotencyKey: expect.stringContaining("locadd-41-gbp-123-q2") }
    );
    expect(mockStripe.invoices.pay).toHaveBeenCalledWith("in_test");
    expect(result.billing.chargedNow).toBe(98765);
    expect(result.billing.mode).toBe("quantity");
    expect(result.location.id).toBe(9);
  });

  it("on payment failure: voids the invoice, reverts quantity, rejects PAYMENT_FAILED, commits nothing", async () => {
    vi.mocked(OrganizationModel.findById).mockResolvedValue(orgBase as never);
    mockStripe.subscriptions.retrieve.mockResolvedValue(subscriptionItem(1));
    mockStripe.invoices.createPreview.mockResolvedValue({ total: 98765 });
    mockStripe.subscriptionItems.update.mockResolvedValue({});
    mockStripe.invoices.list.mockResolvedValue({
      data: [
        {
          id: "in_test",
          billing_reason: "subscription_update",
          created: NOW_SEC,
          status: "open",
          amount_paid: 0,
        },
      ],
    });
    mockStripe.invoices.pay.mockRejectedValue(
      new Stripe.errors.StripeCardError({
        type: "card_error",
        code: "card_declined",
        message: "Your card was declined.",
      } as never)
    );
    mockStripe.invoices.voidInvoice.mockResolvedValue({});
    vi.mocked(createLocationInTransaction).mockResolvedValue(
      fakeLocation as never
    );
    vi.mocked(LocationModel.countByOrganizationId).mockResolvedValue({
      count: 2,
    } as never);

    let transactionRejected = false;
    vi.mocked(LocationModel.transaction).mockImplementation(async (cb) => {
      try {
        return await cb({} as never);
      } catch (err) {
        transactionRejected = true; // knex would roll back here
        throw err;
      }
    });

    await expect(purchaseLocation(41, input)).rejects.toMatchObject({
      code: "PAYMENT_FAILED",
    });
    expect(transactionRejected).toBe(true);
    expect(mockStripe.invoices.voidInvoice).toHaveBeenCalledWith("in_test");
    // Compensating revert: second update call restores the original quantity
    expect(mockStripe.subscriptionItems.update).toHaveBeenLastCalledWith(
      "si_test",
      { quantity: 1, proration_behavior: "none" }
    );
  });

  it("skips the charge when the subscription is already at the target quantity", async () => {
    vi.mocked(OrganizationModel.findById).mockResolvedValue(orgBase as never);
    mockStripe.subscriptions.retrieve.mockResolvedValue(subscriptionItem(2));
    mockStripe.invoices.createPreview.mockResolvedValue({ total: 0 });
    vi.mocked(createLocationInTransaction).mockResolvedValue(
      fakeLocation as never
    );
    vi.mocked(LocationModel.countByOrganizationId).mockResolvedValue({
      count: 2,
    } as never);

    const result = await purchaseLocation(41, input);
    expect(mockStripe.subscriptionItems.update).not.toHaveBeenCalled();
    expect(result.billing.chargedNow).toBeNull();
  });

  it("rejects with QUOTE_STALE before any transaction when totals disagree", async () => {
    vi.mocked(OrganizationModel.findById).mockResolvedValue(orgBase as never);
    mockStripe.subscriptions.retrieve.mockResolvedValue(subscriptionItem(1));
    mockStripe.invoices.createPreview.mockResolvedValue({ total: 98765 });

    await expect(
      purchaseLocation(41, { ...input, expectedNewMonthlyTotal: 123 })
    ).rejects.toMatchObject({ code: "QUOTE_STALE" });
    expect(LocationModel.transaction).not.toHaveBeenCalled();
  });

  it("creates without any Stripe mutation for flat-rate orgs", async () => {
    vi.mocked(OrganizationModel.findById).mockResolvedValue({
      ...orgBase,
      billing_quantity_override: 1,
    } as never);
    vi.mocked(createLocationInTransaction).mockResolvedValue(
      fakeLocation as never
    );

    const result = await purchaseLocation(41, input);
    expect(mockStripe.subscriptionItems.update).not.toHaveBeenCalled();
    expect(result.billing.mode).toBe("flat_rate");
    expect(result.billing.chargedNow).toBeNull();
  });

  it("throws BillingLocationError with ORG_NOT_FOUND for a missing org", async () => {
    vi.mocked(OrganizationModel.findById).mockResolvedValue(undefined as never);
    await expect(purchaseLocation(999, input)).rejects.toBeInstanceOf(
      BillingLocationError
    );
  });
});
