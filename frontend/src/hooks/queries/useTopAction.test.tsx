import { describe, expect, it } from "vitest";

import type { LatestSummaryAgentOutput } from "../../types/agentSummary";
import { selectSummaryDashboardData } from "./useTopAction";

function latestSummary({
  priorities,
  withEvidence = true,
}: {
  priorities: number[];
  withEvidence?: boolean;
}): LatestSummaryAgentOutput {
  return {
    resultId: 42,
    lastUpdated: "2026-07-10T00:00:00Z",
    dateStart: "2026-06-01",
    dateEnd: "2026-06-30",
    results: {
      top_actions: priorities.map((priority, index) => ({
        title: `Action ${index + 1}`,
        urgency: "medium",
        priority_score: priority,
        domain: "review",
        rationale: "Review rationale",
        supporting_metrics: [],
        outcome: { deliverables: "Plan", mechanism: "Follow-up" },
        cta: { primary: { label: "View", action_url: "/reviews" } },
      })),
      domain_summaries: [
        {
          domain: "review",
          heading: "Local review comparison",
          summary: "Latest comparison",
          detail: "You have 550 reviews; Apex Dental has 1,000.",
          ...(withEvidence
            ? {
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
              }
            : {}),
        },
      ],
    },
  };
}

describe("selectSummaryDashboardData", () => {
  it("selects the highest-priority action from the latest Summary output", () => {
    const selection = selectSummaryDashboardData(
      latestSummary({ priorities: [0.5, 0.99] }),
    );

    expect(selection.topAction?.title).toBe("Action 2");
    expect(selection.topAction?.resultId).toBe(42);
    expect(selection.latestChoosableSummary?.summary).toBe("Latest comparison");
  });

  it("returns an empty selection when there is no latest Summary result", () => {
    expect(selectSummaryDashboardData(null)).toEqual({
      topAction: null,
      latestChoosableSummary: null,
    });
  });

  it("does not expose a comparison without grounded evidence", () => {
    const selection = selectSummaryDashboardData(
      latestSummary({ priorities: [0.8], withEvidence: false }),
    );

    expect(selection.topAction?.title).toBe("Action 1");
    expect(selection.latestChoosableSummary).toBeNull();
  });
});
