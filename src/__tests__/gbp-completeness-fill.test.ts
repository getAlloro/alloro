/**
 * A2 → A6 bridge — the detect → fix wire. Proves that the completeness detector's
 * MISSING-field set stages an owner-approval draft ONLY for fields where Alloro
 * genuinely holds the value (website ← domain), and never fabricates or blank-fills
 * the rest. The model layer and createDraft are stubbed at the module seam, so no DB
 * or Google touch happens during the build.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCompletenessFillPatch } from "../controllers/gbp-automation/feature-utils/gbpCompletenessFill";
import { GBP_COMPLETENESS_FIELDS } from "../services/ai-seo-audit/gbpCompletenessScoring";

const h = vi.hoisted(() => ({
  findLocationById: vi.fn(),
  findOrgById: vi.fn(),
  createDraft: vi.fn(),
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

describe("buildCompletenessFillPatch — pure per-field source map", () => {
  it("fills websiteUri from a bare domain, normalizing to https", () => {
    const r = buildCompletenessFillPatch(["website"], { website: "example.com" });
    expect(r.patch).toEqual({ websiteUri: "https://example.com/" });
    expect(r.updateMask).toEqual(["websiteUri"]);
    expect(r.filled).toEqual(["websiteUri"]);
    expect(r.unfillable).toEqual([]);
  });

  it("keeps an already-schemed domain as-is", () => {
    const r = buildCompletenessFillPatch(["website"], {
      website: "https://practice.dental",
    });
    expect(r.patch.websiteUri).toBe("https://practice.dental/");
  });

  it("skips website (no-value-source) when Alloro holds no domain — never blank", () => {
    for (const website of [null, undefined, "", "   "]) {
      const r = buildCompletenessFillPatch(["website"], { website });
      expect(r.patch).toEqual({});
      expect(r.updateMask).toEqual([]);
      expect(r.unfillable).toEqual([{ field: "website", reason: "no-value-source" }]);
    }
  });

  it("classifies category / phone / hours as no-value-source (not guessed)", () => {
    const r = buildCompletenessFillPatch(["category", "phone", "hours"], {});
    expect(r.patch).toEqual({});
    expect(r.unfillable).toEqual([
      { field: "category", reason: "no-value-source" },
      { field: "phone", reason: "no-value-source" },
      { field: "hours", reason: "no-value-source" },
    ]);
  });

  it("classifies address / photos as not-writable", () => {
    const r = buildCompletenessFillPatch(["address", "photos"], { website: "x.com" });
    expect(r.unfillable).toEqual([
      { field: "address", reason: "not-writable" },
      { field: "photos", reason: "not-writable" },
    ]);
  });

  it("fills what it can and reports the rest in one mixed set", () => {
    const r = buildCompletenessFillPatch(
      ["website", "phone", "address"],
      { website: "smiles.co" }
    );
    expect(r.patch).toEqual({ websiteUri: "https://smiles.co/" });
    expect(r.filled).toEqual(["websiteUri"]);
    expect(r.unfillable).toEqual([
      { field: "phone", reason: "no-value-source" },
      { field: "address", reason: "not-writable" },
    ]);
  });

  it("routes an unknown/unhandled field to unfillable — a detected gap is never lost", () => {
    // Simulate a 7th field slipping through (e.g. added to GBP_COMPLETENESS_FIELDS
    // without a switch case, or untyped upstream data). The cast reproduces that
    // at the type boundary; the default branch must surface it, never drop it.
    const unknownField = "menu" as unknown as (typeof GBP_COMPLETENESS_FIELDS)[number];
    const r = buildCompletenessFillPatch([unknownField], { website: "x.com" });
    expect(r.patch).toEqual({});
    expect(r.updateMask).toEqual([]);
    expect(r.filled).toEqual([]);
    expect(r.unfillable).toEqual([{ field: "menu", reason: "unhandled-field" }]);
  });

  it("keeps handled fields and still surfaces an unknown field alongside them", () => {
    const unknownField = "menu" as unknown as (typeof GBP_COMPLETENESS_FIELDS)[number];
    const r = buildCompletenessFillPatch(
      ["website", unknownField, "photos"],
      { website: "smiles.co" }
    );
    expect(r.patch).toEqual({ websiteUri: "https://smiles.co/" });
    expect(r.filled).toEqual(["websiteUri"]);
    expect(r.unfillable).toEqual([
      { field: "menu", reason: "unhandled-field" },
      { field: "photos", reason: "not-writable" },
    ]);
  });
});

describe("GbpCompletenessDraftService.stageFillForMissingFields", () => {
  const params = {
    organizationId: 7,
    locationId: 42,
    userId: 3,
    actorEmail: "op@alloro.com",
    accessibleLocationIds: [42],
    missingFields: ["website", "phone"] as const,
  };

  beforeEach(() => {
    h.findLocationById.mockReset();
    h.findOrgById.mockReset();
    h.createDraft.mockReset();
  });

  it("stages a createDraft for website from location.domain and returns the unfillable rest", async () => {
    h.findLocationById.mockResolvedValue({
      id: 42,
      organization_id: 7,
      domain: "oneendo.com",
    });
    h.createDraft.mockResolvedValue({ id: 900 });

    const result = await GbpCompletenessDraftService.stageFillForMissingFields(params);

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
    expect(result.unfillable).toEqual([{ field: "phone", reason: "no-value-source" }]);
    // org domain not consulted when the location carries its own domain
    expect(h.findOrgById).not.toHaveBeenCalled();
  });

  it("falls back to org.domain when the location has none", async () => {
    h.findLocationById.mockResolvedValue({ id: 42, organization_id: 7, domain: null });
    h.findOrgById.mockResolvedValue({ id: 7, domain: "orgsite.com" });
    h.createDraft.mockResolvedValue({ id: 901 });

    await GbpCompletenessDraftService.stageFillForMissingFields(params);

    expect(h.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ patch: { websiteUri: "https://orgsite.com/" } })
    );
  });

  it("stages NOTHING (no createDraft) when Alloro holds no value for any gap", async () => {
    h.findLocationById.mockResolvedValue({ id: 42, organization_id: 7, domain: null });
    h.findOrgById.mockResolvedValue({ id: 7, domain: null });

    const result = await GbpCompletenessDraftService.stageFillForMissingFields(params);

    expect(h.createDraft).not.toHaveBeenCalled();
    expect(result.workItem).toBeNull();
    expect(result.unfillable).toEqual([
      { field: "website", reason: "no-value-source" },
      { field: "phone", reason: "no-value-source" },
    ]);
  });

  it("refuses a location outside the org from server context (§11.7)", async () => {
    h.findLocationById.mockResolvedValue({ id: 42, organization_id: 999, domain: "x.com" });

    await expect(
      GbpCompletenessDraftService.stageFillForMissingFields(params)
    ).rejects.toThrow(/access/i);
    expect(h.createDraft).not.toHaveBeenCalled();
  });
});
