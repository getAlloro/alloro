import { describe, expect, it } from "vitest";

import type { RankingResult } from "./rankingsDashboard.types";
import {
  getOverviewRecommendedAction,
  getStructuredOverviewInsight,
} from "./rankingsDashboard.utils";

type RankingFixtureOptions = {
  position: number | null;
  status: RankingResult["searchStatus"];
  recommendation?: "post" | "review";
};

function makeRankingResult({
  position,
  status,
  recommendation = "post",
}: RankingFixtureOptions): RankingResult {
  return {
    gbpLocationName: "Test Practice",
    searchPosition: position,
    searchStatus: status,
    llmAnalysis: {
      gaps: [],
      drivers: [],
      render_text: "",
      top_recommendations: [
        {
          priority: 1,
          title: recommendation,
          description: recommendation,
        },
      ],
      verdict: "stable",
      confidence: 1,
    },
  } as RankingResult;
}

describe("ranking overview search-position bands", () => {
  it("protects the lead at position one", () => {
    const result = makeRankingResult({ position: 1, status: "ok" });

    expect(getStructuredOverviewInsight(result, 80)).toContain("dominant #1");
    expect(getOverviewRecommendedAction(result)).toContain("protect the lead");
  });

  it("protects top-three standing for a review recommendation", () => {
    const result = makeRankingResult({
      position: 2,
      status: "ok",
      recommendation: "review",
    });

    const action = getOverviewRecommendedAction(result);
    expect(action).toContain("strengthen your top-three standing");
    expect(action).not.toContain("close the review gap");
  });

  it("moves a measured position four through twenty toward the top three", () => {
    const result = makeRankingResult({ position: 4, status: "ok" });

    const insight = getStructuredOverviewInsight(result, 80);
    expect(insight).toContain("currently #4");
    expect(insight).toContain("move closer to the top three");
    expect(insight).not.toContain("break into the top 20");
  });

  it("preserves a measured not-in-top-20 outcome", () => {
    const result = makeRankingResult({
      position: null,
      status: "not_in_top_20",
    });

    const insight = getStructuredOverviewInsight(result, 80);
    expect(insight).toContain("was not found in the top 20");
    expect(insight).toContain("break into the top 20");
    expect(insight).not.toContain("position pending");
  });

  it.each(["bias_unavailable", "api_error"] as const)(
    "uses pending language for %s",
    (status) => {
      const result = makeRankingResult({ position: null, status });

      const insight = getStructuredOverviewInsight(result, 80);
      expect(insight).toContain("position pending this month");
      expect(insight).not.toContain("not found in the top 20");
    },
  );
});
