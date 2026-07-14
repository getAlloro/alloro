import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import type { DashboardMetrics } from "../utils/dashboard-metrics/types";
import { mockDb, resetTableResults, setTableResult } from "./helpers/db";

const computeDashboardMetrics = vi.hoisted(() => vi.fn());

vi.mock("../database/connection", () => mockDb());
vi.mock("../models/LocationModel", () => ({
  LocationModel: {
    findByOrganizationId: vi.fn(async () => [{ id: 11 }, { id: 12 }]),
  },
}));
vi.mock("../utils/dashboard-metrics/service.dashboard-metrics", async () => {
  const actual = await vi.importActual<
    typeof import("../utils/dashboard-metrics/service.dashboard-metrics")
  >("../utils/dashboard-metrics/service.dashboard-metrics");
  return { ...actual, computeDashboardMetrics };
});

import { app } from "./helpers/app";
import { authHeader } from "./helpers/auth";

const metrics: DashboardMetrics = {
  reviews: {
    oldest_unanswered_hours: null,
    unanswered_count: 0,
    unanswered_reviewer_names: [],
    avg_rating_this_month: 4.9,
    current_rating: 4.8,
    total_review_count: 550,
    rating_change_30d: 0.1,
    reviews_this_month: 8,
  },
  gbp: {
    days_since_last_post: 3,
    posts_last_quarter: 6,
    call_clicks_last_30d: 12,
    direction_clicks_last_30d: 9,
  },
  ranking: {
    position: 1,
    total_competitors: 3,
    score: 91,
    lowest_factor: null,
    highest_factor: null,
    score_gap_to_top: 0,
  },
  form_submissions: {
    unread_count: 0,
    oldest_unread_hours: null,
    verified_count: 4,
    verified_this_week: 2,
    flagged_count: 0,
  },
  pms: {
    distinct_months: 3,
    last_upload_days_ago: 2,
    missing_months_in_period: [],
    production_total: 120000,
    production_change_30d: 4,
    total_referrals: 10,
    doctor_referrals: 8,
    self_referrals: 2,
    production_this_month: 40000,
    doctor_referrals_this_month: 3,
    total_referrals_this_month: 4,
  },
  referral: {
    top_dropping_source: null,
    top_growing_source: null,
    sources_count: 5,
  },
  choosable: {
    source_status: "ready",
    source_reason: null,
    has_competitor_set: true,
    competitor_count: 2,
    practice_review_count: 550,
    practice_rating: 4.8,
    competitor_median_review_count: 550,
    strongest_competitor_name: "Apex Dental",
    strongest_competitor_review_count: 1000,
    competitors_ahead_on_reviews: 1,
    review_count_gap_to_median: 0,
    is_at_or_above_review_median: true,
    has_most_reviews: false,
    as_of: "2026-07-01T00:00:00.000Z",
    practice_profile_strength: null,
    competitor_median_profile_strength: 80,
    weakest_choosable_factor: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  resetTableResults();
  setTableResult("organization_users", {
    user_id: 1,
    organization_id: 7,
    role: "admin",
  });
  computeDashboardMetrics.mockResolvedValue(metrics);
});

describe("GET /api/dashboard/metrics", () => {
  it("denies a location outside the authenticated organization", async () => {
    const response = await request(app)
      .get("/api/dashboard/metrics")
      .query({ organization_id: 999, locationId: 99 })
      .set(authHeader());

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      success: false,
      data: null,
      error: {
        code: "DASHBOARD_LOCATION_ACCESS_DENIED",
        message: "No access to this location",
        details: null,
      },
    });
    expect(computeDashboardMetrics).not.toHaveBeenCalled();
  });

  it("uses server-derived organization context and returns the canonical envelope", async () => {
    const response = await request(app)
      .get("/api/dashboard/metrics")
      .query({ organization_id: 999, locationId: 11 })
      .set(authHeader());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: metrics, error: null });
    expect(computeDashboardMetrics).toHaveBeenCalledWith(
      7,
      11,
      expect.objectContaining({ start: expect.any(String), end: expect.any(String) }),
      null
    );
  });

  it("requires a scoped location", async () => {
    const response = await request(app)
      .get("/api/dashboard/metrics")
      .query({ organization_id: 999 })
      .set(authHeader());

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: "DASHBOARD_LOCATION_REQUIRED" },
    });
    expect(computeDashboardMetrics).not.toHaveBeenCalled();
  });
});
