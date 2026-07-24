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

const term = (
  d: ReturnType<typeof diagnoseFunnelMovement>,
  t: "impressions" | "CTR" | "CRO",
) => d.terms.find((row) => row.term === t)!;

describe("diagnoseFunnelMovement — adversarial attribution honesty", () => {
  it("does NOT credit a term that moved the WRONG way (inverse Pawlak: leads FELL while impressions ROSE, CRO collapsed → driver is CRO)", () => {
    // Impressions ROSE (a positive contribution) but leads FELL: a naive
    // "biggest absolute mover" rule would wrongly blame impressions. The honest
    // driver is the term that moved in the direction leads actually went (down).
    const pre: FunnelGateTriple = { impressions: 1000, visits: 100, leads: 20 };
    const post: FunnelGateTriple = { impressions: 2000, visits: 150, leads: 10 };

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
    const pre: FunnelGateTriple = { impressions: 1000, visits: 100, leads: 5 };
    const post: FunnelGateTriple = { impressions: 1200, visits: 0, leads: 6 };

    const d = diagnoseFunnelMovement(pre, post);

    expect(d.diagnosable).toBe(false);
    expect(d.primaryDriver).toBeNull();
    expect(d.reason).toMatch(/post visits is zero/);
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
    };
    const post: FunnelGateTriple = {
      impressions: Number.POSITIVE_INFINITY,
      visits: 150,
      leads: 6,
    };

    let d!: ReturnType<typeof diagnoseFunnelMovement>;
    expect(() => {
      d = diagnoseFunnelMovement(pre, post);
    }).not.toThrow();

    expect(d.diagnosable).toBe(false);
    expect(d.primaryDriver).toBeNull();
    expect(d.reason).toBeTruthy();
    // Infinity is not a finite positive, so no term can form a real contribution.
    expect(term(d, "impressions").logContribution).toBeNull();
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

const PRE = { start: "2026-05-01", end: "2026-05-31" };
const POST = { start: "2026-06-01", end: "2026-06-30" };

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
  pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
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
  pre: covered(PRE, 3418, 31),
  post: covered(POST, 2856, 30),
  delta: -562,
  pctChange: -562 / 3418,
  sufficient: true,
  reason: null,
  history: { earliest: "2026-05-01", latest: "2026-06-30" },
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
    // The failed reads degrade to null + a plain-words note — never a fake 0.
    expect(byGate("visits").value).toBeNull();
    expect(byGate("visits").note).toMatch(/not measured/);
    expect(byGate("leads").value).toBeNull();
    // No visits total → the funnel cannot be honestly decomposed.
    expect(receipt.diagnosis.diagnosable).toBe(false);
    expect(receipt.diagnosis.primaryDriver).toBeNull();
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
