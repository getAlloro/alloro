import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ColumnMapping } from "../types/pmsMapping";

const resolveMapping = vi.hoisted(() => vi.fn());

vi.mock("../utils/pms/resolveColumnMapping", () => ({ resolveMapping }));

import { DefaultPmsParserService } from "../controllers/pms/feature-services/DefaultPmsParserService";

const mapping: ColumnMapping = {
  headers: ["Treatment Date", "Source", "Type", "Production"],
  assignments: [
    { header: "Treatment Date", role: "date", confidence: 1 },
    { header: "Source", role: "source", confidence: 1 },
    { header: "Type", role: "type", confidence: 1 },
    { header: "Production", role: "production_total", confidence: 1 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveMapping.mockResolvedValue({
    mapping,
    source: "global-library",
    confidence: 1,
    signature: "synthetic-signature",
  });
});

describe("DefaultPmsParserService", () => {
  it("preserves the legacy Alloro-template paste rows", async () => {
    const rawText = [
      "Treatment Date\tSource\tType\tProduction",
      "\tDirect / Walk-in\tself\t$1,234.50",
      "05/02/2026\tSynthetic Dental\tdoctor\t200",
    ].join("\n");

    const result = await DefaultPmsParserService.parsePaste({
      organizationId: 7,
      rawText,
      fallbackMonth: "2026-05",
    });

    expect(result.rows).toEqual([
      {
        source: "Direct / Walk-in",
        type: "self",
        referrals: 1,
        production: 1234.5,
        month: "2026-05",
      },
      {
        source: "Synthetic Dental",
        type: "doctor",
        referrals: 1,
        production: 200,
        month: "2026-05",
      },
    ]);
    expect(result.mappingMetadata?.source).toBe("legacy-template");
    expect(result.rawRows).toHaveLength(2);
    expect(resolveMapping).not.toHaveBeenCalled();
  });

  it("wraps the current resolver and mapping adapter for row input", async () => {
    const rawRows = [
      {
        "Treatment Date": "2026-04-01",
        Source: "Synthetic Source",
        Type: "doctor",
        Production: "100.25",
      },
    ];

    const result = await DefaultPmsParserService.parseRows({
      organizationId: 11,
      rows: rawRows,
    });

    expect(resolveMapping).toHaveBeenCalledWith(
      11,
      mapping.headers,
      rawRows
    );
    expect(result.rawRows).toBe(rawRows);
    expect(result.monthlyRollup[0]).toMatchObject({
      month: "2026-04",
      total_referrals: 1,
      production_total: 100.25,
    });
    expect(result.mappingMetadata).toMatchObject({
      source: "global-library",
      signature: "synthetic-signature",
    });
    expect(result.requiresSanitization).toBe(true);
  });
});
