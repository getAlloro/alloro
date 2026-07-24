/**
 * Unit tests — `diagnoseFunnelMovement` (the doctor's "why").
 *
 * Proves what the type-checker cannot: (1) an org with no data returns "not
 * measured" — every term `null`, never 0 or an invented figure; (2) the
 * diagnosis correctly names the driver on the real Artful pattern (impressions
 * FALL, CRO rises, leads go up -> driver is CRO); (3) a partial/absent window
 * degrades honestly; and (4) the three ways the arithmetic can be tricked into a
 * false-but-plausible driver are all refused — unequal windows, an impossible
 * CTR, and a near-tie. Pure arithmetic — no DB, no mocks.
 */

import { describe, it, expect } from "vitest";
import {
  diagnoseFunnelMovement,
  type FunnelGateTriple,
} from "../controllers/patient-journey/feature-utils/funnelMovementDiagnosis";

/** Both windows are 28 days unless a test is specifically about window length. */
const SPAN = 28;

const EMPTY: FunnelGateTriple = {
  impressions: null,
  visits: null,
  leads: null,
  spanDays: SPAN,
};

/** Pull one term's row out of the result for assertions. */
const term = (
  d: ReturnType<typeof diagnoseFunnelMovement>,
  t: "impressions" | "CTR" | "CRO"
) => d.terms.find((row) => row.term === t)!;

describe("diagnoseFunnelMovement", () => {
  it("(a) an org with no data returns 'not measured', never 0 or invented", () => {
    const d = diagnoseFunnelMovement(EMPTY, EMPTY);

    expect(d.diagnosable).toBe(false);
    expect(d.outcome).toBe("undiagnosable");
    expect(d.primaryDriver).toBeNull();
    expect(d.leadsPre).toBeNull();
    expect(d.leadsPost).toBeNull();
    expect(d.leadsChange).toBeNull();
    expect(d.leadsChangeFactor).toBeNull();
    // Every term's pre/post/contribution is null — no 0 standing in for absent.
    for (const t of ["impressions", "CTR", "CRO"] as const) {
      expect(term(d, t).pre).toBeNull();
      expect(term(d, t).post).toBeNull();
      expect(term(d, t).logContribution).toBeNull();
    }
    // Nothing in the result is the number 0.
    expect(JSON.stringify(d)).not.toContain(":0");
    expect(d.reason).toMatch(/not measured/);
  });

  it("(b) names CRO when impressions fall but conversion rises and leads go up (Artful)", () => {
    // Real org-8 pattern: leads 6 -> 12 while impressions FELL 3418 -> 2856.
    // visits chosen so CRO (leads/visits) is the dominant riser.
    const pre: FunnelGateTriple = {
      impressions: 3418,
      visits: 461,
      leads: 6,
      spanDays: SPAN,
    };
    const post: FunnelGateTriple = {
      impressions: 2856,
      visits: 428,
      leads: 12,
      spanDays: SPAN,
    };

    const d = diagnoseFunnelMovement(pre, post);

    expect(d.diagnosable).toBe(true);
    expect(d.outcome).toBe("driver");
    expect(d.primaryDriver).toBe("CRO");
    expect(d.leadsChange).toBe(6);
    expect(d.leadsChangeFactor).toBeCloseTo(2, 6);
    // Impressions genuinely fell — a negative contribution, not the driver.
    expect(term(d, "impressions").logContribution!).toBeLessThan(0);
    // CRO is the largest positive contribution.
    expect(term(d, "CRO").logContribution!).toBeGreaterThan(
      term(d, "CTR").logContribution!
    );
    // Log-additive identity holds exactly: contributions sum to ln(leadsPost/leadsPre).
    const sum =
      term(d, "impressions").logContribution! +
      term(d, "CTR").logContribution! +
      term(d, "CRO").logContribution!;
    expect(sum).toBeCloseTo(Math.log(12 / 6), 9);
  });

  it("(c) a partial/absent window degrades honestly (no driver, reason, numbers kept)", () => {
    // Post impressions not measured (coverage insufficient upstream) — the rest present.
    const pre: FunnelGateTriple = {
      impressions: 3418,
      visits: 461,
      leads: 6,
      spanDays: SPAN,
    };
    const post: FunnelGateTriple = {
      impressions: null,
      visits: 428,
      leads: 12,
      spanDays: SPAN,
    };

    const d = diagnoseFunnelMovement(pre, post);

    expect(d.diagnosable).toBe(false);
    expect(d.primaryDriver).toBeNull();
    expect(d.reason).toMatch(/post impressions not measured/);
    // The measured leads change is still reported — honesty keeps the real numbers.
    expect(d.leadsChange).toBe(6);
    expect(term(d, "impressions").post).toBeNull();
    // A term whose ratio can't be formed carries a null contribution, not a guess.
    expect(term(d, "impressions").logContribution).toBeNull();
  });

  it("names impressions when Get-Found volume drives the whole rise", () => {
    // Impressions triple; CTR and CRO essentially flat -> impressions is the driver.
    const pre: FunnelGateTriple = {
      impressions: 1000,
      visits: 100,
      leads: 5,
      spanDays: SPAN,
    };
    const post: FunnelGateTriple = {
      impressions: 3000,
      visits: 300,
      leads: 15,
      spanDays: SPAN,
    };

    const d = diagnoseFunnelMovement(pre, post);

    expect(d.diagnosable).toBe(true);
    expect(d.primaryDriver).toBe("impressions");
    expect(term(d, "CTR").logContribution!).toBeCloseTo(0, 9);
    expect(term(d, "CRO").logContribution!).toBeCloseTo(0, 9);
  });

  it("names no driver when leads did not change", () => {
    const pre: FunnelGateTriple = {
      impressions: 1000,
      visits: 100,
      leads: 10,
      spanDays: SPAN,
    };
    const post: FunnelGateTriple = {
      impressions: 1200,
      visits: 90,
      leads: 10,
      spanDays: SPAN,
    };

    const d = diagnoseFunnelMovement(pre, post);

    expect(d.diagnosable).toBe(true);
    expect(d.primaryDriver).toBeNull();
    expect(d.reason).toMatch(/did not change/);
    expect(d.leadsChange).toBe(0);
  });

  it("refuses to decompose across a zero gate (no undefined log-ratio)", () => {
    const pre: FunnelGateTriple = {
      impressions: 0,
      visits: 0,
      leads: 0,
      spanDays: SPAN,
    };
    const post: FunnelGateTriple = {
      impressions: 500,
      visits: 50,
      leads: 3,
      spanDays: SPAN,
    };

    const d = diagnoseFunnelMovement(pre, post);

    expect(d.diagnosable).toBe(false);
    expect(d.primaryDriver).toBeNull();
    expect(d.reason).toMatch(/is zero/);
  });

  it("distinguishes no-change from undiagnosable via the outcome discriminant", () => {
    const flat: FunnelGateTriple = {
      impressions: 1000,
      visits: 100,
      leads: 10,
      spanDays: SPAN,
    };
    const noChange = diagnoseFunnelMovement(flat, {
      ...flat,
      impressions: 1200,
      visits: 90,
    });
    const undiagnosable = diagnoseFunnelMovement(EMPTY, EMPTY);

    // Both carry a reason and no driver — only `outcome` separates them, which
    // is why keying on `diagnosable` alone renders a null driver as a result.
    expect(noChange.outcome).toBe("no_change");
    expect(noChange.diagnosable).toBe(true);
    expect(undiagnosable.outcome).toBe("undiagnosable");
    expect(undiagnosable.diagnosable).toBe(false);
  });
});

describe("diagnoseFunnelMovement — refuses a false-but-plausible driver", () => {
  it("refuses to name a driver when the windows are different lengths", () => {
    // A practice whose daily performance did not change AT ALL: 100 impressions,
    // 10 visits, 1 lead every single day. PRE is 14 days, POST is 28. Unguarded,
    // the whole calendar artifact lands on the impressions term and gets named
    // the driver of a "+100% lift" that never happened.
    const pre: FunnelGateTriple = {
      impressions: 1400,
      visits: 140,
      leads: 14,
      spanDays: 14,
    };
    const post: FunnelGateTriple = {
      impressions: 2800,
      visits: 280,
      leads: 28,
      spanDays: 28,
    };

    const d = diagnoseFunnelMovement(pre, post);

    expect(d.primaryDriver).toBeNull();
    expect(d.diagnosable).toBe(false);
    expect(d.outcome).toBe("undiagnosable");
    expect(d.reason).toMatch(/different lengths/);
    expect(d.reason).toMatch(/14 vs 28 days/);
  });

  it("refuses to decompose when the window length is unknown", () => {
    const unknownSpan: FunnelGateTriple = {
      impressions: 1000,
      visits: 100,
      leads: 10,
      spanDays: null,
    };

    const d = diagnoseFunnelMovement(unknownSpan, {
      ...unknownSpan,
      leads: 20,
    });

    // Fails closed: an unknown span is not "does not matter".
    expect(d.primaryDriver).toBeNull();
    expect(d.reason).toMatch(/unknown/);
  });

  it("refuses CTR as a driver when the ratio exceeds 1", () => {
    // A social campaign doubles traffic; search is untouched. CTR = visits /
    // impressions divides ALL-CHANNEL visits by ORGANIC-ONLY impressions, so it
    // reads 400% -> 800% and gets named the driver — relabelling a social push
    // as a search-snippet improvement.
    const pre: FunnelGateTriple = {
      impressions: 100,
      visits: 400,
      leads: 8,
      spanDays: SPAN,
    };
    const post: FunnelGateTriple = {
      impressions: 100,
      visits: 800,
      leads: 16,
      spanDays: SPAN,
    };

    const d = diagnoseFunnelMovement(pre, post);

    expect(d.primaryDriver).not.toBe("CTR");
    expect(d.primaryDriver).toBeNull();
    expect(d.reason).toMatch(/click-through/);
    // No impossible rate is published at all — not even as a term reading.
    expect(term(d, "CTR").pre).toBeNull();
    expect(term(d, "CTR").post).toBeNull();
    // The measured leads change is still reported honestly.
    expect(d.leadsChange).toBe(8);
  });

  it("refuses to name a driver when no term dominates", () => {
    // Three-way near-wash: impressions +0.0488, CTR +0.0392, CRO -0.0488. The
    // net leads move is +1 (25 -> 26). Argmax picks "impressions" by a hair
    // while CRO fell by an amount that cancelled it exactly.
    const pre: FunnelGateTriple = {
      impressions: 10000,
      visits: 500,
      leads: 25,
      spanDays: SPAN,
    };
    const post: FunnelGateTriple = {
      impressions: 10500,
      visits: 546,
      leads: 26,
      spanDays: SPAN,
    };

    const d = diagnoseFunnelMovement(pre, post);

    expect(d.primaryDriver).toBeNull();
    expect(d.outcome).toBe("no_dominant_term");
    // The decomposition itself succeeded — this is not an undiagnosable case.
    expect(d.diagnosable).toBe(true);
    expect(d.reason).toMatch(/no single term stands out/);
    // The margin is on the wire so a consumer can see how close it was.
    expect(d.marginRatio).not.toBeNull();
    expect(d.marginRatio!).toBeLessThan(0.25);
  });

  it("refuses to name a driver when large opposing moves nearly cancel", () => {
    // Impressions up a lot, CRO down a lot, leads barely move. Naming either
    // one "the driver" of a 3% change describes the arithmetic accurately and
    // the practice misleadingly.
    const pre: FunnelGateTriple = {
      impressions: 1000,
      visits: 100,
      leads: 20,
      spanDays: SPAN,
    };
    const post: FunnelGateTriple = {
      impressions: 1650,
      visits: 165,
      leads: 21,
      spanDays: SPAN,
    };

    const d = diagnoseFunnelMovement(pre, post);

    expect(d.primaryDriver).toBeNull();
    expect(d.outcome).toBe("no_dominant_term");
    expect(d.reason).toMatch(/nearly cancelled|stands out/);
  });

  it("names a negative gate as negative, not as zero", () => {
    const pre: FunnelGateTriple = {
      impressions: -5,
      visits: 100,
      leads: 10,
      spanDays: SPAN,
    };
    const post: FunnelGateTriple = {
      impressions: 1000,
      visits: 120,
      leads: 12,
      spanDays: SPAN,
    };

    const d = diagnoseFunnelMovement(pre, post);

    expect(d.diagnosable).toBe(false);
    // The old text said "pre impressions is zero" — a false statement, in the
    // module whose whole premise is that a fabricated explanation is worse
    // than none.
    expect(d.reason).not.toMatch(/is zero/);
    expect(d.reason).toMatch(/negative/);
  });

  it("says a non-finite gate is unusable, not zero", () => {
    const pre: FunnelGateTriple = {
      impressions: Number.NaN,
      visits: Number.POSITIVE_INFINITY,
      leads: 10,
      spanDays: SPAN,
    };
    const post: FunnelGateTriple = {
      impressions: 1000,
      visits: 120,
      leads: 12,
      spanDays: SPAN,
    };

    const d = diagnoseFunnelMovement(pre, post);

    expect(d.diagnosable).toBe(false);
    expect(d.reason).not.toMatch(/is zero/);
    expect(d.reason).toMatch(/not a usable number/);
  });

  it("keeps the log-additive identity exact over random positive triples", () => {
    // The load-bearing claim of the whole module: the three contributions sum
    // EXACTLY to ln(leadsPost / leadsPre). If that ever drifts, every driver
    // name built on it is arithmetic fiction.
    let seed = 20260724;
    const rand = (): number => {
      // Deterministic LCG so a failure is reproducible, not a flake.
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const triple = (): FunnelGateTriple => {
      const impressions = 100 + Math.floor(rand() * 100_000);
      // visits <= impressions and leads <= visits keeps both rates <= 1, which
      // is the only regime where the CTR term is comparable at all.
      const visits = Math.max(1, Math.floor(impressions * (0.01 + rand() * 0.5)));
      const leads = Math.max(1, Math.floor(visits * (0.01 + rand() * 0.5)));
      return { impressions, visits, leads, spanDays: SPAN };
    };

    for (let i = 0; i < 200; i += 1) {
      const pre = triple();
      const post = triple();
      const d = diagnoseFunnelMovement(pre, post);

      const contributions = d.terms.map((t) => t.logContribution);
      expect(contributions.every((c) => c !== null)).toBe(true);
      const sum = contributions.reduce((acc: number, c) => acc + (c as number), 0);
      expect(sum).toBeCloseTo(Math.log(post.leads! / pre.leads!), 12);
    }
  });
});
