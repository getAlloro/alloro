import { describe, expect, it } from "vitest";

import { sanitizeRankingLlmAnalysis } from "../controllers/practice-ranking/feature-services/service.ranking-output-guardrails";

function analysisWithOverview(text: string) {
  return {
    top_recommendations: [
      {
        title: "Protect the lead",
        description: "Protect the lead",
      },
    ],
    gaps: [],
    overview_card: { text, highlights: ["Protect the lead"] },
  };
}

describe("ranking output guardrail search-position bands", () => {
  it.each([2, 3])("preserves protective top-three framing at position %s", (position) => {
    const result = sanitizeRankingLlmAnalysis(
      analysisWithOverview("Protect the lead with weekly Google posts."),
      { searchPosition: position },
    );

    expect(result.overview_card.text).toContain("protect the top-three standing");
    expect(result.overview_card.text).not.toContain("improve the position");
    expect(result.overview_card.highlights).toContain("protect the top-three standing");
  });

  it("keeps leader language at position one", () => {
    const result = sanitizeRankingLlmAnalysis(
      analysisWithOverview("Protect the lead with weekly Google posts."),
      { searchPosition: 1 },
    );

    expect(result.overview_card.text).toContain("Protect the lead");
  });

  it("normalizes lead language below the top three", () => {
    const result = sanitizeRankingLlmAnalysis(
      analysisWithOverview("Protect the lead with weekly Google posts."),
      { searchPosition: 4 },
    );

    expect(result.overview_card.text).toContain("improve the position");
    expect(result.overview_card.text).not.toContain("protect the top-three standing");
  });
});
