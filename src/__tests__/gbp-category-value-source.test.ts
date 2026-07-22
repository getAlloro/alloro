/**
 * Category value-source tests.
 *
 * Proves three things without a live DB or any Google credentials (the shared knex
 * `db` and the BullMQ queues are mocked; model/service statics are spied):
 *
 *   1. The resolver reuses SearchConversion's specificity principle deterministically —
 *      a generic category + a supporting signal yields a strictly-more-specific,
 *      SETTABLE proposal; no signal / already-specific / self-match yields nothing.
 *   2. The orchestrator stages a proposal as an A6 `business_info` draft with the
 *      correct patch shape, and stages NOTHING when no better category exists.
 *   3. §5.4 — the write is unbypassable: with A6's master switch OFF, staging throws
 *      BUSINESS_INFO_WRITEBACK_DISABLED before any work item is created, and the
 *      happy path leaves the item at `draft` (owner approval still required) — the
 *      only outbound rail is createDraft, never a Google write.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { mockDb } from "./helpers/db";

vi.mock("../database/connection", () => mockDb());
vi.mock("../workers/queues", () => ({
  getGbpAutomationQueue: vi.fn(() => ({ add: vi.fn(async () => ({ id: "job-1" })) })),
}));
vi.mock("../services/ai-seo-audit/organizationAuditContextService", () => ({
  resolveOrganizationAuditContext: vi.fn(),
}));

import { CategoryRecommendationService } from "../controllers/gbp-automation/feature-services/CategoryRecommendationService";
import { CategoryValueSourceService } from "../controllers/gbp-automation/feature-services/CategoryValueSourceService";
import { GbpBusinessInfoDraftService } from "../controllers/gbp-automation/feature-services/GbpBusinessInfoDraftService";
import { GbpReadinessService } from "../controllers/gbp-automation/feature-services/GbpReadinessService";
import { GbpAutomationSettingsModel } from "../models/GbpAutomationSettingsModel";
import { GbpWorkItemModel, type IGbpWorkItem } from "../models/GbpWorkItemModel";
import { GbpWorkEventModel } from "../models/GbpWorkEventModel";
import { mapAiReadyGbpToCategoryInput } from "../controllers/gbp-automation/feature-utils/mapAiReadyGbpToCategoryInput";
import { resolveOrganizationAuditContext } from "../services/ai-seo-audit/organizationAuditContextService";

afterEach(() => {
  vi.restoreAllMocks();
});

const ORTHO_NAME = "categories/gcid:orthodontist";

describe("CategoryRecommendationService.recommendPrimaryCategory", () => {
  it("proposes a strictly-more-specific, settable category from a supporting signal", () => {
    const rec = CategoryRecommendationService.recommendPrimaryCategory({
      currentPrimaryCategory: { displayName: "Dentist", name: "categories/gcid:dentist" },
      signals: ["Dentist", "We are a braces and Invisalign practice"],
    });

    expect(rec).not.toBeNull();
    expect(rec?.proposed.name).toBe(ORTHO_NAME);
    expect(rec?.proposed.displayName).toBe("Orthodontist");
    // Value #6 — a proposal, never a rank promise.
    expect(rec?.rationale.toLowerCase()).toContain("proposal");
    expect(rec?.rationale.toLowerCase()).not.toContain("rank");
  });

  it("proposes nothing when no specialty signal is present", () => {
    const rec = CategoryRecommendationService.recommendPrimaryCategory({
      currentPrimaryCategory: { displayName: "Dentist", name: "categories/gcid:dentist" },
      signals: ["Dentist", "General family dentistry"],
    });
    expect(rec).toBeNull();
  });

  it("proposes nothing when the current category is already the specific one", () => {
    const rec = CategoryRecommendationService.recommendPrimaryCategory({
      currentPrimaryCategory: { displayName: "Orthodontist", name: ORTHO_NAME },
      signals: ["Orthodontist", "braces", "Invisalign"],
    });
    expect(rec).toBeNull();
  });

  it("does not propose the current category to itself (matched by displayName only)", () => {
    const rec = CategoryRecommendationService.recommendPrimaryCategory({
      currentPrimaryCategory: { displayName: "Orthodontist", name: null },
      signals: ["braces"],
    });
    expect(rec).toBeNull();
  });

  // Honesty fixes (adversarial review of PR #193): never propose off an unknown baseline,
  // never assert a falsehood, and never fire a board specialty on ordinary family copy.

  it("proposes nothing when the current category is out-of-catalog (already specialized)", () => {
    // "Oral and maxillofacial surgeon" is not a catalog entry. Even with oral-surgery
    // signals present, an unknown baseline must yield no lateral/downgrade proposal.
    const rec = CategoryRecommendationService.recommendPrimaryCategory({
      currentPrimaryCategory: {
        displayName: "Oral and maxillofacial surgeon",
        name: "categories/gcid:oral_and_maxillofacial_surgeon",
      },
      signals: ["oral surgery", "maxillofacial", "wisdom teeth", "braces", "invisalign"],
    });
    expect(rec).toBeNull();
  });

  it("proposes nothing for another out-of-catalog specialized current category", () => {
    const rec = CategoryRecommendationService.recommendPrimaryCategory({
      currentPrimaryCategory: {
        displayName: "Dental implants periodontist",
        name: "categories/gcid:dental_implants_periodontist",
      },
      signals: ["periodontal", "gum disease", "implants"],
    });
    expect(rec).toBeNull();
  });

  it("proposes nothing when there is no current category at all", () => {
    const rec = CategoryRecommendationService.recommendPrimaryCategory({
      currentPrimaryCategory: null,
      signals: ["braces", "Invisalign", "orthodontics"],
    });
    expect(rec).toBeNull();
  });

  it("does not propose Pediatric dentist from ordinary family-dentistry copy mentioning children", () => {
    const rec = CategoryRecommendationService.recommendPrimaryCategory({
      currentPrimaryCategory: { displayName: "Dentist", name: "categories/gcid:dentist" },
      signals: ["Dentist", "family dentistry, we welcome children"],
    });
    expect(rec).toBeNull();
  });

  it("still proposes Pediatric dentist from genuine pediatric-specialty copy", () => {
    const rec = CategoryRecommendationService.recommendPrimaryCategory({
      currentPrimaryCategory: { displayName: "Dentist", name: "categories/gcid:dentist" },
      signals: ["Dentist", "pediatric dentistry for kids"],
    });
    expect(rec).not.toBeNull();
    expect(rec?.proposed.displayName).toBe("Pediatric dentist");
    expect(rec?.proposed.name).toBe("categories/gcid:pediatric_dentist");
  });

  it("builds a truthful rationale — 'more specific than' the verified generic, no visibility claim", () => {
    const rec = CategoryRecommendationService.recommendPrimaryCategory({
      currentPrimaryCategory: { displayName: "Dentist", name: "categories/gcid:dentist" },
      signals: ["Dentist", "braces and Invisalign"],
    });
    expect(rec).not.toBeNull();
    const r = rec?.rationale.toLowerCase() ?? "";
    expect(r).toContain("more specific");
    expect(r).toContain("dentist"); // names the real, catalog-verified current category
    // No unmeasured visibility promise (Value #6).
    expect(r).not.toContain("surface");
    expect(r).not.toContain("searches");
    expect(r).not.toContain("rank");
  });

  // Multi-specialty tie-breaking: when signals match more than one specialty from the
  // same generic baseline, the resolver must pick deterministically — most signal
  // matches wins; catalog order breaks equal counts.

  it("picks the specialty with more signal matches when signals span multiple specialties", () => {
    // "braces", "invisalign", and "aligners" each match Orthodontist (3 hits).
    // "veneers" matches Cosmetic dentist (1 hit). Orthodontist wins on count.
    const rec = CategoryRecommendationService.recommendPrimaryCategory({
      currentPrimaryCategory: { displayName: "Dentist", name: "categories/gcid:dentist" },
      signals: ["Dentist", "braces and invisalign aligners with veneers"],
    });
    expect(rec).not.toBeNull();
    expect(rec?.proposed.displayName).toBe("Orthodontist");
    expect(rec?.proposed.name).toBe(ORTHO_NAME);
  });

  it("breaks equal match counts by catalog order (first-in-catalog wins)", () => {
    // "braces" → 1 hit for Orthodontist (catalog index 2).
    // "veneers" → 1 hit for Cosmetic dentist (catalog index 7).
    // Equal counts — Orthodontist appears first in catalog, so it wins.
    const rec = CategoryRecommendationService.recommendPrimaryCategory({
      currentPrimaryCategory: { displayName: "Dentist", name: "categories/gcid:dentist" },
      signals: ["Dentist", "braces and veneers"],
    });
    expect(rec).not.toBeNull();
    expect(rec?.proposed.displayName).toBe("Orthodontist");
    expect(rec?.proposed.name).toBe(ORTHO_NAME);
  });
});

describe("CategoryValueSourceService.proposeCategoryDraft — wiring", () => {
  const baseParams = {
    organizationId: 7,
    locationId: 3,
    userId: 11,
    actorEmail: "owner@example.com",
  };

  it("stages an A6 business_info draft with the category patch when a proposal exists", async () => {
    const createDraft = vi
      .spyOn(GbpBusinessInfoDraftService, "createDraft")
      .mockResolvedValue({ id: "wi-1", status: "draft" } as unknown as IGbpWorkItem);

    const result = await CategoryValueSourceService.proposeCategoryDraft({
      ...baseParams,
      recommendationInput: {
        currentPrimaryCategory: { displayName: "Dentist", name: "categories/gcid:dentist" },
        signals: ["Dentist", "orthodontics and braces"],
      },
    });

    expect(result.proposed).toBe(true);
    expect(createDraft).toHaveBeenCalledTimes(1);
    const arg = createDraft.mock.calls[0][0];
    expect(arg.updateMask).toEqual(["categories"]);
    expect(arg.patch).toEqual({
      categories: { primaryCategory: { name: ORTHO_NAME, displayName: "Orthodontist" } },
    });
    expect(arg.organizationId).toBe(7);
    expect(arg.locationId).toBe(3);
  });

  it("stages nothing when there is no better category", async () => {
    const createDraft = vi
      .spyOn(GbpBusinessInfoDraftService, "createDraft")
      .mockResolvedValue({ id: "wi-x" } as unknown as IGbpWorkItem);

    const result = await CategoryValueSourceService.proposeCategoryDraft({
      ...baseParams,
      recommendationInput: {
        currentPrimaryCategory: { displayName: "Dentist", name: "categories/gcid:dentist" },
        signals: ["Dentist", "general dentistry"],
      },
    });

    expect(result.proposed).toBe(false);
    expect(createDraft).not.toHaveBeenCalled();
  });
});

describe("CategoryValueSourceService.proposeCategoryDraft — write is unbypassable (§5.4)", () => {
  const proposalParams = {
    organizationId: 7,
    locationId: 3,
    userId: 11,
    recommendationInput: {
      currentPrimaryCategory: {
        displayName: "Dentist",
        name: "categories/gcid:dentist",
      },
      signals: ["Dentist", "orthodontics and braces"],
    },
  };

  it("throws BUSINESS_INFO_WRITEBACK_DISABLED and creates no work item when the master switch is off", async () => {
    // Real createDraft runs; only the master-switch source is stubbed OFF.
    vi.spyOn(GbpAutomationSettingsModel, "findEffectiveForLocation").mockResolvedValue({
      business_info_writeback_enabled: false,
    } as unknown as Awaited<
      ReturnType<typeof GbpAutomationSettingsModel.findEffectiveForLocation>
    >);
    const create = vi.spyOn(GbpWorkItemModel, "create");
    const readiness = vi.spyOn(GbpReadinessService, "getLocationReadiness");

    await expect(
      CategoryValueSourceService.proposeCategoryDraft(proposalParams)
    ).rejects.toMatchObject({ code: "BUSINESS_INFO_WRITEBACK_DISABLED" });

    // Guard runs before staging and before readiness is even consulted.
    expect(create).not.toHaveBeenCalled();
    expect(readiness).not.toHaveBeenCalled();
  });

  it("with the master switch on and Google ready, stages a draft-status item (owner approval still required)", async () => {
    vi.spyOn(GbpAutomationSettingsModel, "findEffectiveForLocation").mockResolvedValue({
      business_info_writeback_enabled: true,
    } as unknown as Awaited<
      ReturnType<typeof GbpAutomationSettingsModel.findEffectiveForLocation>
    >);
    vi.spyOn(GbpReadinessService, "getLocationReadiness").mockResolvedValue({
      googleProperty: { id: 42 },
      checks: {
        hasGoogleConnection: true,
        hasRefreshToken: true,
        hasBusinessManageScope: true,
        hasAccountId: true,
        hasExternalId: true,
      },
    } as unknown as Awaited<ReturnType<typeof GbpReadinessService.getLocationReadiness>>);
    // Run the model transaction inline; capture what createDraft persists.
    vi.spyOn(GbpWorkItemModel, "transaction").mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async (cb: any) => cb({})) as unknown as typeof GbpWorkItemModel.transaction
    );
    const created = { id: "wi-9", status: "draft" } as unknown as IGbpWorkItem;
    const create = vi.spyOn(GbpWorkItemModel, "create").mockResolvedValue(created);
    vi.spyOn(GbpWorkEventModel, "create").mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof GbpWorkEventModel.create>>
    );

    const result = await CategoryValueSourceService.proposeCategoryDraft(proposalParams);

    expect(result.proposed).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    const row = create.mock.calls[0][0];
    expect(row.content_type).toBe("business_info");
    expect(row.status).toBe("draft"); // NOT approved/published — the owner gate remains
    expect(row.business_info_payload).toEqual({
      patch: {
        categories: { primaryCategory: { name: ORTHO_NAME, displayName: "Orthodontist" } },
      },
      updateMask: ["categories"],
    });
  });
});

describe("mapAiReadyGbpToCategoryInput", () => {
  it("extracts the current primary category and free-text signals from the AI-ready profile", () => {
    const input = mapAiReadyGbpToCategoryInput({
      profile: {
        primaryCategory: "Dentist",
        additionalCategories: ["Dental clinic"],
        title: "Bright Smiles",
        description: "We offer braces and Invisalign orthodontics.",
      },
    });

    expect(input).not.toBeNull();
    expect(input?.currentPrimaryCategory).toEqual({ displayName: "Dentist", name: null });
    expect(input?.signals).toContain("Dentist");
    expect(input?.signals).toContain("Dental clinic");
    expect(input?.signals).toContain("We offer braces and Invisalign orthodontics.");
  });

  it("returns null when there is no gradable profile", () => {
    expect(mapAiReadyGbpToCategoryInput(null)).toBeNull();
    expect(mapAiReadyGbpToCategoryInput({})).toBeNull();
    expect(mapAiReadyGbpToCategoryInput({ profile: null })).toBeNull();
  });

  it("yields a null current category (but keeps other signals) when primaryCategory is absent", () => {
    const input = mapAiReadyGbpToCategoryInput({ profile: { description: "orthodontics" } });
    expect(input).not.toBeNull();
    expect(input?.currentPrimaryCategory).toBeNull();
    expect(input?.signals).toContain("orthodontics");
  });
});

describe("CategoryValueSourceService.proposeCategoryDraftForLocation", () => {
  const baseParams = {
    organizationId: 7,
    locationId: 3,
    userId: 11,
    actorEmail: "owner@example.com",
  };

  const contextWith = (locations: Array<{ id: number; gbpData: unknown }>) =>
    vi.mocked(resolveOrganizationAuditContext).mockResolvedValue({
      locations,
    } as unknown as Awaited<ReturnType<typeof resolveOrganizationAuditContext>>);

  it("throws LOCATION_ACCESS_DENIED when the location is not in the org's audit context (§11.7)", async () => {
    contextWith([{ id: 999, gbpData: {} }]);

    await expect(
      CategoryValueSourceService.proposeCategoryDraftForLocation(baseParams)
    ).rejects.toMatchObject({ code: "LOCATION_ACCESS_DENIED" });
  });

  it("stages a category proposal draft derived from the location's live GBP data", async () => {
    contextWith([
      {
        id: 3,
        gbpData: {
          profile: {
            primaryCategory: "Dentist",
            description: "We are a braces and Invisalign orthodontics practice.",
          },
        },
      },
    ]);
    const createDraft = vi
      .spyOn(GbpBusinessInfoDraftService, "createDraft")
      .mockResolvedValue({ id: "wi-1", status: "draft" } as unknown as IGbpWorkItem);

    const result = await CategoryValueSourceService.proposeCategoryDraftForLocation(baseParams);

    expect(result.proposed).toBe(true);
    expect(createDraft).toHaveBeenCalledTimes(1);
    expect(createDraft.mock.calls[0][0].updateMask).toEqual(["categories"]);
    expect(createDraft.mock.calls[0][0].patch).toEqual({
      categories: { primaryCategory: { name: ORTHO_NAME, displayName: "Orthodontist" } },
    });
  });

  it("stages nothing when the location has no gradable GBP profile", async () => {
    contextWith([{ id: 3, gbpData: {} }]);
    const createDraft = vi.spyOn(GbpBusinessInfoDraftService, "createDraft");

    const result = await CategoryValueSourceService.proposeCategoryDraftForLocation(baseParams);

    expect(result.proposed).toBe(false);
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("stages nothing when no better category is warranted (Value #6)", async () => {
    contextWith([
      {
        id: 3,
        gbpData: { profile: { primaryCategory: "Dentist", description: "general family dentistry" } },
      },
    ]);
    const createDraft = vi.spyOn(GbpBusinessInfoDraftService, "createDraft");

    const result = await CategoryValueSourceService.proposeCategoryDraftForLocation(baseParams);

    expect(result.proposed).toBe(false);
    expect(createDraft).not.toHaveBeenCalled();
  });
});
