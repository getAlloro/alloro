/**
 * Unit tests — `diagnoseFunnelMovement` (the doctor's "why").
 *
 * Proves the three things the type-checker cannot: (1) an org with no data
 * returns "not measured" — every term `null`, never 0 or an invented figure;
 * (2) the diagnosis correctly names the driver on the real Artful pattern
 * (impressions FALL, CRO rises, leads go up -> driver is CRO); and (3) a
 * partial/absent window degrades honestly (no driver, a plain-words reason, the
 * measured numbers still returned). Pure arithmetic — no DB, no mocks.
 */

import { describe, it, expect } from "vitest";
import {
  diagnoseFunnelMovement,
  type FunnelGateTriple,
} from "../controllers/patient-journey/feature-utils/funnelMovementDiagnosis";

const EMPTY: FunnelGateTriple = { impressions: null, visits: null, leads: null };

/** Pull one term's row out of the result for assertions. */
const term = (
  d: ReturnType<typeof diagnoseFunnelMovement>,
  t: "impressions" | "CTR" | "CRO"
) => d.terms.find((row) => row.term === t)!;

describe("diagnoseFunnelMovement", () => {
  it("(a) an org with no data returns 'not measured', never 0 or invented", () => {
    const d = diagnoseFunnelMovement(EMPTY, EMPTY);

    expect(d.diagnosable).toBe(false);
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
    const pre: FunnelGateTriple = { impressions: 3418, visits: 461, leads: 6 };
    const post: FunnelGateTriple = { impressions: 2856, visits: 428, leads: 12 };

    const d = diagnoseFunnelMovement(pre, post);

    expect(d.diagnosable).toBe(true);
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
    const pre: FunnelGateTriple = { impressions: 3418, visits: 461, leads: 6 };
    const post: FunnelGateTriple = { impressions: null, visits: 428, leads: 12 };

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
    const pre: FunnelGateTriple = { impressions: 1000, visits: 100, leads: 5 };
    const post: FunnelGateTriple = { impressions: 3000, visits: 300, leads: 15 };

    const d = diagnoseFunnelMovement(pre, post);

    expect(d.diagnosable).toBe(true);
    expect(d.primaryDriver).toBe("impressions");
    expect(term(d, "CTR").logContribution!).toBeCloseTo(0, 9);
    expect(term(d, "CRO").logContribution!).toBeCloseTo(0, 9);
  });

  it("names no driver when leads did not change", () => {
    const pre: FunnelGateTriple = { impressions: 1000, visits: 100, leads: 10 };
    const post: FunnelGateTriple = { impressions: 1200, visits: 90, leads: 10 };

    const d = diagnoseFunnelMovement(pre, post);

    expect(d.diagnosable).toBe(true);
    expect(d.primaryDriver).toBeNull();
    expect(d.reason).toMatch(/did not change/);
    expect(d.leadsChange).toBe(0);
  });

  it("refuses to decompose across a zero gate (no undefined log-ratio)", () => {
    const pre: FunnelGateTriple = { impressions: 0, visits: 0, leads: 0 };
    const post: FunnelGateTriple = { impressions: 500, visits: 50, leads: 3 };

    const d = diagnoseFunnelMovement(pre, post);

    expect(d.diagnosable).toBe(false);
    expect(d.primaryDriver).toBeNull();
    expect(d.reason).toMatch(/is zero/);
  });
});
