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

/**
 * NOTE (PR #155 review, finding 2): three tests in this suite used to assert
 * that a POST recommendation must promise a rank outcome — "protect the lead"
 * at #1, "move closer to the top three" at #4, "break into the top 20" outside
 * it. That is the claim the honesty work removes (posts convert, they do not
 * rank — Sterling Sky / lever-evidence-map), and the suite was holding it in
 * place: any honest rewrite of the copy turned this file red, so the copy kept
 * getting reverted to the promise. The rank STATEMENTS below are facts and stay
 * asserted; the post→rank OUTCOMES are now asserted absent.
 */
describe("ranking overview search-position bands", () => {
  it("states the #1 rank fact but promises no rank outcome from posting", () => {
    const result = makeRankingResult({ position: 1, status: "ok" });

    expect(getStructuredOverviewInsight(result, 80)).toContain("dominant #1");

    const action = getOverviewRecommendedAction(result);
    expect(action).toContain("keep your profile active");
    expect(action).not.toContain("protect the lead");
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

  it("states the #4 rank fact without promising posting moves it", () => {
    const result = makeRankingResult({ position: 4, status: "ok" });

    const insight = getStructuredOverviewInsight(result, 80);
    expect(insight).toContain("currently #4");
    expect(insight).toContain("keep your profile active");
    expect(insight).not.toContain("move closer to the top three");
    expect(insight).not.toContain("break into the top 20");
  });

  it("preserves a measured not-in-top-20 fact without promising posting fixes it", () => {
    const result = makeRankingResult({
      position: null,
      status: "not_in_top_20",
    });

    const insight = getStructuredOverviewInsight(result, 80);
    expect(insight).toContain("was not found in the top 20");
    expect(insight).toContain("keep your profile active");
    expect(insight).not.toContain("break into the top 20");
    expect(insight).not.toContain("position pending");
  });

  it("gives the SAME post outcome at every rank band — the band must not leak into the promise", () => {
    const outcomes = [
      makeRankingResult({ position: 1, status: "ok" }),
      makeRankingResult({ position: 2, status: "ok" }),
      makeRankingResult({ position: 4, status: "ok" }),
      makeRankingResult({ position: 15, status: "ok" }),
      makeRankingResult({ position: null, status: "not_in_top_20" }),
      makeRankingResult({ position: null, status: "bias_unavailable" }),
    ].map((result) => getOverviewRecommendedAction(result));

    expect(new Set(outcomes).size).toBe(1);
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
