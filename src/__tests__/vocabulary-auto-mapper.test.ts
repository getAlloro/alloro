/**
 * Unit tests for the vocabulary auto-mapper service (src/services/vocabularyAutoMapper.ts).
 *
 * Proves the write and read sides in isolation, with the model mocked so no
 * Postgres is touched:
 *   - detectPreset maps a GBP category string to the right vocabulary preset.
 *   - autoConfigureVocabulary is first-write-wins (skips insert when a config
 *     already exists) and scopes its read to the org (§11.7).
 *   - getResolvedVocabulary serves the stored preset back, tolerating both the
 *     jsonb object and a stringified payload, and returns null when unconfigured.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../models/VocabularyConfigModel", () => ({
  VocabularyConfigModel: {
    findByOrgId: vi.fn(),
    insertConfig: vi.fn(),
  },
}));

import { VocabularyConfigModel } from "../models/VocabularyConfigModel";
import logger from "../lib/logger";
import {
  CATEGORY_MAP,
  detectPreset,
  autoConfigureVocabulary,
  getResolvedVocabulary,
} from "../services/vocabularyAutoMapper";

const findByOrgId = vi.mocked(VocabularyConfigModel.findByOrgId);
const insertConfig = vi.mocked(VocabularyConfigModel.insertConfig);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("detectPreset", () => {
  it("maps a dental-specialist category to its preset", () => {
    const preset = detectPreset("Endodontist");
    expect(preset.vertical).toBe("endodontics");
    expect(preset.patientTerm).toBe("patient");
    expect(preset.referralTerm).toBe("referring dentist");
  });

  it("maps a legal category to the client vocabulary", () => {
    const preset = detectPreset("Law Firm");
    expect(preset.vertical).toBe("legal");
    expect(preset.patientTerm).toBe("client");
  });

  it("falls back to the universal preset for an unknown category", () => {
    const preset = detectPreset("Widget Foundry");
    expect(preset.vertical).toBe("general");
    expect(preset.patientTerm).toBe("customer");
  });

  it("uses additional GBP types as extra detection signal", () => {
    // Ambiguous primary, but the type disambiguates to veterinary.
    const preset = detectPreset("Clinic", ["Animal Hospital"]);
    expect(preset.vertical).toBe("veterinary");
    expect(preset.patientTerm).toBe("pet owner");
  });
});

describe("autoConfigureVocabulary (write path)", () => {
  it("inserts a config scoped to the org when none exists yet", async () => {
    findByOrgId.mockResolvedValue(undefined);
    insertConfig.mockResolvedValue(undefined);

    const preset = await autoConfigureVocabulary(7, "Endodontist");

    expect(findByOrgId).toHaveBeenCalledWith(7);
    expect(insertConfig).toHaveBeenCalledTimes(1);
    const arg = insertConfig.mock.calls[0][0];
    expect(arg.org_id).toBe(7);
    expect(arg.vertical).toBe("endodontics");
    expect(JSON.parse(arg.overrides).patientTerm).toBe("patient");
    expect(preset.vertical).toBe("endodontics");
  });

  it("is first-write-wins — does not insert when a config already exists", async () => {
    findByOrgId.mockResolvedValue({
      id: 1,
      org_id: 7,
      vertical: "legal",
      overrides: {},
    });

    await autoConfigureVocabulary(7, "Endodontist");

    expect(insertConfig).not.toHaveBeenCalled();
  });

  it("does not throw when the insert fails — the caller's lifecycle is protected", async () => {
    findByOrgId.mockResolvedValue(undefined);
    insertConfig.mockRejectedValue(new Error("db down"));

    const preset = await autoConfigureVocabulary(7, "Law Firm");

    expect(preset.vertical).toBe("legal");
  });
});

describe("getResolvedVocabulary (read path)", () => {
  it("returns null when the org has no config", async () => {
    findByOrgId.mockResolvedValue(undefined);
    expect(await getResolvedVocabulary(7)).toBeNull();
    expect(findByOrgId).toHaveBeenCalledWith(7);
  });

  it("returns the stored preset when overrides is a jsonb object", async () => {
    findByOrgId.mockResolvedValue({
      id: 1,
      org_id: 7,
      vertical: "legal",
      overrides: { vertical: "legal", patientTerm: "client" },
    });

    const preset = await getResolvedVocabulary(7);
    expect(preset?.vertical).toBe("legal");
    expect(preset?.patientTerm).toBe("client");
  });

  it("parses a stringified overrides payload", async () => {
    findByOrgId.mockResolvedValue({
      id: 1,
      org_id: 7,
      vertical: "legal",
      overrides: JSON.stringify({ vertical: "legal", patientTerm: "client" }),
    });

    const preset = await getResolvedVocabulary(7);
    expect(preset?.patientTerm).toBe("client");
  });
});

describe("CATEGORY_MAP — vertical labels", () => {
  /**
   * Closed allow-list. A vertical is read back through GET /api/vocabulary and
   * stored denormalized in its own column, so anything branching on it treats a
   * wrong label as fact. First-write-wins makes a wrong label permanent for the
   * org that received it, so the guard belongs here, not in review.
   */
  const ALLOWED_VERTICALS = new Set([
    "endodontics",
    "orthodontics",
    "oral_surgery",
    "prosthodontics",
    "general_dental",
    "veterinary",
    "legal",
    "accounting",
    "chiropractic",
    "physical_therapy",
    "optometry",
    "beauty",
    "home_services",
    "food_service",
    "automotive",
    "real_estate",
    "fitness",
    "medspa",
    "financial_advisor",
    "general",
  ]);

  it("every preset's vertical is in the allow-list", () => {
    const offenders = CATEGORY_MAP.filter(
      (entry) => !ALLOWED_VERTICALS.has(entry.preset.vertical)
    ).map((entry) => `${entry.patterns.join("|")} → ${entry.preset.vertical}`);

    expect(offenders).toEqual([]);
  });

  it("does not spell one concept two ways", () => {
    const verticals = new Set(CATEGORY_MAP.map((e) => e.preset.vertical));
    // "general_dentistry" and "general_dental" both existed. One concept, one
    // spelling — otherwise a consumer branching on the string misses half.
    expect(verticals.has("general_dentistry")).toBe(false);
    expect(verticals.has("general_dental")).toBe(true);
  });

  it("does not label a non-endodontic specialty as endodontics", () => {
    // Regression guard: an oral-surgery or prosthodontic practice reading
    // `vertical: "endodontics"` is a wrong fact about the practice.
    expect(detectPreset("Oral and Maxillofacial Surgeon").vertical).toBe("oral_surgery");
    expect(detectPreset("Prosthodontist").vertical).toBe("prosthodontics");
    expect(detectPreset("Periodontist").vertical).toBe("general_dental");
    // The one that genuinely is endodontics still is.
    expect(detectPreset("Endodontist").vertical).toBe("endodontics");
  });
});

describe("autoConfigureVocabulary — an existing config is never overwritten", () => {
  it("skips the insert and returns the freshly detected preset", async () => {
    findByOrgId.mockResolvedValue({
      id: 1,
      org_id: 7,
      vertical: "general_dental",
      overrides: {},
    } as Awaited<ReturnType<typeof VocabularyConfigModel.findByOrgId>>);

    const preset = await autoConfigureVocabulary(7, "Orthodontist");

    // Documented explicitly: the STORED row stays general_dental even though
    // the practice now reads as an orthodontist. There is no re-resolve path.
    expect(insertConfig).not.toHaveBeenCalled();
    expect(preset.vertical).toBe("orthodontics");
  });

  it("logs the disagreement so the drift is visible", async () => {
    const infoSpy = vi.spyOn(logger, "info");
    findByOrgId.mockResolvedValue({
      id: 1,
      org_id: 7,
      vertical: "general_dental",
      overrides: {},
    } as Awaited<ReturnType<typeof VocabularyConfigModel.findByOrgId>>);

    await autoConfigureVocabulary(7, "Orthodontist");

    const logged = infoSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("orthodontics");
    expect(logged).toContain("general_dental");
    infoSpy.mockRestore();
  });

  it("stays quiet when the detected vertical agrees with the stored one", async () => {
    const infoSpy = vi.spyOn(logger, "info");
    findByOrgId.mockResolvedValue({
      id: 1,
      org_id: 7,
      vertical: "orthodontics",
      overrides: {},
    } as Awaited<ReturnType<typeof VocabularyConfigModel.findByOrgId>>);

    await autoConfigureVocabulary(7, "Orthodontist");

    expect(infoSpy).not.toHaveBeenCalled();
    infoSpy.mockRestore();
  });

  it("catches a unique-violation on insert, logs it, and does not throw", async () => {
    findByOrgId.mockResolvedValue(undefined as never);
    const uniqueViolation = Object.assign(
      new Error('duplicate key value violates unique constraint "vocabulary_configs_org_id_unique"'),
      { code: "23505" }
    );
    insertConfig.mockRejectedValue(uniqueViolation);
    const warnSpy = vi.spyOn(logger, "warn");

    // The concurrent-write loser must degrade, not break the caller's refresh.
    await expect(autoConfigureVocabulary(7, "Endodontist")).resolves.toMatchObject({
      vertical: "endodontics",
    });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
