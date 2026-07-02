/**
 * Unit tests — LocationService GBP-reuse guard (plans/07032026-multi-location-billing, Phase A T5).
 *
 * Load-bearing guarantees:
 *   • A GBP profile already linked to another location in the org fails with
 *     a typed GBP_ALREADY_LINKED error on BOTH create and change-GBP paths —
 *     never the opaque unique-index 500 (the One Endo Add-Location bug).
 *   • Re-selecting a location's own GBP on the change path is a no-op
 *     re-link, not a clash.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../models/LocationModel", () => ({
  LocationModel: {
    transaction: vi.fn(async (cb: (trx: unknown) => Promise<unknown>) =>
      cb({})
    ),
    count: vi.fn(async () => 1),
    create: vi.fn(async () => ({ id: 9, organization_id: 41 })),
    findById: vi.fn(),
    findByOrganizationId: vi.fn(async () => []),
    updateById: vi.fn(),
    nullOutLocationReferences: vi.fn(),
    deleteById: vi.fn(),
  },
}));

vi.mock("../models/GooglePropertyModel", () => ({
  GooglePropertyModel: {
    findByConnectionAndExternalId: vi.fn(),
    findByConnectionId: vi.fn(async () => []),
    findByLocationId: vi.fn(async () => []),
    create: vi.fn(async () => ({ id: 1 })),
    deleteByLocationId: vi.fn(),
  },
}));

vi.mock("../models/GoogleConnectionModel", () => ({
  GoogleConnectionModel: {
    findOneByOrganization: vi.fn(async () => ({ id: 5 })),
    updatePropertyIds: vi.fn(),
  },
}));

vi.mock("../models/OrganizationModel", () => ({
  OrganizationModel: {
    findById: vi.fn(async () => ({ id: 41, domain: "test.com" })),
  },
}));

vi.mock("../controllers/billing/BillingService", () => ({
  syncSubscriptionQuantity: vi.fn(),
}));

import {
  createLocationInTransaction,
  setLocationGBP,
} from "../controllers/locations/LocationService";
import { LocationError } from "../controllers/locations/feature-utils/LocationError";
import { GooglePropertyModel } from "../models/GooglePropertyModel";
import { LocationModel } from "../models/LocationModel";

const gbp = { accountId: "acc", locationId: "gbp-123", displayName: "GBP" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createLocationInTransaction — GBP reuse guard", () => {
  it("throws typed GBP_ALREADY_LINKED when the profile backs another location", async () => {
    vi.mocked(
      GooglePropertyModel.findByConnectionAndExternalId
    ).mockResolvedValue({ id: 1, location_id: 7 } as never);

    await expect(
      createLocationInTransaction({} as never, 41, "New Office", gbp)
    ).rejects.toBeInstanceOf(LocationError);
    await expect(
      createLocationInTransaction({} as never, 41, "New Office", gbp)
    ).rejects.toMatchObject({ code: "GBP_ALREADY_LINKED" });
    expect(LocationModel.create).not.toHaveBeenCalled();
  });

  it("creates the location + property when the profile is unlinked", async () => {
    vi.mocked(
      GooglePropertyModel.findByConnectionAndExternalId
    ).mockResolvedValue(undefined as never);

    const location = await createLocationInTransaction(
      {} as never,
      41,
      "New Office",
      gbp
    );
    expect(location.id).toBe(9);
    expect(LocationModel.create).toHaveBeenCalledTimes(1);
    expect(GooglePropertyModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ external_id: "gbp-123", location_id: 9 }),
      expect.anything()
    );
  });
});

describe("setLocationGBP — GBP reuse guard", () => {
  it("allows re-selecting the location's own GBP (no-op re-link)", async () => {
    vi.mocked(LocationModel.findById).mockResolvedValue({
      id: 7,
      organization_id: 41,
    } as never);
    vi.mocked(
      GooglePropertyModel.findByConnectionAndExternalId
    ).mockResolvedValue({ id: 1, location_id: 7 } as never);

    await expect(setLocationGBP(7, 41, gbp)).resolves.toBeUndefined();
    expect(GooglePropertyModel.create).toHaveBeenCalled();
  });

  it("throws GBP_ALREADY_LINKED when the profile backs a different location", async () => {
    vi.mocked(LocationModel.findById).mockResolvedValue({
      id: 7,
      organization_id: 41,
    } as never);
    vi.mocked(
      GooglePropertyModel.findByConnectionAndExternalId
    ).mockResolvedValue({ id: 1, location_id: 8 } as never);

    await expect(setLocationGBP(7, 41, gbp)).rejects.toMatchObject({
      code: "GBP_ALREADY_LINKED",
    });
    expect(GooglePropertyModel.deleteByLocationId).not.toHaveBeenCalled();
  });
});
