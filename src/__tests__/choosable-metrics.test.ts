import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ILocationCompetitor } from "../models/LocationCompetitorModel";
import type { ILocation } from "../models/LocationModel";
import type { ReviewsMetrics } from "../utils/dashboard-metrics/types";

const modelMocks = vi.hoisted(() => ({
  findLocation: vi.fn(),
  getOnboardingStatus: vi.fn(),
  findActiveCompetitors: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("../models/LocationModel", () => ({
  LocationModel: { findById: modelMocks.findLocation },
}));
vi.mock("../models/LocationCompetitorModel", () => ({
  LocationCompetitorModel: {
    getOnboardingStatus: modelMocks.getOnboardingStatus,
    findActiveByLocationId: modelMocks.findActiveCompetitors,
  },
}));
vi.mock("../lib/logger", () => ({
  default: { warn: modelMocks.warn },
}));

import { ChoosableMetricsService } from "../controllers/dashboard/feature-services/ChoosableMetricsService";

const reviews: ReviewsMetrics = {
  oldest_unanswered_hours: null,
  unanswered_count: 0,
  unanswered_reviewer_names: [],
  avg_rating_this_month: 4.8,
  current_rating: 4.8,
  total_review_count: 550,
  rating_change_30d: 0.1,
  reviews_this_month: 8,
};

function location(overrides: Partial<ILocation> = {}): ILocation {
  return {
    id: 11,
    organization_id: 7,
    name: "Downtown",
    domain: null,
    is_primary: true,
    status: "active",
    cancel_effective_at: null,
    cancelled_at: null,
    business_data: null,
    location_competitor_onboarding_status: "finalized",
    location_competitor_onboarding_finalized_at: new Date("2026-06-30T00:00:00Z"),
    competitor_set_revision: 1,
    competitor_discovery_radius_meters: 16000,
    client_place_id: "practice-place",
    client_lat: 40,
    client_lng: -74,
    created_at: new Date("2026-01-01T00:00:00Z"),
    updated_at: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

function competitor(
  id: number,
  name: string,
  reviewCount: number,
  checkedAt: string
): ILocationCompetitor {
  const timestamp = new Date(checkedAt);
  return {
    id,
    location_id: 11,
    place_id: `place-${id}`,
    name,
    address: null,
    primary_type: "dentist",
    rating: 4.7,
    review_count: reviewCount,
    lat: 40,
    lng: -74,
    phone: "555-0100",
    website: "https://example.test",
    photo_name: "photo",
    discovery_position: id,
    discovery_query: "dentist",
    discovery_source: "places_text",
    discovery_checked_at: timestamp,
    discovery_radius_meters: 16000,
    profile_strength_score: null,
    profile_strength_tier: null,
    profile_strength_factors: null,
    source: "user_added",
    added_at: timestamp,
    added_by_user_id: 1,
    removed_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  modelMocks.findLocation.mockResolvedValue(location());
  modelMocks.getOnboardingStatus.mockResolvedValue({
    status: "finalized",
    finalizedAt: new Date("2026-06-30T00:00:00Z"),
  });
  modelMocks.findActiveCompetitors.mockResolvedValue([
    competitor(1, "Small Dental", 100, "2026-07-02T00:00:00Z"),
    competitor(2, "Apex Dental", 1000, "2026-07-01T00:00:00Z"),
  ]);
});

describe("ChoosableMetricsService", () => {
  it("returns not-ready without a location", async () => {
    const result = await ChoosableMetricsService.build(7, null, reviews);
    expect(result).toMatchObject({
      source_status: "not_ready",
      source_reason: "missing_location",
      has_competitor_set: false,
    });
    expect(modelMocks.findLocation).not.toHaveBeenCalled();
  });

  it("rejects a location owned by another organization", async () => {
    modelMocks.findLocation.mockResolvedValue(location({ organization_id: 8 }));
    const result = await ChoosableMetricsService.build(7, 11, reviews);
    expect(result.source_reason).toBe("location_not_found");
    expect(modelMocks.getOnboardingStatus).not.toHaveBeenCalled();
  });

  it.each(["pending", "curating"] as const)(
    "does not load competitors while onboarding is %s",
    async (status) => {
      modelMocks.getOnboardingStatus.mockResolvedValue({
        status,
        finalizedAt: null,
      });
      const result = await ChoosableMetricsService.build(7, 11, reviews);
      expect(result).toMatchObject({
        source_status: "not_ready",
        source_reason: "competitors_not_finalized",
      });
      expect(modelMocks.findActiveCompetitors).not.toHaveBeenCalled();
    }
  );

  it("distinguishes a finalized but empty competitor set", async () => {
    modelMocks.findActiveCompetitors.mockResolvedValue([]);
    const result = await ChoosableMetricsService.build(7, 11, reviews);
    expect(result).toMatchObject({
      source_status: "not_ready",
      source_reason: "no_active_competitors",
      competitor_count: 0,
    });
  });

  it("separates median standing from true review leadership", async () => {
    const result = await ChoosableMetricsService.build(7, 11, reviews);
    expect(result).toMatchObject({
      source_status: "ready",
      competitor_count: 2,
      practice_review_count: 550,
      competitor_median_review_count: 550,
      strongest_competitor_name: "Apex Dental",
      strongest_competitor_review_count: 1000,
      competitors_ahead_on_reviews: 1,
      review_count_gap_to_median: 0,
      is_at_or_above_review_median: true,
      has_most_reviews: false,
      as_of: "2026-07-01T00:00:00.000Z",
    });
  });

  it("reports an unavailable source after a model failure", async () => {
    const failure = new Error("database unavailable");
    modelMocks.findLocation.mockRejectedValue(failure);
    const result = await ChoosableMetricsService.build(7, 11, reviews);
    expect(result).toMatchObject({
      source_status: "unavailable",
      source_reason: "query_failed",
    });
    expect(modelMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: failure, organizationId: 7, locationId: 11 }),
      expect.stringContaining("source unavailable")
    );
  });
});
