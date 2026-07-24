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
    excludes: ["gbp_maps"],
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
    failureKind: null,
    history: { earliest: "2026-06-01", latest: "2026-07-26" },
  };
}

/** An insufficient trend: partial post coverage, delta null with a reason. */
function insufficientTrend(): ImpressionsLiftResult {
  return {
    organizationId: 39,
    projectId: "proj-1",
    source: "gsc_organic",
    excludes: ["gbp_maps"],
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
    failureKind: "partial_coverage",
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
    margin: 0.5,
    marginRatio: 0.6,
    diagnosable: true,
    reason: null,
    outcome: "driver",
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
    margin: null,
    marginRatio: null,
    outcome: "undiagnosable",
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
    actionsAvailable: true,
    actionsNote: null,
    metrics,
    impressionsTrend: sufficientTrend(),
    diagnosis: diagnosable(),
    ...overrides,
  } as OwnerReceipt;
}

/** No causal claim may ever reach a human's eyes (Value #6). */
const CAUSAL_WORDS = [
  "caused",
  "drove",
  "because of alloro",
  "thanks to",
  "attributable to",
  "responsible for",
  "as a result",
  "led to",
  "resulted in",
];

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
    // "no term named" rather than "not diagnosable": a near-tie IS decomposable
    // and still names no term, so the old label was wrong for that case.
    expect(output).toContain("no term named:");
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
      baseReceipt({ actionsAvailable: false, actionsNote: "we could not load it" }),
    ]) {
      assertNoCausation(formatOwnerReceiptReport(receipt));
    }
  });

  it("prints 'not read' rather than 0 when the actions read was unavailable", async () => {
    // The degraded actions receipt still carries summary.total: 0. Printing
    // that 0 would be a failed read rendering as a measured zero, at the print
    // layer this formatter exists to defend.
    const output = formatOwnerReceiptReport(
      baseReceipt({
        actionsAvailable: false,
        actionsNote: "we could not load the list of actions just now",
        actions: {
          organizationId: 39,
          since: new Date("2026-06-01T00:00:00.000Z"),
          until: new Date("2026-07-27T00:00:00.000Z"),
          items: [],
          summary: { reviewReplies: 0, localPosts: 0, total: 0 },
          pagination: { total: 0, page: 1, limit: 500, totalPages: 1 },
        },
      })
    );

    expect(output).not.toMatch(/DATED ACTIONS ALLORO TOOK: 0/);
    expect(output).toContain("DATED ACTIONS ALLORO TOOK: not read");
  });

  it("still prints a genuine zero as 0 when the actions read succeeded", async () => {
    // The inverse: a real "Alloro did nothing this window" must stay a real 0.
    const output = formatOwnerReceiptReport(
      baseReceipt({
        actionsAvailable: true,
        actionsNote: null,
        actions: {
          organizationId: 39,
          since: new Date("2026-06-01T00:00:00.000Z"),
          until: new Date("2026-07-27T00:00:00.000Z"),
          items: [],
          summary: { reviewReplies: 0, localPosts: 0, total: 0 },
          pagination: { total: 0, page: 1, limit: 500, totalPages: 1 },
        },
      })
    );

    expect(output).toContain("DATED ACTIONS ALLORO TOOK: 0");
  });

  it("never prints a delta when the trend is insufficient, even with large partial sums", async () => {
    const trend = insufficientTrend();
    const output = formatOwnerReceiptReport(
      baseReceipt({
        impressionsTrend: {
          ...trend,
          pre: { ...trend.pre!, storedImpressions: 5000, storedDays: 10 },
          post: { ...trend.post!, storedImpressions: 300, storedDays: 4 },
        },
        diagnosis: notDiagnosable(),
      })
    );

    // A consumer must not be able to reconstruct the refused delta from the
    // printed coverage sums, and no percentage may appear anywhere.
    expect(output).not.toContain("-4700");
    expect(output).not.toContain("4700");
    expect(output).not.toContain("%");
  });

  it("prints a real measured 0 and an absent value as 'not measured' in the same report", async () => {
    // The distinction the whole stack turns on, asserted in one render.
    const output = formatOwnerReceiptReport(
      baseReceipt({
        metrics: [
          {
            gate: "impressions",
            value: 0,
            source: "gsc_organic",
            asOf: "2026-07-26",
            note: null,
          },
          {
            gate: "visits",
            value: null,
            source: "rybbit",
            asOf: null,
            note: "not measured: we could not read your website visits just now",
          },
        ],
      })
    );

    const line = (label: string) =>
      output.split("\n").find((l) => l.includes(label))!;
    expect(line("Impressions (Get Found)")).toContain(": 0");
    expect(line("Impressions (Get Found)")).not.toContain("not measured");
    expect(line("Visits (Get Considered)")).toContain("not measured");
    expect(line("Visits (Get Considered)")).not.toMatch(/:\s*0\b/);
  });
});
