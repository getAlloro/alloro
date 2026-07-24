/**
 * Unit tests — `OwnerReceiptService.getReceipt` (the read-model orchestration).
 *
 * Proves the honesty the type-check can't: (1) an org with no data returns
 * every gate "not measured" (`value: null` + a reason), NEVER 0 or an invented
 * figure, and the diagnosis names no driver; (2) a fully-covered, connected org
 * yields the real gate numbers and a real driver end-to-end; (3) a
 * partially-covered impressions window degrades honestly — impressions null with
 * a coverage note, no fabricated total, no driver. Only the data seams are
 * mocked (the four readers/services); the real diagnosis math runs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StageRead } from "../controllers/patient-journey/feature-services/stageReaders";
import type { ImpressionsLiftResult } from "../controllers/patient-journey/feature-services/impressionsLiftReader";

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

import { OwnerReceiptService } from "../controllers/owner-receipt/feature-services/OwnerReceiptService";
import logger from "../lib/logger";

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
  days: number
) => ({
  window,
  storedImpressions: impressions,
  storedDays: days,
  expectedDays: days,
  earliestStored: window.start,
  latestStored: window.end,
  fullyCovered: true,
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

describe("OwnerReceiptService.getReceipt", () => {
  it("(a) no data -> every gate 'not measured', never 0; no driver named", async () => {
    // Org with no website project: the lift reader returns a null-everything result.
    const noProject: ImpressionsLiftResult = {
      organizationId: 8,
      projectId: null,
      source: "gsc_organic",
      pre: null,
      post: null,
      delta: null,
      pctChange: null,
      sufficient: false,
      reason: "organization has no website project with stored GSC history",
      history: { earliest: null, latest: null },
    };
    readImpressionsLift.mockResolvedValue(noProject);

    const receipt = await OwnerReceiptService.getReceipt(INPUT);

    // No project -> the visits/leads reads must be skipped entirely.
    expect(readVisits).not.toHaveBeenCalled();
    expect(countVerifiedBetween).not.toHaveBeenCalled();

    for (const metric of receipt.metrics) {
      expect(metric.value).toBeNull(); // never a 0-standing-in-for-absent
      expect(metric.note).toMatch(/not measured/);
    }
    expect(receipt.diagnosis.diagnosable).toBe(false);
    expect(receipt.diagnosis.primaryDriver).toBeNull();
    expect(receipt.projectId).toBeNull();
  });

  it("(b) fully-covered connected org -> real gate numbers and a real driver", async () => {
    const lift: ImpressionsLiftResult = {
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
    };
    readImpressionsLift.mockResolvedValue(lift);
    // visits: pre 461, post 428 (Artful pattern) -> CRO is the driver.
    readVisits
      .mockResolvedValueOnce(stageRead(461))
      .mockResolvedValueOnce(stageRead(428));
    // leads: pre 6, post 12; all-time > 0 (lead source established).
    countVerifiedBetween.mockResolvedValueOnce(6).mockResolvedValueOnce(12);
    countVerifiedAllTime.mockResolvedValue(40);

    const receipt = await OwnerReceiptService.getReceipt(INPUT);

    const byGate = (g: string) => receipt.metrics.find((m) => m.gate === g)!;
    expect(byGate("impressions").value).toBe(2856);
    expect(byGate("impressions").source).toBe("gsc_organic");
    expect(byGate("visits").value).toBe(428);
    expect(byGate("leads").value).toBe(12);

    expect(receipt.diagnosis.diagnosable).toBe(true);
    expect(receipt.diagnosis.primaryDriver).toBe("CRO");
    expect(receipt.diagnosis.leadsChange).toBe(6);
    expect(receipt.impressionsTrend.delta).toBe(-562);
  });

  it("(c) partial post-impressions coverage degrades honestly (null + note, no driver)", async () => {
    const lift: ImpressionsLiftResult = {
      organizationId: 8,
      projectId: "proj-8",
      source: "gsc_organic",
      pre: covered(PRE, 3418, 31),
      post: {
        window: POST,
        storedImpressions: 1400, // a partial sum — must NOT be shown as a total
        storedDays: 12,
        expectedDays: 30,
        earliestStored: "2026-06-01",
        latestStored: "2026-06-12",
        fullyCovered: false,
      },
      delta: null,
      pctChange: null,
      sufficient: false,
      reason: "POST window is only partially covered (12 of 30 days stored)",
      history: { earliest: "2026-05-01", latest: "2026-06-12" },
    };
    readImpressionsLift.mockResolvedValue(lift);
    readVisits
      .mockResolvedValueOnce(stageRead(461))
      .mockResolvedValueOnce(stageRead(428));
    countVerifiedBetween.mockResolvedValueOnce(6).mockResolvedValueOnce(12);
    countVerifiedAllTime.mockResolvedValue(40);

    const receipt = await OwnerReceiptService.getReceipt(INPUT);

    const impressions = receipt.metrics.find((m) => m.gate === "impressions")!;
    expect(impressions.value).toBeNull(); // the partial sum is never presented as a total
    expect(impressions.note).toMatch(/partially covered/);
    // Diagnosis can't honestly decompose without a post impressions total.
    expect(receipt.diagnosis.diagnosable).toBe(false);
    expect(receipt.diagnosis.primaryDriver).toBeNull();
    // But the real, measured leads change is still reported.
    expect(receipt.diagnosis.leadsChange).toBe(6);
  });

  it("(d) a failed dated-actions read degrades honestly — no throw, empty actions, trend + diagnosis intact", async () => {
    // The actions read throws; every other seam is healthy (the Artful pattern).
    getReceipt.mockRejectedValue(new Error("dated-actions read failed"));
    const lift: ImpressionsLiftResult = {
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
    };
    readImpressionsLift.mockResolvedValue(lift);
    readVisits
      .mockResolvedValueOnce(stageRead(461))
      .mockResolvedValueOnce(stageRead(428));
    countVerifiedBetween.mockResolvedValueOnce(6).mockResolvedValueOnce(12);
    countVerifiedAllTime.mockResolvedValue(40);

    // Never throws (§3.1): the whole receipt still resolves.
    const receipt = await OwnerReceiptService.getReceipt(INPUT);

    // Actions degrade to an empty list — nothing fabricated, over the real window.
    expect(receipt.actions.items).toEqual([]);
    expect(receipt.actions.summary.total).toBe(0);
    // The honest trend + diagnosis survive the dark actions read.
    expect(receipt.impressionsTrend.delta).toBe(-562);
    expect(receipt.diagnosis.primaryDriver).toBe("CRO");
    // The failure was logged, not swallowed (§3.2).
    expect(logger.warn).toHaveBeenCalled();
  });
});
