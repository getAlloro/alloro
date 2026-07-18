/**
 * Unit tests — patient-journey `stageReaders.readLeads` by-source breakdown.
 *
 * The capture half (deriveSubmissionSource → source/source_method columns) was
 * inert: no reader aggregated by channel. This proves the read half — the
 * `FormSubmissionModel.getVerifiedStatsBySource` rows surface on the leads stage
 * with the honest confidence tier derived from stored provenance, the null
 * source stays its own "unknown" bucket (never folded, never zero-filled), and
 * the per-source counts reconcile with the headline verified total. A by-source
 * failure degrades the breakdown only — it never drops the working lead count
 * (§3.1). Real model seams are mocked (§20.1 mirrors the unit, §20.4 synthetic).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const getMonthlyStatsByProject = vi.fn();
const getVerifiedStatsBySource = vi.fn();

vi.mock("../models/website-builder/GscDataModel", () => ({
  GscDataModel: {},
}));
vi.mock("../models/website-builder/WebsiteIntegrationModel", () => ({
  WebsiteIntegrationModel: {},
}));
vi.mock("../models/website-builder/FormSubmissionModel", () => ({
  FormSubmissionModel: {
    getMonthlyStatsByProject: (...a: unknown[]) =>
      getMonthlyStatsByProject(...a),
    getVerifiedStatsBySource: (...a: unknown[]) =>
      getVerifiedStatsBySource(...a),
  },
}));
vi.mock("../models/website-builder/ProjectModel", () => ({ ProjectModel: {} }));
vi.mock("../models/website-builder/ReviewModel", () => ({ ReviewModel: {} }));
vi.mock("../models/PracticeRankingModel", () => ({ PracticeRankingModel: {} }));
vi.mock("../utils/pms/pmsAggregator", () => ({ aggregatePmsData: vi.fn() }));
vi.mock(
  "../controllers/admin-websites/feature-services/service.rybbit-performance",
  () => ({ fetchRybbitOverview: vi.fn() }),
);
vi.mock("../utils/rybbit/rybbit-time-zone", () => ({
  resolveRybbitTimeZone: vi.fn(),
}));
vi.mock("../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { readLeads } from "../controllers/patient-journey/feature-services/stageReaders";

const PROJECT = "proj-1";
// A completed past month so the "as of" clamp doesn't interfere.
const MONTH_START = new Date(Date.UTC(2026, 5, 1)); // 2026-06-01
const MONTH_END = new Date(Date.UTC(2026, 6, 1)); // 2026-07-01 (exclusive)

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readLeads — by-source breakdown", () => {
  it("surfaces each channel with its honest confidence tier and reconciles with verified", async () => {
    getMonthlyStatsByProject.mockResolvedValue([
      {
        month: "2026-06",
        total: 12,
        verified: 12,
        unread: 0,
        flagged: 0,
        blocked: 0,
      },
    ]);
    getVerifiedStatsBySource.mockResolvedValue([
      { source: "google", source_method: "client_label", verified: 7 },
      { source: "referral", source_method: "header_referrer", verified: 3 },
      { source: null, source_method: null, verified: 2 },
    ]);

    const read = await readLeads(PROJECT, MONTH_START, MONTH_END);

    expect(read.value).toBe(12);
    expect(read.available).toBe(true);
    // The by-source read is keyed to the SAME lower bound + month bucket the
    // headline uses (startIso + "YYYY-MM"), NOT a UTC instant window — so a
    // boundary row buckets identically for both regardless of DB session TZ.
    expect(getVerifiedStatsBySource).toHaveBeenCalledWith(
      PROJECT,
      MONTH_START.toISOString(),
      "2026-06",
    );

    const bySource = read.metadata?.leads?.bySource;
    expect(bySource).toEqual([
      {
        source: "google",
        method: "client_label",
        confidence: "claimed", // a client claim is "reported as", never verified
        verified: 7,
      },
      {
        source: "referral",
        method: "header_referrer",
        confidence: "observed", // browser-sent + classified by us
        verified: 3,
      },
      {
        source: null,
        method: null,
        confidence: "unknown", // honest unknown bucket, never a guessed channel
        verified: 2,
      },
    ]);

    // Honesty invariant: the buckets sum to the headline verified count.
    const sum = bySource!.reduce((acc, b) => acc + b.verified, 0);
    expect(sum).toBe(read.metadata!.leads!.verified);
  });

  it("reconciles across a month boundary: buckets sum to the headline verified count", async () => {
    // A boundary case: the headline counts 10 verified rows for the month,
    // including one that sits on the UTC month edge. Because the by-source read
    // is keyed to the SAME session-TZ month bucket (not a UTC instant window),
    // the model returns that same edge row in the June bucket, so the per-source
    // counts still sum to the headline — the invariant this fix protects.
    getMonthlyStatsByProject.mockResolvedValue([
      { month: "2026-06", total: 10, verified: 10, unread: 0, flagged: 0, blocked: 0 },
    ]);
    getVerifiedStatsBySource.mockResolvedValue([
      { source: "google", source_method: "client_label", verified: 6 },
      { source: "referral", source_method: "header_referrer", verified: 3 },
      // the boundary row — lands in the same June bucket as the headline
      { source: null, source_method: null, verified: 1 },
    ]);

    const read = await readLeads(PROJECT, MONTH_START, MONTH_END);

    // Same startIso + monthKey basis as the headline row.
    expect(getVerifiedStatsBySource).toHaveBeenCalledWith(
      PROJECT,
      MONTH_START.toISOString(),
      "2026-06",
    );
    const bySource = read.metadata!.leads!.bySource!;
    const sum = bySource.reduce((acc, b) => acc + b.verified, 0);
    expect(sum).toBe(read.metadata!.leads!.verified);
    expect(sum).toBe(10);
  });

  it("drops an empty breakdown rather than attaching [] beside a nonzero headline", async () => {
    getMonthlyStatsByProject.mockResolvedValue([
      { month: "2026-06", total: 4, verified: 4, unread: 0, flagged: 0, blocked: 0 },
    ]);
    // A degenerate/empty by-source result must not attach a breakdown that
    // would read as summing to zero next to a nonzero verified count.
    getVerifiedStatsBySource.mockResolvedValue([]);

    const read = await readLeads(PROJECT, MONTH_START, MONTH_END);

    expect(read.metadata?.leads?.verified).toBe(4);
    expect(read.metadata?.leads?.bySource).toBeUndefined();
  });

  it("keeps the unknown-source count separate, never folded into a real channel", async () => {
    getMonthlyStatsByProject.mockResolvedValue([
      { month: "2026-06", total: 5, verified: 5, unread: 0, flagged: 0, blocked: 0 },
    ]);
    getVerifiedStatsBySource.mockResolvedValue([
      { source: null, source_method: null, verified: 5 },
    ]);

    const read = await readLeads(PROJECT, MONTH_START, MONTH_END);

    expect(read.metadata?.leads?.bySource).toEqual([
      { source: null, method: null, confidence: "unknown", verified: 5 },
    ]);
  });

  it("drops only the breakdown when the by-source read fails, keeping the verified count", async () => {
    getMonthlyStatsByProject.mockResolvedValue([
      { month: "2026-06", total: 9, verified: 9, unread: 0, flagged: 0, blocked: 0 },
    ]);
    getVerifiedStatsBySource.mockRejectedValue(new Error("boom"));

    const read = await readLeads(PROJECT, MONTH_START, MONTH_END);

    expect(read.value).toBe(9);
    expect(read.available).toBe(true);
    expect(read.metadata?.leads?.verified).toBe(9);
    expect(read.metadata?.leads?.bySource).toBeUndefined();
  });

  it("does not attach a breakdown for a month with no verified row", async () => {
    // Project has other-month data, but none in the reported month → real zero.
    getMonthlyStatsByProject.mockResolvedValue([
      { month: "2026-05", total: 3, verified: 3, unread: 0, flagged: 0, blocked: 0 },
    ]);

    const read = await readLeads(PROJECT, MONTH_START, MONTH_END);

    expect(read.value).toBe(0);
    expect(read.metadata?.leads?.verified).toBe(0);
    expect(read.metadata?.leads?.bySource).toBeUndefined();
    // No verified row this month → no need to hit the by-source read at all.
    expect(getVerifiedStatsBySource).not.toHaveBeenCalled();
  });
});
