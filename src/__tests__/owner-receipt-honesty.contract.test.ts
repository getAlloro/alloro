/**
 * Adversarial honesty contract — the Value #6 guarantees for the owner receipt
 * that would FAIL if the receipt ever started to lie.
 *
 * These are NEW cases that the shipped suites do not already prove. Where an
 * invariant is already locked elsewhere, it is deliberately NOT re-added here
 * (see the "deliberately not duplicated" note below); this file only adds the
 * sharper adversarial angles those suites leave open:
 *
 *  - `diagnoseFunnelMovement` (pure): a term moving the WRONG way is never
 *    credited as the driver; a single bad gate poisons and names itself; garbage
 *    numbers (NaN / Infinity / negative) can never manufacture a driver or throw.
 *  - `OwnerReceiptService.getReceipt` (mocked seams): a thrown downstream read
 *    degrades to null metrics instead of a fabricated number; and — the honesty
 *    INVERSE of "never a fake 0" — a genuine measured 0 with an established lead
 *    source is KEPT as a real 0, never laundered into "not measured".
 *
 * Deliberately NOT duplicated (already proven on this branch):
 *  - no-data → every gate null / no driver  ...... owner-receipt.service.test (a),
 *                                                  funnel-movement-diagnosis (a)
 *  - Artful/Pawlak: impressions↓, CRO↑, leads↑ → CRO   funnel (b), service (b)
 *  - partial post-impressions coverage → null + note   service (c), reader test
 *  - rise-from-zero has delta but null pctChange ...... impressions-lift reader test
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  diagnoseFunnelMovement,
  type FunnelGateTriple,
} from "../controllers/patient-journey/feature-utils/funnelMovementDiagnosis";
import type { StageRead } from "../controllers/patient-journey/feature-services/stageReaders";
import type { ImpressionsLiftResult } from "../controllers/patient-journey/feature-services/impressionsLiftReader";

/** Both windows are the same length unless a case is about window length. */
const SPAN = 28;

const term = (
  d: ReturnType<typeof diagnoseFunnelMovement>,
  t: "impressions" | "CTR" | "CRO",
) => d.terms.find((row) => row.term === t)!;

describe("diagnoseFunnelMovement — adversarial attribution honesty", () => {
  it("does NOT credit a term that moved the WRONG way (inverse Pawlak: leads FELL while impressions ROSE, CRO collapsed → driver is CRO)", () => {
    // Impressions ROSE (a positive contribution) but leads FELL: a naive
    // "biggest absolute mover" rule would wrongly blame impressions. The honest
    // driver is the term that moved in the direction leads actually went (down).
    const pre: FunnelGateTriple = { impressions: 1000, visits: 100, leads: 20, spanDays: SPAN };
    const post: FunnelGateTriple = { impressions: 2000, visits: 150, leads: 10, spanDays: SPAN };

    const d = diagnoseFunnelMovement(pre, post);

    expect(d.diagnosable).toBe(true);
    expect(d.leadsChange).toBe(-10);
    // The wrong-direction riser is NOT the driver, even though it moved most in
    // absolute terms upward.
    expect(term(d, "impressions").logContribution!).toBeGreaterThan(0);
    expect(d.primaryDriver).toBe("CRO");
    expect(d.primaryDriver).not.toBe("impressions");
    // Log-additive identity still holds exactly.
    const sum =
      term(d, "impressions").logContribution! +
      term(d, "CTR").logContribution! +
      term(d, "CRO").logContribution!;
    expect(sum).toBeCloseTo(Math.log(10 / 20), 9);
  });

  it("refuses the whole diagnosis when a SINGLE gate is zero, and names that exact gate", () => {
    // Five of six gates are healthy; only post visits is 0. One poisoned gate
    // must sink the decomposition (the log-ratio is undefined) and the reason
    // must name the offender — never a guessed driver from the five good gates.
    const pre: FunnelGateTriple = { impressions: 1000, visits: 100, leads: 5, spanDays: SPAN };
    const post: FunnelGateTriple = { impressions: 1200, visits: 0, leads: 6, spanDays: SPAN };

    const d = diagnoseFunnelMovement(pre, post);

    expect(d.diagnosable).toBe(false);
    expect(d.primaryDriver).toBeNull();
    // Exact, not a substring match: `undiagnosableReason` joins EVERY offending
    // gate with "; ", so a loose match would still pass if the implementation
    // started reporting five spurious offenders alongside the real one.
    expect(d.reason).toBe(
      "cannot decompose which term moved leads: post visits is zero",
    );
    // The measured leads change is still reported honestly.
    expect(d.leadsChange).toBe(1);
  });

  it("cannot be tricked into a driver by garbage numbers (NaN / Infinity / negative), and never throws", () => {
    // Corrupt stored values must be treated as not-positive → not measured, so
    // they can neither manufacture a driver nor crash the reader.
    const pre: FunnelGateTriple = {
      impressions: Number.NaN,
      visits: 100,
      leads: -5,
      spanDays: SPAN,
    };
    const post: FunnelGateTriple = {
      impressions: Number.POSITIVE_INFINITY,
      visits: 150,
      leads: 6,
      spanDays: SPAN,
    };

    let d!: ReturnType<typeof diagnoseFunnelMovement>;
    expect(() => {
      d = diagnoseFunnelMovement(pre, post);
    }).not.toThrow();

    expect(d.diagnosable).toBe(false);
    expect(d.primaryDriver).toBeNull();
    expect(d.reason).toBeTruthy();
    // "Refused" is not enough — it must be refused for a TRUE reason. NaN and
    // Infinity are not zero, and a negative is not zero. An honesty suite that
    // accepts a false explanation as evidence of honesty is the exact failure
    // mode it exists to prevent.
    expect(d.reason).not.toMatch(/is zero/);
    expect(d.reason).toMatch(/not a usable number/);
    expect(d.reason).toMatch(/negative/);
    // Infinity is not a finite positive, so no term can form a real contribution.
    expect(term(d, "impressions").logContribution).toBeNull();
  });

  it("refuses to name a driver when the windows are different lengths (a calendar artifact is not an explanation)", () => {
    // A practice whose daily performance did not change at all: 100 impressions,
    // 10 visits, 1 lead EVERY day. A 14-day PRE against a 28-day POST doubles
    // both counts and leaves both rates untouched, so the entire artifact lands
    // on the impressions term — and downstream becomes "more people reached
    // out, and it's because more people saw you." Nothing happened.
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
    expect(d.primaryDriver).not.toBe("impressions");
    expect(d.diagnosable).toBe(false);
    expect(d.reason).toMatch(/different lengths/);
  });

  it("refuses to name CTR the driver when the ratio is arithmetically impossible", () => {
    // A social campaign doubles traffic; search impressions are unchanged.
    // CTR = visits / impressions divides ALL-CHANNEL visits by ORGANIC-ONLY
    // impressions, so it reads 400% -> 800%. A click-through rate above 100%
    // is proof the two numbers do not describe the same surface.
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
    // The impossible rate is not published anywhere — a consumer reading
    // terms[] directly must not find a renderable 400%.
    expect(term(d, "CTR").pre).toBeNull();
    expect(term(d, "CTR").post).toBeNull();
    expect(JSON.stringify(d)).not.toContain("400");
  });

  it("refuses to name a driver from a three-way near-wash, and shows how close it was", () => {
    // impressions +0.0488, CTR +0.0392, CRO -0.0488: CRO fell by exactly what
    // impressions rose, and the net leads move is +1 (25 -> 26). Argmax picks
    // "impressions" by a 7% share of the total movement and hands the frontend
    // one confident word.
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
    // The decomposition itself worked — this is a refusal to over-claim, not a
    // failure to compute.
    expect(d.diagnosable).toBe(true);
    expect(d.terms.every((t) => t.logContribution !== null)).toBe(true);
    // The margin travels on the wire so the card can stay honest about it.
    expect(d.marginRatio).not.toBeNull();
    expect(d.marginRatio!).toBeLessThan(0.25);
  });
});

// ── OwnerReceiptService adversarial honesty (data seams mocked) ──────────────
const getReceipt = vi.fn();
const readImpressionsLift = vi.fn();
const readVisits = vi.fn();
const countVerifiedBetween = vi.fn();
const countVerifiedAllTime = vi.fn();

vi.mock("../controllers/proof-receipt/feature-services/ProofReceiptService", () => ({
  ProofReceiptService: { getReceipt: (...a: unknown[]) => getReceipt(...a) },
}));
vi.mock("../controllers/patient-journey/feature-services/impressionsLiftReader", () => ({
  readImpressionsLift: (...a: unknown[]) => readImpressionsLift(...a),
}));
vi.mock("../controllers/patient-journey/feature-services/stageReaders", () => ({
  readVisits: (...a: unknown[]) => readVisits(...a),
}));
vi.mock("../models/website-builder/FormSubmissionModel", () => ({
  FormSubmissionModel: {
    countVerifiedBetweenByProjectId: (...a: unknown[]) => countVerifiedBetween(...a),
    countVerifiedByProjectId: (...a: unknown[]) => countVerifiedAllTime(...a),
  },
}));
vi.mock("../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Imported after the mocks are registered.
import { OwnerReceiptService } from "../controllers/owner-receipt/feature-services/OwnerReceiptService";

const PRE = { start: "2026-05-02", end: "2026-05-31" }; // 30 days
const POST = { start: "2026-06-01", end: "2026-06-30" }; // 30 days

const INPUT = {
  organizationId: 8,
  accessibleLocationIds: [80],
  preWindow: PRE,
  postWindow: POST,
  page: 1,
  limit: 50,
};

const emptyActions = {
  organizationId: 8,
  since: new Date(),
  until: new Date(),
  items: [],
  summary: { reviewReplies: 0, localPosts: 0, total: 0 },
  pagination: { page: 1, limit: 50, total: 0, totalPages: 1 },
};

/** A fully-covered window coverage block for the lift reader result. */
const covered = (
  window: { start: string; end: string },
  impressions: number,
  days: number,
) => ({
  window,
  storedImpressions: impressions,
  storedDays: days,
  expectedDays: days,
  earliestStored: window.start,
  latestStored: window.end,
  fullyCovered: true,
});

/** A fully-covered lift result (both windows real) — the "connected org" base. */
const coveredLift = (): ImpressionsLiftResult => ({
  organizationId: 8,
  projectId: "proj-8",
  source: "gsc_organic",
  excludes: ["gbp_maps"],
  pre: covered(PRE, 3418, 30),
  post: covered(POST, 2856, 30),
  delta: -562,
  pctChange: -562 / 3418,
  sufficient: true,
  reason: null,
  failureKind: null,
  history: { earliest: "2026-05-02", latest: "2026-06-30" },
});

const stageRead = (value: number): StageRead => ({
  value,
  available: true,
  asOf: "2026-06-30",
});

beforeEach(() => {
  vi.clearAllMocks();
  getReceipt.mockResolvedValue(emptyActions);
});

describe("OwnerReceiptService.getReceipt — adversarial honesty", () => {
  it("degrades a thrown visits/leads read to null metrics instead of a fabricated number, and does not throw", async () => {
    // Impressions read is healthy, but the visits source throws mid-read. The
    // receipt must still return: impressions kept real, visits/leads null with a
    // note, no driver — never a guessed number in place of the failed read.
    readImpressionsLift.mockResolvedValue(coveredLift());
    readVisits.mockRejectedValue(new Error("rybbit down"));
    countVerifiedBetween.mockResolvedValue(6);
    countVerifiedAllTime.mockResolvedValue(40);

    const receipt = await OwnerReceiptService.getReceipt(INPUT);

    const byGate = (g: string) => receipt.metrics.find((m) => m.gate === g)!;
    // The healthy source is kept real.
    expect(byGate("impressions").value).toBe(2856);
    // The failed read degrades to null + a plain-words note — never a fake 0.
    expect(byGate("visits").value).toBeNull();
    expect(byGate("visits").note).toMatch(/not measured/);
    // …and the note must say the READ failed. "Your visits source is not
    // connected" is a statement about the practice's setup, and it is false —
    // Rybbit was simply down.
    expect(byGate("visits").note).not.toMatch(/not connected/);
    expect(byGate("visits").note).toMatch(/could not read/i);
    // The healthy leads read SURVIVES the unrelated third-party failure. Reads
    // settle independently, so one dark source cannot discard four good ones.
    expect(byGate("leads").value).toBe(6);
    // No visits total → the funnel cannot be honestly decomposed.
    expect(receipt.diagnosis.diagnosable).toBe(false);
    expect(receipt.diagnosis.primaryDriver).toBeNull();
  });

  it("marks a failed dated-actions read as unavailable — never as a measured 0", async () => {
    // The degraded actions receipt is byte-identical to a true "Alloro did
    // nothing this window": items: [] and summary.total: 0. Only the flag
    // separates them. Without it, a failed read renders to the owner as a
    // count of zero — Value #6, verbatim, created by the §3.1 fix itself.
    getReceipt.mockRejectedValue(new Error("proof-receipt db down"));
    readImpressionsLift.mockResolvedValue(coveredLift());
    readVisits
      .mockResolvedValueOnce(stageRead(461))
      .mockResolvedValueOnce(stageRead(428));
    countVerifiedBetween.mockResolvedValueOnce(6).mockResolvedValueOnce(12);
    countVerifiedAllTime.mockResolvedValue(40);

    let receipt!: Awaited<ReturnType<typeof OwnerReceiptService.getReceipt>>;
    await expect(
      (async () => {
        receipt = await OwnerReceiptService.getReceipt(INPUT);
      })(),
    ).resolves.not.toThrow();

    expect(receipt.actionsAvailable).toBe(false);
    expect(receipt.actionsNote).toBeTruthy();
    // The shape still says 0 — that is exactly why the flag has to exist.
    expect(receipt.actions.summary.total).toBe(0);
    // The rest of the receipt survives the dark actions read.
    expect(receipt.impressionsTrend.delta).toBe(-562);
  });

  it("does not present a real 'Alloro did nothing' as unavailable (the inverse lie)", async () => {
    // Laundering a genuine zero into "we could not load it" would be its own
    // fabrication — the mirror of the bug above.
    getReceipt.mockResolvedValue(emptyActions);
    readImpressionsLift.mockResolvedValue(coveredLift());
    readVisits
      .mockResolvedValueOnce(stageRead(461))
      .mockResolvedValueOnce(stageRead(428));
    countVerifiedBetween.mockResolvedValueOnce(6).mockResolvedValueOnce(12);
    countVerifiedAllTime.mockResolvedValue(40);

    const receipt = await OwnerReceiptService.getReceipt(INPUT);

    expect(receipt.actionsAvailable).toBe(true);
    expect(receipt.actionsNote).toBeNull();
    expect(receipt.actions.summary.total).toBe(0);
  });

  it("KEEPS a genuine measured 0 (established lead source, empty window) — never launders a real 0 into 'not measured'", async () => {
    // The honesty inverse of "never a fake 0": a connected lead source with a
    // true zero in the window must report a real 0, not hide it as null. Turning
    // a real 0 into "not measured" would be its own lie.
    readImpressionsLift.mockResolvedValue(coveredLift());
    readVisits
      .mockResolvedValueOnce(stageRead(461))
      .mockResolvedValueOnce(stageRead(428));
    // Window leads = 0 (pre and post), but all-time > 0 → the source IS established.
    countVerifiedBetween.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    countVerifiedAllTime.mockResolvedValue(40);

    const receipt = await OwnerReceiptService.getReceipt(INPUT);

    const leads = receipt.metrics.find((m) => m.gate === "leads")!;
    expect(leads.value).toBe(0); // a real, kept zero — not null
    expect(leads.value).not.toBeNull();
    expect(leads.note).toBeNull(); // no "not measured" caveat on a genuine 0
    expect(leads.source).toBe("form_submissions");
  });
});
