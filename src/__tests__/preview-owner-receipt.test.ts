/**
 * preview-owner-receipt formatter tests.
 *
 * The preview CLI's honesty lives in its formatter (scripts/ownerReceiptReport).
 * These tests MOCK OwnerReceiptService.getReceipt to hand the formatter
 * service-shaped receipts and assert the four Value #6 guarantees at the print
 * layer:
 *   (a) a SUFFICIENT impressions trend prints the before -> after delta;
 *   (b) an INSUFFICIENT trend prints the plain reason and NO delta;
 *   (c) a null metric prints "not measured", never 0;
 *   (d) NO causal words ("caused", "drove", …) ever appear in the output.
 *
 * Dedicated file (no shared-test edits, per the build brief) and fully hermetic
 * — the formatter is pure, so no DB, clock, or network is touched.
 */
import { describe, it, expect, vi } from "vitest";

import { OwnerReceiptService } from "../controllers/owner-receipt/feature-services/OwnerReceiptService";
import { formatOwnerReceiptReport } from "../controllers/owner-receipt/feature-utils/formatOwnerReceiptReport";
import type {
  OwnerReceipt,
  OwnerReceiptMetric,
} from "../controllers/owner-receipt/OwnerReceiptTypes";
import type { ImpressionsLiftResult } from "../controllers/patient-journey/feature-services/impressionsLiftReader";
import type { FunnelMovementDiagnosis } from "../controllers/patient-journey/feature-utils/funnelMovementDiagnosis";

vi.mock("../controllers/owner-receipt/feature-services/OwnerReceiptService", () => ({
  OwnerReceiptService: { getReceipt: vi.fn() },
}));

const mockedGetReceipt = vi.mocked(OwnerReceiptService.getReceipt);

/** A fully-covered, sufficient impressions trend (delta is honest). */
function sufficientTrend(): ImpressionsLiftResult {
  return {
    organizationId: 39,
    projectId: "proj-1",
    source: "gsc_organic",
    pre: {
      window: { start: "2026-06-01", end: "2026-06-28" },
      storedImpressions: 1000,
      storedDays: 28,
      expectedDays: 28,
      earliestStored: "2026-06-01",
      latestStored: "2026-06-28",
      fullyCovered: true,
    },
    post: {
      window: { start: "2026-06-29", end: "2026-07-26" },
      storedImpressions: 1500,
      storedDays: 28,
      expectedDays: 28,
      earliestStored: "2026-06-29",
      latestStored: "2026-07-26",
      fullyCovered: true,
    },
    delta: 500,
    pctChange: 0.5,
    sufficient: true,
    reason: null,
    history: { earliest: "2026-06-01", latest: "2026-07-26" },
  };
}

/** An insufficient trend: partial post coverage, delta null with a reason. */
function insufficientTrend(): ImpressionsLiftResult {
  return {
    organizationId: 39,
    projectId: "proj-1",
    source: "gsc_organic",
    pre: {
      window: { start: "2026-06-01", end: "2026-06-28" },
      storedImpressions: 0,
      storedDays: 0,
      expectedDays: 28,
      earliestStored: null,
      latestStored: null,
      fullyCovered: false,
    },
    post: {
      window: { start: "2026-06-29", end: "2026-07-26" },
      storedImpressions: 300,
      storedDays: 10,
      expectedDays: 28,
      earliestStored: "2026-07-17",
      latestStored: "2026-07-26",
      fullyCovered: false,
    },
    delta: null,
    pctChange: null,
    sufficient: false,
    reason: "pre window has no stored GSC-organic history",
    history: { earliest: "2026-07-17", latest: "2026-07-26" },
  };
}

function diagnosable(): FunnelMovementDiagnosis {
  return {
    leadsPre: 4,
    leadsPost: 8,
    leadsChange: 4,
    leadsChangeFactor: 2,
    primaryDriver: "CRO",
    terms: [],
    diagnosable: true,
    reason: null,
  };
}

function notDiagnosable(): FunnelMovementDiagnosis {
  return {
    leadsPre: null,
    leadsPost: null,
    leadsChange: null,
    leadsChangeFactor: null,
    primaryDriver: null,
    terms: [],
    diagnosable: false,
    reason: "cannot decompose which term moved leads: pre impressions not measured",
  };
}

function baseReceipt(overrides: Partial<OwnerReceipt> = {}): OwnerReceipt {
  const metrics: OwnerReceiptMetric[] = [
    { gate: "impressions", value: 1500, source: "gsc_organic", asOf: "2026-07-26", note: null },
    { gate: "visits", value: 300, source: "rybbit", asOf: "2026-07-26", note: null },
    { gate: "leads", value: 8, source: "form_submissions", asOf: "2026-07-26", note: null },
  ];
  return {
    organizationId: 39,
    projectId: "proj-1",
    preWindow: { start: "2026-06-01", end: "2026-06-28" },
    postWindow: { start: "2026-06-29", end: "2026-07-26" },
    actions: {
      organizationId: 39,
      since: new Date("2026-06-01T00:00:00.000Z"),
      until: new Date("2026-07-27T00:00:00.000Z"),
      items: [],
      summary: { reviewReplies: 3, localPosts: 2, total: 5 },
      pagination: { total: 5, page: 1, limit: 500, totalPages: 1 },
    },
    metrics,
    impressionsTrend: sufficientTrend(),
    diagnosis: diagnosable(),
    ...overrides,
  } as OwnerReceipt;
}

/** No causal claim may ever reach a human's eyes (Value #6). */
const CAUSAL_WORDS = ["caused", "drove", "because of alloro", "thanks to", "attributable to", "responsible for"];

function assertNoCausation(output: string): void {
  const lower = output.toLowerCase();
  for (const word of CAUSAL_WORDS) {
    expect(lower).not.toContain(word);
  }
}

describe("formatOwnerReceiptReport — honesty guarantees", () => {
  it("(a) prints the before -> after delta when the trend is sufficient", async () => {
    mockedGetReceipt.mockResolvedValue(baseReceipt());
    const receipt = await OwnerReceiptService.getReceipt({} as never);
    const output = formatOwnerReceiptReport(receipt);

    expect(output).toContain("before : 1,000");
    expect(output).toContain("after  : 1,500");
    expect(output).toContain("+500");
    expect(output).toContain("+50.0%");
    assertNoCausation(output);
  });

  it("(b) prints the plain reason and NO delta when the trend is insufficient", async () => {
    mockedGetReceipt.mockResolvedValue(
      baseReceipt({ impressionsTrend: insufficientTrend(), diagnosis: notDiagnosable() })
    );
    const receipt = await OwnerReceiptService.getReceipt({} as never);
    const output = formatOwnerReceiptReport(receipt);

    expect(output).toContain("pre window has no stored GSC-organic history");
    // No delta line for the impressions change when insufficient.
    expect(output).not.toContain("change :");
    expect(output).toContain("post-window coverage : 10 of 28 days stored");
    // Diagnosis degrades honestly too.
    expect(output).toContain("not diagnosable:");
    assertNoCausation(output);
  });

  it("(c) prints 'not measured' for a null metric, never 0", async () => {
    const metrics: OwnerReceiptMetric[] = [
      {
        gate: "impressions",
        value: null,
        source: "gsc_organic",
        asOf: null,
        note: "not measured: no stored GSC-organic history in the post window",
      },
      { gate: "visits", value: 0, source: "rybbit", asOf: "2026-07-26", note: null },
      {
        gate: "leads",
        value: null,
        source: "form_submissions",
        asOf: null,
        note: "not measured: no verified form submissions recorded yet",
      },
    ];
    mockedGetReceipt.mockResolvedValue(baseReceipt({ metrics }));
    const receipt = await OwnerReceiptService.getReceipt({} as never);
    const output = formatOwnerReceiptReport(receipt);

    // The impressions gate line must say "not measured", not "0".
    const impressionsLine = output
      .split("\n")
      .find((line) => line.includes("Impressions (Get Found)"));
    expect(impressionsLine).toBeDefined();
    expect(impressionsLine).toContain("not measured");
    expect(impressionsLine).not.toMatch(/:\s*0\b/);

    // A genuine measured zero (connected visits, no events) is a real 0.
    const visitsLine = output
      .split("\n")
      .find((line) => line.includes("Visits (Get Considered)"));
    expect(visitsLine).toContain(": 0");

    assertNoCausation(output);
  });

  it("(d) never emits a causal claim in any branch", async () => {
    for (const receipt of [
      baseReceipt(),
      baseReceipt({ impressionsTrend: insufficientTrend(), diagnosis: notDiagnosable() }),
    ]) {
      assertNoCausation(formatOwnerReceiptReport(receipt));
    }
  });
});
