/**
 * The GBP primary category must reach the vocabulary mapper by NAME, not by
 * array position.
 *
 * `mapGBPToBusinessData` only pushes the primary category into
 * `business_data.categories` when it has a `displayName`. Google returns some
 * categories with a resource `name` and no `displayName`, and in that case a
 * position-based read makes `categories[0]` the first ADDITIONAL category. The
 * mapper is first-write-wins, so an org classified from a secondary category
 * keeps that label permanently.
 *
 * §20.4 — Google, the DB, and the mapper are all mocked; nothing leaves this
 * process.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/vocabularyAutoMapper", () => ({
  autoConfigureVocabulary: vi.fn(),
}));

vi.mock("../models/LocationModel", () => ({
  LocationModel: {
    findById: vi.fn(),
    updateById: vi.fn(),
  },
}));

vi.mock("../models/OrganizationModel", () => ({
  OrganizationModel: { findById: vi.fn() },
}));

vi.mock("../models/GooglePropertyModel", () => ({
  GooglePropertyModel: { findByLocationId: vi.fn() },
}));

vi.mock("../controllers/gbp/gbp-services/gbp-api.service", () => ({
  buildAuthHeaders: vi.fn(async () => ({ Authorization: "Bearer test" })),
}));

vi.mock("axios", () => ({
  default: { get: vi.fn() },
}));

vi.mock("../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import axios from "axios";
import { LocationModel } from "../models/LocationModel";
import { GooglePropertyModel } from "../models/GooglePropertyModel";
import { autoConfigureVocabulary as autoConfigureVocabularyImport } from "../services/vocabularyAutoMapper";
import { refreshLocationBusinessData } from "../controllers/locations/BusinessDataService";

const autoConfigureVocabulary = vi.mocked(autoConfigureVocabularyImport);
const axiosGet = vi.mocked(axios.get);

const ORG_ID = 7;
const LOCATION_ID = 42;

/** Drive the refresh with a synthetic Google profile payload. */
async function refreshWithProfile(profile: unknown): Promise<void> {
  vi.mocked(LocationModel.findById).mockResolvedValue({
    id: LOCATION_ID,
    organization_id: ORG_ID,
  } as Awaited<ReturnType<typeof LocationModel.findById>>);
  vi.mocked(LocationModel.updateById).mockResolvedValue(
    undefined as never
  );
  vi.mocked(GooglePropertyModel.findByLocationId).mockResolvedValue([
    { external_id: "locations/123", account_id: "accounts/9" },
  ] as Awaited<ReturnType<typeof GooglePropertyModel.findByLocationId>>);
  axiosGet.mockResolvedValue({ data: profile });

  await refreshLocationBusinessData(LOCATION_ID, ORG_ID, {});
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("refreshLocationBusinessData — vocabulary category source", () => {
  it("passes the primary category display name, with the rest as extra signal", async () => {
    await refreshWithProfile({
      title: "One Endodontics",
      categories: {
        primaryCategory: { name: "gcid:endodontist", displayName: "Endodontist" },
        additionalCategories: [
          { name: "gcid:dentist", displayName: "Dentist" },
          { name: "gcid:oral_surgeon", displayName: "Oral Surgeon" },
        ],
      },
    });

    expect(autoConfigureVocabulary).toHaveBeenCalledTimes(1);
    expect(autoConfigureVocabulary).toHaveBeenCalledWith(ORG_ID, "Endodontist", [
      "Dentist",
      "Oral Surgeon",
    ]);
  });

  it("writes nothing when the primary category has no display name", async () => {
    // The failure this guards: `categories[0]` would be "Dentist" here, and the
    // org would be permanently labelled general_dental from a SECONDARY
    // category. Better to stay unconfigured and resolve on a later refresh.
    await refreshWithProfile({
      title: "One Endodontics",
      categories: {
        primaryCategory: { name: "gcid:endodontist" },
        additionalCategories: [{ name: "gcid:dentist", displayName: "Dentist" }],
      },
    });

    expect(autoConfigureVocabulary).not.toHaveBeenCalled();
  });

  it("writes nothing when the primary category display name is blank", async () => {
    await refreshWithProfile({
      title: "One Endodontics",
      categories: {
        primaryCategory: { displayName: "   " },
        additionalCategories: [{ displayName: "Dentist" }],
      },
    });

    expect(autoConfigureVocabulary).not.toHaveBeenCalled();
  });

  it("writes nothing when the profile carries no categories at all", async () => {
    await refreshWithProfile({ title: "One Endodontics" });
    expect(autoConfigureVocabulary).not.toHaveBeenCalled();
  });

  it("handles a primary category with no additional categories", async () => {
    await refreshWithProfile({
      title: "One Endodontics",
      categories: { primaryCategory: { displayName: "Endodontist" } },
    });

    expect(autoConfigureVocabulary).toHaveBeenCalledWith(ORG_ID, "Endodontist", []);
  });

  it("does not break the business-data refresh when the mapper throws", async () => {
    autoConfigureVocabulary.mockRejectedValue(new Error("vocabulary_configs missing"));

    await expect(
      refreshWithProfile({
        title: "One Endodontics",
        categories: { primaryCategory: { displayName: "Endodontist" } },
      })
    ).resolves.toBeUndefined();

    // The location's business data was still persisted.
    expect(LocationModel.updateById).toHaveBeenCalled();
  });
});
