import { describe, expect, it } from "vitest";

import {
  SummaryV2OutputSchema,
  type SummaryV2Output,
} from "../controllers/agents/types/agent-output-schemas";
import { validateSummarySupportingMetrics } from "../controllers/agents/feature-utils/summaryV2Validators";
import type { DashboardMetrics } from "../utils/dashboard-metrics/types";

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

function output(): SummaryV2Output {
  return SummaryV2OutputSchema.parse({
    top_actions: [
      {
        title: "Keep review momentum",
        urgency: "medium",
        priority_score: 0.8,
        domain: "review",
        rationale: "Eight new reviews kept your profile moving this month.",
        highlights: [],
        supporting_metrics: [
          {
            label: "Total reviews",
            value: "550",
            source_field: "reviews.total_review_count",
          },
          {
            label: "Rating",
            value: "4.8",
            source_field: "reviews.current_rating",
          },
          {
            label: "New reviews",
            value: "8",
            source_field: "reviews.reviews_this_month",
          },
        ],
        outcome: { deliverables: "Review plan", mechanism: "Monthly follow-up" },
        cta: { primary: { label: "View reviews", action_url: "/reviews" } },
      },
    ],
    domain_summaries: [
      {
        domain: "review",
        heading: "Local review comparison",
        summary: "Your review volume is at the local median.",
        detail: "You have 550 reviews; Apex Dental leads the set with 1,000.",
        supporting_metrics: [
          {
            label: "Your reviews",
            value: "550",
            source_field: "choosable.practice_review_count",
          },
          {
            label: "Strongest competitor",
            value: "Apex Dental",
            source_field: "choosable.strongest_competitor_name",
          },
          {
            label: "Competitor reviews",
            value: "1,000",
            source_field: "choosable.strongest_competitor_review_count",
          },
        ],
      },
    ],
  });
}

function cloneOutput(): SummaryV2Output {
  return structuredClone(output());
}

describe("Summary v2 Choosable evidence", () => {
  it("accepts grounded comparison copy", () => {
    expect(() => validateSummarySupportingMetrics(output(), metrics)).not.toThrow();
  });

  it("keeps a legacy output valid when Choosable data is not ready", () => {
    const legacy = output();
    legacy.domain_summaries = legacy.domain_summaries?.map(
      ({ supporting_metrics: _evidence, ...summary }) => summary
    );
    const notReadyMetrics = structuredClone(metrics);
    notReadyMetrics.choosable = {
      ...notReadyMetrics.choosable,
      source_status: "not_ready",
      source_reason: "competitors_not_finalized",
      has_competitor_set: false,
      competitor_count: 0,
      practice_review_count: null,
      strongest_competitor_name: null,
      strongest_competitor_review_count: null,
    };

    expect(() => SummaryV2OutputSchema.parse(legacy)).not.toThrow();
    expect(() =>
      validateSummarySupportingMetrics(legacy, notReadyMetrics)
    ).not.toThrow();
  });

  it.each([
    ["invented competitor", "Phantom Dental", "Apex Dental"],
    ["invented count", "900", "1,000"],
  ])("rejects an %s", (_label, fabricated, grounded) => {
    const candidate = cloneOutput();
    const summary = candidate.domain_summaries?.[0];
    if (!summary?.supporting_metrics) throw new Error("test fixture missing evidence");
    const evidence = summary.supporting_metrics.find(
      (metric) => metric.value === grounded
    );
    if (!evidence) throw new Error("test fixture missing grounded value");
    evidence.value = fabricated;
    summary.detail = summary.detail.replace(grounded, fabricated);

    expect(() => validateSummarySupportingMetrics(candidate, metrics)).toThrow(
      /does not match/
    );
  });

  it("rejects an unknown source field", () => {
    const candidate = cloneOutput();
    const evidence = candidate.domain_summaries?.[0]?.supporting_metrics?.[0];
    if (!evidence) throw new Error("test fixture missing evidence");
    evidence.source_field = "choosable.unknown_review_count";
    expect(() => validateSummarySupportingMetrics(candidate, metrics)).toThrow(
      /was not found/
    );
  });

  it("rejects false leadership wording", () => {
    const candidate = cloneOutput();
    const summary = candidate.domain_summaries?.[0];
    if (!summary) throw new Error("test fixture missing summary");
    summary.detail = "You lead with 550 reviews; Apex Dental has 1,000.";
    expect(() => validateSummarySupportingMetrics(candidate, metrics)).toThrow(
      /claims leadership/
    );
  });

  it("rejects wording that contradicts median standing", () => {
    const candidate = cloneOutput();
    const summary = candidate.domain_summaries?.[0];
    if (!summary) throw new Error("test fixture missing summary");
    summary.detail =
      "You are below the median with 550 reviews; Apex Dental has 1,000.";
    expect(() => validateSummarySupportingMetrics(candidate, metrics)).toThrow(
      /contradicts the review median/
    );
  });

  it("rejects Choosable evidence when the source is not ready", () => {
    const notReadyMetrics = structuredClone(metrics);
    notReadyMetrics.choosable.source_status = "not_ready";
    notReadyMetrics.choosable.source_reason = "competitors_not_finalized";
    expect(() =>
      validateSummarySupportingMetrics(output(), notReadyMetrics)
    ).toThrow(/source is not ready/);
  });
});
