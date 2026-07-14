import { describe, expect, it } from "vitest";

import type { ActionItem } from "../../types/tasks";
import { selectSummaryDashboardData } from "./useTopAction";

function summaryTask({
  id,
  createdAt,
  priority,
  withEvidence = true,
}: {
  id: number;
  createdAt: string;
  priority: number;
  withEvidence?: boolean;
}): ActionItem {
  return {
    id,
    title: `Summary ${id}`,
    category: "ALLORO",
    status: "pending",
    is_approved: false,
    created_by_admin: false,
    agent_type: "SUMMARY" as unknown as ActionItem["agent_type"],
    created_at: createdAt,
    updated_at: createdAt,
    metadata: {
      title: `Action ${id}`,
      urgency: "medium",
      priority_score: priority,
      domain: "review",
      rationale: "Review rationale",
      supporting_metrics: [],
      outcome: { deliverables: "Plan", mechanism: "Follow-up" },
      cta: { primary: { label: "View", action_url: "/reviews" } },
      domain_summaries: [
        {
          domain: "review",
          heading: "Local review comparison",
          summary: `Comparison ${id}`,
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
  it("preserves priority-based hero selection while using the newest comparison", () => {
    const olderHighPriority = summaryTask({
      id: 1,
      createdAt: "2026-07-01T00:00:00Z",
      priority: 0.99,
    });
    const newerLowerPriority = summaryTask({
      id: 2,
      createdAt: "2026-07-10T00:00:00Z",
      priority: 0.5,
    });

    const selection = selectSummaryDashboardData([
      olderHighPriority,
      newerLowerPriority,
    ]);

    expect(selection.topAction?.taskId).toBe(1);
    expect(selection.latestChoosableSummary?.summary).toBe("Comparison 2");
  });

  it("uses task ID as the deterministic newest-summary tie-break", () => {
    const createdAt = "2026-07-10T00:00:00Z";
    const selection = selectSummaryDashboardData([
      summaryTask({ id: 10, createdAt, priority: 0.5 }),
      summaryTask({ id: 11, createdAt, priority: 0.4 }),
    ]);
    expect(selection.latestChoosableSummary?.summary).toBe("Comparison 11");
  });

  it("does not fall back when the newest Summary lacks grounded evidence", () => {
    const selection = selectSummaryDashboardData([
      summaryTask({
        id: 1,
        createdAt: "2026-07-01T00:00:00Z",
        priority: 0.8,
      }),
      summaryTask({
        id: 2,
        createdAt: "2026-07-10T00:00:00Z",
        priority: 0.7,
        withEvidence: false,
      }),
    ]);

    expect(selection.topAction?.taskId).toBe(1);
    expect(selection.latestChoosableSummary).toBeNull();
  });
});
