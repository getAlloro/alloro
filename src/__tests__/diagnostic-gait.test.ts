/**
 * The diagnostic gait — brick 1 of the diagnostic coordination layer.
 *
 * Each test pins one move of the gait described in the business-doctor strategy
 * reference (held outside this repository). Two things this suite exists to
 * prevent, both found by adversarial review of an earlier version:
 *
 *   1. THE INVERTED VERDICT — excluding the worst step must never promote a
 *      healthier step to "your largest opportunity." The earlier code did, and
 *      the earlier version of THIS FILE asserted the wrong answer as correct.
 *      That is what a complicit test looks like; the cases below are written to
 *      fail if it ever comes back.
 *   2. FABRICATED CORROBORATION — a no-data sentinel (GSC position 0) must not
 *      be read as a first-place ranking.
 *
 * The interaction with `buildBookableCandidate` is tested here too, because that
 * is where a wrong verdict turns into a false sentence in the owner's payload.
 */

import { describe, it, expect } from "vitest";
import {
  diagnoseFunnel,
  MIN_DIAGNOSABLE_DENOMINATOR,
} from "../controllers/patient-journey/feature-utils/util.diagnostic-gait";
import {
  buildConversions,
  buildHeadline,
  buildBookableCandidate,
} from "../controllers/patient-journey/feature-utils/funnelMath";
import type {
  PatientJourneyStage,
  PatientJourneyStageKey,
} from "../controllers/patient-journey/feature-utils/types";

function stage(
  key: PatientJourneyStageKey,
  value: number | null,
  metadata?: Record<string, unknown>,
): PatientJourneyStage {
  return {
    key,
    label:
      key === "impressions"
        ? "Google Visibility"
        : key === "visits"
          ? "Website Visitors"
          : "Website Leads",
    metaLabel: key,
    value,
    available: value !== null,
    source: "test",
    asOf: null,
    shared: true,
    ...(metadata ? { metadata } : {}),
  };
}

/** impressions → visits → leads, the live monitored funnel. */
function funnel(
  impressions: number | null,
  visits: number | null,
  leads: number | null,
  metadata?: {
    impressions?: Record<string, unknown>;
    visits?: Record<string, unknown>;
  },
) {
  return [
    stage("impressions", impressions, metadata?.impressions),
    stage("visits", visits, metadata?.visits),
    stage("leads", leads),
  ];
}

/** Healthy organic signal: queries do rank on page one. */
const RANKING_WELL = { gsc: { position: 4.2, ctr: 0.04, top10QueryCount: 6 } };
/** Nothing reaches the first page. */
const RANKING_PAGE_TWO = {
  gsc: { position: 18.3, ctr: 0.01, top10QueryCount: 0 },
};

describe("Move 4 — one binding constraint, chosen as the WORST step", () => {
  it("names the worst step when it is diagnosable", () => {
    const stages = funnel(8000, 4000, 200, { impressions: RANKING_WELL }); // 50% then 5%
    const { conversions, leakStageKey } = buildConversions(stages);
    const diagnosis = diagnoseFunnel(stages, conversions);

    expect(leakStageKey).toBe("leads");
    expect(diagnosis.basis).not.toBe("abstained");
    expect(conversions.filter((c) => c.isLeak)).toHaveLength(1);
  });

  it("NEVER promotes a healthy step when the worst one is excluded", () => {
    // The regression an adversary caught: 1% click-through with nothing on page
    // one (the real catastrophe, root = ranking) plus a superb 50% visit-to-lead
    // step. Promoting the 50% step would tell the owner their booking step is
    // "where you're losing the most" while 7,920 people are lost upstream.
    const stages = funnel(8000, 80, 40, { impressions: RANKING_PAGE_TWO });
    const { conversions, leakStageKey } = buildConversions(stages);
    const diagnosis = diagnoseFunnel(stages, conversions);

    expect(leakStageKey).toBeNull();
    expect(diagnosis.leakStageKey).not.toBe("leads");
    expect(diagnosis.basis).toBe("abstained");
    expect(diagnosis.abstainedBecause).toBe("expected-for-position");
    expect(conversions.some((c) => c.isLeak)).toBe(false);
  });

  it("does not emit a bookable card off a promoted healthy step", () => {
    // The card is where a wrong verdict becomes a false owner-facing sentence.
    const stages = funnel(8000, 80, 40, { impressions: RANKING_PAGE_TWO });
    const { conversions, leakStageKey } = buildConversions(stages);

    expect(buildBookableCandidate(stages, leakStageKey)).toBeNull();
    expect(conversions.some((c) => c.isLeak)).toBe(false);
  });

  it("abstains rather than naming a survivor when the worst step is too small", () => {
    // Worst step is 12.5% on 8 visits — unmeasurable. The healthier 40%
    // click-through step must not inherit the verdict.
    const stages = funnel(20, 8, 1, { impressions: RANKING_WELL });
    const { conversions, leakStageKey } = buildConversions(stages);
    const diagnosis = diagnoseFunnel(stages, conversions);

    const conversionStep = diagnosis.assessments[1];
    expect(conversionStep.denominator).toBeLessThan(
      MIN_DIAGNOSABLE_DENOMINATOR,
    );
    expect(conversionStep.excludedBy).toBe("insufficient-sample");
    expect(leakStageKey).toBeNull();
  });
});

describe("Move 3 — feature-vs-bug, judged per query not on an average", () => {
  it("excludes the click-through step when no top term reaches the first page", () => {
    const stages = funnel(8000, 80, 4, { impressions: RANKING_PAGE_TWO });
    const { conversions } = buildConversions(stages);
    const diagnosis = diagnoseFunnel(stages, conversions);

    expect(diagnosis.assessments[0].eligible).toBe(false);
    expect(diagnosis.assessments[0].excludedBy).toBe("expected-for-position");
  });

  it("keeps the click-through step diagnosable when terms DO rank on page one, even if the average position is past ten", () => {
    // The exact case an impressions-weighted average gets wrong: money terms at
    // #2 plus one high-impression generic term deep on page three.
    const stages = funnel(8000, 80, 40, {
      impressions: { gsc: { position: 14.7, ctr: 0.01, top10QueryCount: 5 } },
    });
    const { conversions, leakStageKey } = buildConversions(stages);
    const diagnosis = diagnoseFunnel(stages, conversions);

    expect(diagnosis.assessments[0].eligible).toBe(true);
    expect(leakStageKey).toBe("visits");
    expect(diagnosis.basis).toBe("corroborated");
    expect(diagnosis.assessments[0].corroboration.join(" ")).toMatch(
      /rank in the first ten results/i,
    );
  });
});

describe("Move 1 — the constellation is read, and never fabricated", () => {
  it("treats GSC position 0 as no data, not as a first-place ranking", () => {
    // summarizeGsc returns position 0 / ctr 0 when there are no organic
    // impressions. A maps-only account still carries a large stage value.
    const stages = funnel(8000, 80, 40, {
      impressions: { gsc: { position: 0, ctr: 0, top10QueryCount: 0 } },
    });
    const { conversions } = buildConversions(stages);
    const diagnosis = diagnoseFunnel(stages, conversions);

    const ctrStep = diagnosis.assessments[0];
    // Not excluded on a sentinel, and above all not corroborated by one.
    expect(ctrStep.excludedBy).not.toBe("expected-for-position");
    expect(ctrStep.corroboration.join(" ")).not.toMatch(/first/i);
    expect(ctrStep.corroboration).toEqual([]);
  });

  it("marks a selection uncorroborated when no independent signal exists", () => {
    const stages = funnel(8000, 4000, 200); // no metadata at all
    const { conversions } = buildConversions(stages);
    const diagnosis = diagnoseFunnel(stages, conversions);

    expect(diagnosis.basis).toBe("uncorroborated");
    expect(diagnosis.assessments[1].corroboration).toEqual([]);
  });

  it("records the visit-side signals it used without letting them exclude", () => {
    // Single-page sessions are reported, never used to suppress the step —
    // Alloro's own bookable advice produces exactly this shape.
    const stages = funnel(8000, 4000, 200, {
      impressions: RANKING_WELL,
      visits: { rybbit: { pagesPerSession: 1.0, bounceRate: 0.92 } },
    });
    const { conversions, leakStageKey } = buildConversions(stages);
    const diagnosis = diagnoseFunnel(stages, conversions);

    expect(diagnosis.assessments[1].eligible).toBe(true);
    expect(leakStageKey).toBe("leads");
    expect(diagnosis.assessments[1].corroboration.join(" ")).toMatch(
      /1\.00 pages per session/,
    );
    expect(diagnosis.assessments[1].corroboration.join(" ")).toMatch(
      /bounce rate is 92\.0%/,
    );
  });
});

describe("Move 5 — refuse rather than invent", () => {
  it("abstains with no-data when nothing is connected, preserving the original copy", () => {
    const stages = funnel(null, null, null);
    const { conversions, leakStageKey } = buildConversions(stages);
    const diagnosis = diagnoseFunnel(stages, conversions);
    const headline = buildHeadline(stages, conversions, leakStageKey, diagnosis);

    expect(diagnosis.abstainedBecause).toBe("no-data");
    expect(headline.text).toBe(
      "Connect more of your data to see which growth gate needs attention.",
    );
    expect(headline.leakStageKey).toBeNull();
  });

  it("explains a ranking-rooted abstention by naming rank, not page titles", () => {
    const stages = funnel(8000, 80, 40, { impressions: RANKING_PAGE_TWO });
    const { conversions, leakStageKey } = buildConversions(stages);
    const diagnosis = diagnoseFunnel(stages, conversions);
    const headline = buildHeadline(stages, conversions, leakStageKey, diagnosis);

    expect(headline.text).toMatch(/first page of Google/i);
    expect(headline.text).toMatch(/where you rank/i);
    // Must not claim an opportunity, and must not blame the metadata.
    expect(headline.text).not.toMatch(/largest opportunity/i);
  });

  it("explains a small-sample abstention as a sample problem", () => {
    const stages = funnel(20, 8, 1, { impressions: RANKING_WELL });
    const { conversions, leakStageKey } = buildConversions(stages);
    const diagnosis = diagnoseFunnel(stages, conversions);
    const headline = buildHeadline(stages, conversions, leakStageKey, diagnosis);

    expect(headline.text).toMatch(/too few people/i);
    expect(headline.text).not.toMatch(/largest opportunity/i);
  });

  it("still names a real opportunity when one is genuinely supported", () => {
    const stages = funnel(8000, 4000, 200, { impressions: RANKING_WELL });
    const { conversions, leakStageKey } = buildConversions(stages);
    const diagnosis = diagnoseFunnel(stages, conversions);
    const headline = buildHeadline(stages, conversions, leakStageKey, diagnosis);

    expect(headline.text).toMatch(/largest opportunity/i);
    expect(headline.text).toMatch(/Website Visitors.*Website Leads/);
    expect(headline.leakStageKey).toBe("leads");
  });
});
