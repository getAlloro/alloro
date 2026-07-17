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
      analysisWithOverview("Protect the lead with steady review growth."),
      { searchPosition: position },
    );

    expect(result.overview_card.text).toContain("protect the top-three standing");
    expect(result.overview_card.text).not.toContain("improve the position");
    expect(result.overview_card.highlights).toContain("protect the top-three standing");
  });

  it("keeps leader language at position one", () => {
    const result = sanitizeRankingLlmAnalysis(
      analysisWithOverview("Protect the lead with steady review growth."),
      { searchPosition: 1 },
    );

    expect(result.overview_card.text).toContain("Protect the lead");
  });

  it("normalizes lead language below the top three", () => {
    const result = sanitizeRankingLlmAnalysis(
      analysisWithOverview("Protect the lead with steady review growth."),
      { searchPosition: 4 },
    );

    expect(result.overview_card.text).toContain("improve the position");
    expect(result.overview_card.text).not.toContain("protect the top-three standing");
  });
});

describe("ranking output guardrail Google post honesty", () => {
  it("rewrites post-to-rank claims in every top recommendation narrative field", () => {
    const result = sanitizeRankingLlmAnalysis(
      {
        top_recommendations: [
          {
            title: "Protect your top-three standing with weekly Google posts",
            description:
              "Publish a Google post weekly to protect your top-three standing.",
            timeline:
              "Use weekly Google posts to improve the local search position.",
            expected_outcome:
              "A protected top-three ranking from weekly Google posts.",
          },
        ],
        gaps: [],
      },
      { searchPosition: 3 },
    );

    const recommendation = result.top_recommendations[0];
    for (const value of [
      recommendation.title,
      recommendation.description,
      recommendation.timeline,
      recommendation.expected_outcome,
    ]) {
      expect(value).toContain("profile current");
      expect(value).not.toMatch(
        /\b(?:protect|improve|widen|boost|lift)\w*\b.*\b(?:rank|position|standing|lead|top[- ]three)\b/i,
      );
    }
  });

  it("preserves a legitimate rank fact while rewriting overview post outcomes", () => {
    const postAction =
      "Publish a Google post weekly to protect your top-three standing.";
    const result = sanitizeRankingLlmAnalysis(
      {
        top_recommendations: [],
        gaps: [],
        overview_card: {
          text: `One Endodontics is ranked #3 in Local Search with an 82/100 Alloro Health Score. Recommended Action: ${postAction}`,
          highlights: ["ranked #3 in Local Search", postAction],
        },
      },
      { searchPosition: 3, visibleScore: 82 },
    );

    expect(result.overview_card.text).toContain("ranked #3 in Local Search");
    expect(result.overview_card.text).toContain("profile current");
    expect(result.overview_card.text).not.toContain(
      "protect your top-three standing",
    );
    expect(result.overview_card.highlights).toContain(
      "ranked #3 in Local Search",
    );
    expect(result.overview_card.highlights.join(" ")).toContain(
      "profile current",
    );
  });
});
