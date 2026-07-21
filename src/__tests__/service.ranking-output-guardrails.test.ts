import { describe, expect, it } from "vitest";

import {
  sanitizeRankingLlmAnalysis,
  HONEST_POST_ACTION,
  HONEST_WEEKLY_POST_ACTION,
} from "../controllers/practice-ranking/feature-services/service.ranking-output-guardrails";
import { SYSTEM_PROMPT } from "../controllers/practice-ranking/feature-services/service.ranking-llm";
import { substitutePromptPlaceholders } from "../agents/service.prompt-substituter";

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

describe("ranking output guardrail generic-homework + vocabulary", () => {
  type Rec = {
    title?: string;
    description?: string;
    expected_outcome?: string;
    generic?: boolean;
  };
  const recAt = (result: { top_recommendations: unknown[] }, i = 0): Rec =>
    result.top_recommendations[i] as Rec;

  const bannedTitles = [
    "Get more reviews",
    "Post more often on Google",
    "Add more photos to your profile",
  ];

  it.each(bannedTitles)(
    "drops the banned generic-homework recommendation and falls back to safe copy: %s",
    (title) => {
      const result = sanitizeRankingLlmAnalysis(
        { top_recommendations: [{ title, description: title }], gaps: [] },
        { orgType: "health" },
      );
      expect(result.top_recommendations).toHaveLength(1);
      expect(recAt(result).title).not.toBe(title);
      expect(recAt(result).generic).toBe(true);
    },
  );

  it("drops the incident card (ask-for-reviews-to-protect-rank, names no competitor)", () => {
    const result = sanitizeRankingLlmAnalysis(
      {
        top_recommendations: [
          {
            title: "Protect your #1 ranking",
            description:
              "Ask every happy patient for a review this week to protect your #1 local ranking. With only 77 reviews vs 400-500+ for nearby competitors, growing your review count is the fastest way.",
          },
        ],
        gaps: [],
      },
      {
        orgType: "health",
        searchPosition: 1,
        competitorNames: ["Bright Smiles Endodontics"],
      },
    );
    // Numbers present, but no NAMED competitor -> generic homework -> honest fallback.
    expect(recAt(result).generic).toBe(true);
    expect(recAt(result).title).not.toContain("Protect your #1 ranking");
  });

  it("keeps a specific recommendation that names an actual competitor", () => {
    const specific = {
      title: "Close the photo gap with Bright Smiles Endodontics",
      description:
        "Bright Smiles Endodontics shows 48 photos to your 6. Add more photos of the office this week to close the gap.",
    };
    const result = sanitizeRankingLlmAnalysis(
      { top_recommendations: [specific], gaps: [] },
      { orgType: "health", competitorNames: ["Bright Smiles Endodontics"] },
    );
    // Contains "add more photos" but names a real competitor -> kept, not dropped.
    expect(recAt(result).title).toContain("Bright Smiles");
    expect(recAt(result).generic).not.toBe(true);
  });

  it("renders the fallback in business vocabulary for a generic org", () => {
    const result = sanitizeRankingLlmAnalysis(
      { top_recommendations: [], gaps: [] },
      { orgType: "generic" },
    );
    const text = `${recAt(result).title} ${recAt(result).description} ${recAt(result).expected_outcome}`;
    expect(text).toContain("customer");
    expect(text).not.toMatch(/patient|\bpractice\b/i);
    expect(text).not.toContain("{{");
  });

  it("renders the fallback in health vocabulary by default (byte-identical)", () => {
    const result = sanitizeRankingLlmAnalysis(
      { top_recommendations: [], gaps: [] },
      { orgType: "health" },
    );
    const text = `${recAt(result).title} ${recAt(result).description} ${recAt(result).expected_outcome}`;
    expect(text).toContain("patient");
    expect(text).not.toContain("{{");
  });
});

describe("ranking output guardrail Google post honesty", () => {
  const unsupportedPostRankClaims = [
    "Publish weekly Google posts to stay visible in local search.",
    "Use weekly Google posts so you remain in the top three.",
    "Weekly Google posts support higher rankings.",
    "Weekly Google posts drive higher rankings.",
    "Posting regularly pushes you up the map pack.",
    "We recommend posting weekly to keep your top-three standing.",
    "Posting weekly helps you show higher in Google Maps.",
  ];

  it.each(unsupportedPostRankClaims)(
    "rewrites a paraphrased post-to-rank relationship: %s",
    (claim) => {
      const result = sanitizeRankingLlmAnalysis(
        {
          top_recommendations: [],
          gaps: [],
          overview_card: { text: claim, highlights: [claim] },
        },
        { searchPosition: 3 },
      );

      expect(result.overview_card.text).toContain("profile current");
      expect(result.overview_card.text).not.toBe(claim);
      expect(result.overview_card.highlights[0]).toContain("profile current");
    },
  );

  it.each([
    "Review growth can improve rank, while Google posts reassure patients.",
    "Reviews improve local search visibility. Google posts reassure patients.",
    "Google posts reassure patients; steady review growth improves rank.",
    "Google posts reassure patients, while reviews improve rank.",
    "Google posts reassure patients, and reviews improve rank.",
    "Google posts help patients and review growth improves rank.",
    "Google posts reassure patients and steady review growth improves ranking.",
  ])("preserves independent post and rank statements byte-for-byte: %s", (copy) => {
    const result = sanitizeRankingLlmAnalysis(
      {
        top_recommendations: [],
        gaps: [],
        overview_card: { text: copy, highlights: [copy] },
      },
      { searchPosition: 3 },
    );

    expect(result.overview_card.text).toBe(copy);
    expect(result.overview_card.highlights).toEqual([copy]);
  });

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

describe("prompt-token resolution completeness", () => {
  it.each(["health", "generic"] as const)(
    "SYSTEM_PROMPT resolves all {{tokens}} for orgType '%s'",
    (orgType) => {
      const resolved = substitutePromptPlaceholders(SYSTEM_PROMPT, orgType);
      expect(resolved).not.toContain("{{");
    },
  );
});

describe("HONEST_POST_ACTION vocabulary substitution", () => {
  it("resolves to business vocabulary for a generic org (no 'patients')", () => {
    const resolved = substitutePromptPlaceholders(HONEST_POST_ACTION, "generic");
    expect(resolved).not.toContain("patients");
    expect(resolved).not.toContain("{{");
    expect(resolved).toContain("customers");
  });

  it("resolves to health vocabulary for a health org", () => {
    const resolvedAction = substitutePromptPlaceholders(HONEST_POST_ACTION, "health");
    const resolvedWeekly = substitutePromptPlaceholders(HONEST_WEEKLY_POST_ACTION, "health");
    expect(resolvedAction).toContain("patients");
    expect(resolvedWeekly).toContain("patients");
    expect(resolvedAction).not.toContain("{{");
    expect(resolvedWeekly).not.toContain("{{");
  });

  it("rewrites post-to-rank claims with generic vocabulary when orgType is generic", () => {
    const result = sanitizeRankingLlmAnalysis(
      {
        top_recommendations: [],
        gaps: [],
        overview_card: {
          text: "Publish weekly Google posts to stay visible in local search.",
          highlights: [],
        },
      },
      { searchPosition: 3, orgType: "generic" },
    );
    expect(result.overview_card.text).toContain("profile current");
    expect(result.overview_card.text).toContain("customers");
    expect(result.overview_card.text).not.toContain("patients");
    expect(result.overview_card.text).not.toContain("{{");
  });
});
