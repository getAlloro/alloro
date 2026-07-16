import { describe, expect, it } from "vitest";

import { rankTone } from "./statusRules";
import {
  buildHealthVerdict,
  DOMAIN_TO_STAGE,
  resolveActionStage,
  type StageTones,
} from "./verdict";

/**
 * PR #155 review, finding 1 — the headline bug:
 *
 *   "buildHealthVerdict() excludes that known weak measurement and can say the
 *    practice is healthy while rank is 10."
 *
 * The verdict must never call a practice healthy over a measurement it can see
 * is weak, and must never let a MISSING measurement stand in for a good one.
 */

const ALL_POSITIVE: StageTones = {
  findable: "positive",
  choosable: "positive",
  bookable: "positive",
  memorable: "positive",
};

describe("buildHealthVerdict — never call a measured-weak practice healthy", () => {
  it("names the Findable gap when rank is 10 — the exact reviewed case, wired through rankTone", () => {
    const verdict = buildHealthVerdict({
      ...ALL_POSITIVE,
      findable: rankTone(10),
    });

    // The bug was an UNQUALIFIED all-clear that never mentioned the weak rank.
    // The verdict may still read "healthy overall" — three stages are — but it
    // must name the gap it can see, not swallow it.
    expect(verdict.leakStage).toBe("findable");
    expect(verdict.text).toContain("Findable");
    expect(verdict.text).toMatch(/one gap/i);
    expect(verdict.text).not.toMatch(/Nothing slipped/i);
    expect(verdict.text).not.toBe(
      "Based on what Alloro can see, your practice is healthy this month.",
    );
  });

  it("names the Findable gap at rank 4 too (first measured-weak rank)", () => {
    const verdict = buildHealthVerdict({
      ...ALL_POSITIVE,
      findable: rankTone(4),
    });

    expect(verdict.leakStage).toBe("findable");
    expect(verdict.text).toContain("Findable");
    expect(verdict.text).toMatch(/one gap/i);
  });

  it("DOES allow the healthy read at rank 1 and rank 3", () => {
    for (const position of [1, 3]) {
      const verdict = buildHealthVerdict({
        ...ALL_POSITIVE,
        findable: rankTone(position),
      });
      expect(verdict.text).toMatch(/healthy/i);
      expect(verdict.leakStage).toBeNull();
    }
  });

  it("scopes the healthy claim when rank is UNKNOWN — never a full all-clear", () => {
    const verdict = buildHealthVerdict({
      ...ALL_POSITIVE,
      findable: rankTone(null),
    });

    // Unknown is still allowed to read healthy, but ONLY scoped to what we see.
    expect(verdict.text).toMatch(/what Alloro can see/i);
    expect(verdict.text).not.toMatch(/Nothing slipped/i);
    expect(verdict.leakStage).toBeNull();
  });

  it("gives the full all-clear only when all four stages are actually measured", () => {
    const verdict = buildHealthVerdict(ALL_POSITIVE);
    expect(verdict.text).toMatch(/Nothing slipped/i);
    expect(verdict.leakStage).toBeNull();
  });

  it("says connect-your-data when nothing is measured — never a fabricated all-clear", () => {
    const verdict = buildHealthVerdict({
      findable: "unknown",
      choosable: "unknown",
      bookable: "unknown",
      memorable: "unknown",
    });

    expect(verdict.text).toMatch(/Connect more of your data/i);
    expect(verdict.text).not.toMatch(/healthy/i);
    expect(verdict.leakStage).toBeNull();
  });

  it("critical outranks a warn gap", () => {
    const verdict = buildHealthVerdict({
      findable: "warn",
      choosable: "critical",
      bookable: "positive",
      memorable: "positive",
    });

    expect(verdict.leakStage).toBe("choosable");
    expect(verdict.text).toMatch(/slipping/i);
  });

  it("counts a measured-flat neutral as measured (it must not read as unknown)", () => {
    const verdict = buildHealthVerdict({ ...ALL_POSITIVE, memorable: "neutral" });

    // All four are measured, so this is the full all-clear, not the scoped one.
    expect(verdict.text).toMatch(/Nothing slipped/i);
    expect(verdict.leakStage).toBeNull();
  });
});

describe("buildHealthVerdict — never promise a move we do not have", () => {
  it("does not promise a move for a Findable gap (posts do not rank)", () => {
    const verdict = buildHealthVerdict({ ...ALL_POSITIVE, findable: rankTone(10) });
    expect(verdict.text).not.toMatch(/Here's the move/i);
  });

  it("does promise a move for a Choosable gap (reviews are a real lever)", () => {
    const verdict = buildHealthVerdict({ ...ALL_POSITIVE, choosable: "warn" });
    expect(verdict.text).toMatch(/Here's the move/i);
  });
});

/**
 * PR #155 review, finding 3:
 *
 *   "OneThingBanner.tsx:72 trusts the optional LLM-authored `action.stage`
 *    before DOMAIN_TO_STAGE. A `domain: "gbp", stage: "findable"` card bypasses
 *    the rule this PR added."
 *
 * Derived state wins over authored state. Always.
 */
describe("resolveActionStage — derived state beats LLM-authored state", () => {
  it("ignores an authored stage that contradicts the domain (Dave's exact card)", () => {
    expect(resolveActionStage({ domain: "gbp", stage: "findable" })).toBe(
      "choosable",
    );
  });

  it("ignores an authored stage for every known domain", () => {
    for (const [domain, derived] of Object.entries(DOMAIN_TO_STAGE)) {
      expect(resolveActionStage({ domain, stage: "findable" })).toBe(derived);
      expect(resolveActionStage({ domain, stage: "memorable" })).toBe(derived);
    }
  });

  it("derives the stage when none is authored", () => {
    expect(resolveActionStage({ domain: "gbp" })).toBe("choosable");
    expect(resolveActionStage({ domain: "ranking" })).toBe("findable");
    expect(resolveActionStage({ domain: "review" })).toBe("choosable");
  });

  it("falls back to a VALID authored stage only when the domain is unmapped", () => {
    expect(resolveActionStage({ domain: "brand-new-domain", stage: "bookable" })).toBe(
      "bookable",
    );
  });

  it("returns null for an unmapped domain with a garbage authored stage", () => {
    expect(
      resolveActionStage({ domain: "brand-new-domain", stage: "not-a-stage" }),
    ).toBeNull();
    expect(resolveActionStage({ domain: "brand-new-domain" })).toBeNull();
  });

  it("keeps ranking as the ONLY domain that maps to Findable", () => {
    const findable = Object.entries(DOMAIN_TO_STAGE)
      .filter(([, stage]) => stage === "findable")
      .map(([domain]) => domain);
    expect(findable).toEqual(["ranking"]);
  });
});
