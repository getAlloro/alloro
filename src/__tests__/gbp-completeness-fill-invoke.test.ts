/**
 * A2 → A6 bridge, PRODUCTION CALLER — the manual detect → fix trigger. Proves that
 * GbpCompletenessDraftService.stageFillForLocation grades ONE location live (from the
 * same audit-context source the get-found audit uses) and stages the fill draft, so
 * the previously caller-less stageFillForMissingFields now runs at runtime.
 *
 * Only the module seams are stubbed — resolveOrganizationAuditContext (the gbpData
 * source), the model layer, and createDraft — so no DB or Google touch happens. The
 * completeness grading (mapAiReadyGbpToCompletenessInput + scoreGbpCompleteness) runs
 * for real, so the missing-field set under test is exactly what production would grade.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  resolveContext: vi.fn(),
  findLocationById: vi.fn(),
  findOrgById: vi.fn(),
  createDraft: vi.fn(),
}));

vi.mock("../services/ai-seo-audit/organizationAuditContextService", () => ({
  resolveOrganizationAuditContext: h.resolveContext,
}));
vi.mock("../models/LocationModel", () => ({
  LocationModel: { findById: h.findLocationById },
}));
vi.mock("../models/OrganizationModel", () => ({
  OrganizationModel: { findById: h.findOrgById },
}));
vi.mock(
  "../controllers/gbp-automation/feature-services/GbpBusinessInfoDraftService",
  () => ({
    GbpBusinessInfoDraftService: { createDraft: h.createDraft },
  })
);

import { GbpCompletenessDraftService } from "../controllers/gbp-automation/feature-services/GbpCompletenessDraftService";

const CALLER = {
  organizationId: 7,
  locationId: 42,
  userId: 3,
  actorEmail: "op@alloro.com",
  accessibleLocationIds: [42],
};

/** An AI-ready GBP profile complete on every field EXCEPT the ones passed in `missing`. */
function gbpProfile(missing: Set<string> = new Set()): Record<string, unknown> {
  return {
    imagesCount: missing.has("photos") ? 0 : 3,
    profile: {
      primaryCategory: missing.has("category") ? null : "Dentist",
      phoneNumber: missing.has("phone") ? null : "+1-555-0100",
      websiteUri: missing.has("website") ? null : "https://existing.example",
      storefrontAddress: missing.has("address")
        ? null
        : {
            addressLines: ["1 Main St"],
            locality: "Town",
            administrativeArea: "CA",
            postalCode: "90000",
          },
      regularHours: missing.has("hours") ? { periods: [] } : { periods: [{ openDay: "MONDAY" }] },
    },
  };
}

function contextWithLocation(gbpData: Record<string, unknown> | null) {
  return { locations: [{ id: 42, name: "One Endo", domain: "oneendo.com", gbpData }] };
}

beforeEach(() => {
  h.resolveContext.mockReset();
  h.findLocationById.mockReset();
  h.findOrgById.mockReset();
  h.createDraft.mockReset();
  // stageFillForMissingFields re-checks tenant ownership via the model layer.
  h.findLocationById.mockResolvedValue({ id: 42, organization_id: 7, domain: "oneendo.com" });
});

describe("GbpCompletenessDraftService.stageFillForLocation — manual detect → fix trigger", () => {
  it("stages a fill draft for a location with a fillable gap (website ← domain)", async () => {
    h.resolveContext.mockResolvedValue(
      contextWithLocation(gbpProfile(new Set(["website"])))
    );
    h.createDraft.mockResolvedValue({ id: 900 });

    const result = await GbpCompletenessDraftService.stageFillForLocation(CALLER);

    expect(h.resolveContext).toHaveBeenCalledWith(7);
    expect(h.createDraft).toHaveBeenCalledOnce();
    expect(h.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 7,
        locationId: 42,
        patch: { websiteUri: "https://oneendo.com/" },
        updateMask: ["websiteUri"],
      })
    );
    expect(result.workItem).toEqual({ id: 900 });
    expect(result.filled).toEqual(["websiteUri"]);
    expect(result.hasGbpData).toBe(true);
    expect(result.missingFields).toEqual(["website"]);
    expect(result.unfillable).toEqual([]);
  });

  it("refuses a location the caller's org does not own (§11.7) — never stages", async () => {
    // The audit context is org-scoped, so a foreign location is simply absent.
    h.resolveContext.mockResolvedValue({
      locations: [{ id: 99, name: "Other", domain: "other.com", gbpData: gbpProfile() }],
    });

    await expect(
      GbpCompletenessDraftService.stageFillForLocation(CALLER)
    ).rejects.toThrow(/access/i);
    expect(h.createDraft).not.toHaveBeenCalled();
  });

  it("stages NOTHING when the only gap is not fillable (phone) — honest empty, no draft", async () => {
    h.resolveContext.mockResolvedValue(
      contextWithLocation(gbpProfile(new Set(["phone"])))
    );

    const result = await GbpCompletenessDraftService.stageFillForLocation(CALLER);

    expect(h.createDraft).not.toHaveBeenCalled();
    expect(result.workItem).toBeNull();
    expect(result.hasGbpData).toBe(true);
    expect(result.missingFields).toEqual(["phone"]);
    expect(result.unfillable).toEqual([{ field: "phone", reason: "no-value-source" }]);
  });

  it("stages NOTHING for a complete profile — no missing fields at all", async () => {
    h.resolveContext.mockResolvedValue(contextWithLocation(gbpProfile()));

    const result = await GbpCompletenessDraftService.stageFillForLocation(CALLER);

    expect(h.createDraft).not.toHaveBeenCalled();
    expect(result.workItem).toBeNull();
    expect(result.missingFields).toEqual([]);
    expect(result.completeness).toBe(1);
  });

  it("reports honest empty when the location has no gradable GBP record at all", async () => {
    h.resolveContext.mockResolvedValue(contextWithLocation(null));

    const result = await GbpCompletenessDraftService.stageFillForLocation(CALLER);

    expect(h.createDraft).not.toHaveBeenCalled();
    expect(result.workItem).toBeNull();
    expect(result.hasGbpData).toBe(false);
    expect(result.completeness).toBe(0);
    expect(result.missingFields).toEqual([]);
  });
});
