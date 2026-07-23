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

/**
 * The stale-data guard — the Artful incident.
 *
 * A practice whose PMS feed stopped in January was shown "your practice is
 * healthy this month", because January's referral count still produced a real
 * `positive` tone and nothing checked its age. Old data is not a measurement of
 * now; it is the absence of one.
 *
 * The tones arrive here already downgraded by withFreshness, so these pin the
 * consequence: an `unknown` stage must drop out of `measured` and defuse BOTH
 * all-clear branches — the full one and the hedged "based on what Alloro can see".
 */
describe("buildHealthVerdict — stale data can never read as healthy", () => {
  it("cannot claim ANY all-clear when a stage went stale — not even the hedged one", () => {
    // The hole the falsifier found: downgrading to `unknown` kills the FULL
    // all-clear but not the hedged one, which fires precisely because fewer than
    // four stages were measured. Both are "healthy this month" to an owner.
    const verdict = buildHealthVerdict(
      { ...ALL_POSITIVE, memorable: "unknown" },
      "January 2026",
    );

    expect(verdict.text).not.toMatch(/healthy this month/i);
    expect(verdict.text).toContain("January 2026");
  });

  it("keeps the hedged all-clear for a stage that is simply unconnected, not stale", () => {
    // No staleNote = the stage never reported, which the hedge describes honestly.
    const verdict = buildHealthVerdict({ ...ALL_POSITIVE, memorable: "unknown" });
    expect(verdict.text).toMatch(/Based on what Alloro can see/i);
  });

  it("states the data's age instead of a verdict when EVERY stage is stale", () => {
    const verdict = buildHealthVerdict(
      {
        findable: "unknown",
        choosable: "unknown",
        bookable: "unknown",
        memorable: "unknown",
      },
      "January 2026",
    );

    expect(verdict.text).toContain("January 2026");
    expect(verdict.text).not.toMatch(/healthy/i);
    // "Connect more of your data" would be false here — the data WAS connected,
    // it stopped arriving. Sending this owner to the connect flow wastes their time.
    expect(verdict.text).not.toMatch(/Connect more of your data/i);
    expect(verdict.leakStage).toBeNull();
  });

  it("keeps the genuinely-unconnected copy for a client who never connected anything", () => {
    // The pinned pre-existing behaviour: no staleNote means no data ever arrived.
    const verdict = buildHealthVerdict({
      findable: "unknown",
      choosable: "unknown",
      bookable: "unknown",
      memorable: "unknown",
    });

    expect(verdict.text).toMatch(/Connect more of your data/i);
  });

  /**
   * FALSIFIER (shipped as an executable monitor).
   *
   * This fix is wrong if EITHER "healthy this month" string can render while a
   * client's latest data is older than STALE_AFTER_DAYS. The assertion below is
   * that sentence, in code: no combination of tones containing a stale-downgraded
   * stage may produce an all-clear.
   */
  it("FALSIFIER: no health claim survives a stale stage, in any combination", () => {
    const TONES = ["positive", "warn", "critical", "neutral"] as const;
    // Hunt the CLAIM, not one sentence. The first version of this regex was
    // /healthy this month/i, which let "Healthy overall, with one gap Alloro
    // caught: your Findable stage." through — and since rankTone marks #4+ as
    // warn, that was the COMMON case, not a corner one. An owner reads either
    // word as "you're fine".
    const ALL_CLEAR = /healthy/i;

    for (const a of TONES) {
      for (const b of TONES) {
        for (const c of TONES) {
          // memorable is the stale-vector stage: gated to unknown by withFreshness.
          const verdict = buildHealthVerdict(
            { findable: a, choosable: b, bookable: c, memorable: "unknown" },
            "January 2026",
          );
          // The hedged all-clear is still a "healthy this month" claim, and it is
          // exactly what an owner reads as reassurance. Neither form may appear.
          expect(
            ALL_CLEAR.test(verdict.text),
            `stale stage produced an all-clear from ${a}/${b}/${c}: "${verdict.text}"`,
          ).toBe(false);
        }
      }
    }
  });
});

describe("buildHealthVerdict — a named gap still admits the stale data", () => {
  it("does not say 'Healthy overall' when a stage is stale", () => {
    // The adversary's case, and the likeliest real one: rank #4+ is `warn`, so
    // most practices land here. Before the fix this read "Healthy overall, with
    // one gap..." while the PMS feed had been dead for six months.
    const verdict = buildHealthVerdict(
      { ...ALL_POSITIVE, findable: "warn", memorable: "unknown" },
      "January 2026",
    );

    expect(verdict.text).not.toMatch(/healthy/i);
    expect(verdict.text).toContain("Findable");
    expect(verdict.text).toContain("January 2026");
    expect(verdict.leakStage).toBe("findable");
  });

  it("keeps 'Healthy overall' when the data is current", () => {
    const verdict = buildHealthVerdict({ ...ALL_POSITIVE, findable: "warn" });
    expect(verdict.text).toMatch(/Healthy overall/i);
  });

  it("drops the 'this month' freshness claim from a critical verdict when stale", () => {
    const verdict = buildHealthVerdict(
      { ...ALL_POSITIVE, choosable: "critical", memorable: "unknown" },
      "January 2026",
    );
    expect(verdict.text).not.toMatch(/this month/i);
    expect(verdict.text).toContain("January 2026");
    expect(verdict.leakStage).toBe("choosable");
  });
});
