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
import {
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
