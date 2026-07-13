import { beforeEach, describe, expect, it, vi } from "vitest";

import { parsePastedData, sanitizePastedData } from "../../api/pms";
import { runPastePipeline } from "./pastePipeline";

vi.mock("../../api/pms", () => ({
  parsePastedData: vi.fn(),
  sanitizePastedData: vi.fn(),
}));

const parseMock = vi.mocked(parsePastedData);
const sanitizeMock = vi.mocked(sanitizePastedData);

const dentalRollup = [
  {
    month: "2026-04",
    self_referrals: 8,
    doctor_referrals: 150,
    total_referrals: 156,
    production_total: 197042.9,
    sources: [
      {
        name: "Self",
        referrals: 8,
        production: 6301,
        inferred_referral_type: "self" as const,
      },
      {
        name: "Smith Family Dental",
        referrals: 150,
        production: 190741.9,
        inferred_referral_type: "doctor" as const,
      },
    ],
  },
];

describe("runPastePipeline", () => {
  beforeEach(() => {
    parseMock.mockReset();
    sanitizeMock.mockReset();
  });

  it("sends a 600-row DentalEMR paste once and preserves its monthly total", async () => {
    const rawText = [
      "header",
      ...Array.from({ length: 600 }, (_, i) => `row-${i}`),
    ].join("\n");
    parseMock.mockResolvedValue({
      success: true,
      data: {
        parserType: "dentalemr",
        requiresSanitization: false,
        rows: [],
        monthlyRollup: dentalRollup,
        warnings: [],
        rowsParsed: 600,
        monthsDetected: 1,
      },
    });
    const onProgress = vi.fn();

    const result = await runPastePipeline({
      rawText,
      currentMonth: "2026-04",
      targetMonth: "2026-04",
      onProgress,
    });

    expect(parseMock).toHaveBeenCalledOnce();
    expect(parseMock).toHaveBeenCalledWith(rawText, "2026-04", "2026-04");
    expect(sanitizeMock).not.toHaveBeenCalled();
    expect(result.months[0]).toMatchObject({
      authoritativeTotalReferrals: 156,
      referralTotalMode: "authoritative",
    });
    expect(onProgress.mock.calls.map(([progress]) => progress.phase)).toEqual([
      "parsing",
      "ready",
    ]);
  });

  it("runs source cleaning as a distinct second phase for the default parser", async () => {
    const parsedRows = [
      {
        source: "Smith Dental",
        type: "doctor" as const,
        referrals: 2,
        production: 100,
        month: "2026-04",
      },
    ];
    parseMock.mockResolvedValue({
      success: true,
      data: {
        parserType: "default",
        requiresSanitization: true,
        rows: parsedRows,
        monthlyRollup: [],
        warnings: [],
        rowsParsed: 1,
        monthsDetected: 1,
      },
    });
    sanitizeMock.mockResolvedValue({
      success: true,
      data: {
        allRows: parsedRows,
        mergeGroups: [],
        reasoning: [],
        warnings: [],
        stats: {
          totalInputRows: 1,
          exactGroupsMerged: 0,
          fuzzyGroupsFound: 0,
          fuzzyGroupsConfirmed: 0,
          uniqueSourcesAfter: 1,
        },
      },
    });
    const onProgress = vi.fn();

    await runPastePipeline({
      rawText: "header\nrow",
      currentMonth: "2026-04",
      onProgress,
    });

    expect(sanitizeMock).toHaveBeenCalledWith(parsedRows);
    expect(onProgress.mock.calls.map(([progress]) => progress.phase)).toEqual([
      "parsing",
      "sanitizing",
      "ready",
    ]);
  });

  it("falls back to parsed rows and warns when source cleaning fails", async () => {
    const parsedRows = [
      {
        source: "Self",
        type: "self" as const,
        referrals: 1,
        production: 50,
        month: "2026-05",
      },
    ];
    parseMock.mockResolvedValue({
      success: true,
      data: {
        parserType: "default",
        requiresSanitization: true,
        rows: parsedRows,
        monthlyRollup: [],
        warnings: [],
        rowsParsed: 1,
        monthsDetected: 1,
      },
    });
    sanitizeMock.mockResolvedValue({
      success: false,
      error: "Unavailable",
    });

    const result = await runPastePipeline({
      rawText: "header\nrow",
      currentMonth: "2026-05",
      onProgress: vi.fn(),
    });

    expect(result.months[0]?.rows).toHaveLength(1);
    expect(result.warnings).toContain(
      "Data cleaning could not complete — using unprocessed results.",
    );
  });

  it("surfaces parser failures", async () => {
    parseMock.mockResolvedValue({ success: false, error: "Invalid headers" });

    await expect(
      runPastePipeline({
        rawText: "header\nrow",
        currentMonth: "2026-04",
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow("Invalid headers");
  });
});
