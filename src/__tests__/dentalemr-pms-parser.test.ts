import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { DentalEmrPmsParserService } from "../controllers/pms/feature-services/DentalEmrPmsParserService";

const HEADERS = [
  "Treatment Date",
  "Status",
  "Ins. Adj. Fee.",
  "Patient",
  "Referring Practice",
];

function dentalRow(
  overrides: Partial<Record<(typeof HEADERS)[number], unknown>> = {},
): Record<string, unknown> {
  return {
    "Treatment Date": "04/01/2026",
    Status: "Done",
    "Ins. Adj. Fee.": 0,
    Patient: "Synthetic Patient A",
    "Referring Practice": "Synthetic Alpha Dental",
    ...overrides,
  };
}

function multerFile(
  originalname: string,
  buffer: Buffer,
  mimetype: string,
): Express.Multer.File {
  return {
    fieldname: "file",
    originalname,
    encoding: "7bit",
    mimetype,
    size: buffer.length,
    buffer,
    destination: "",
    filename: originalname,
    path: "",
    stream: null as unknown as Express.Multer.File["stream"],
  };
}

describe("DentalEmrPmsParserService", () => {
  it("applies DentalEMR production, distinct-count, and source rules", async () => {
    const rows = [
      dentalRow({
        "Ins. Adj. Fee.": "$100.00",
        "Referring Practice": "***Synthetic Alpha Dental***",
      }),
      dentalRow({ "Ins. Adj. Fee.": 50 }),
      dentalRow({
        "Ins. Adj. Fee.": 25,
        "Referring Practice": "Synthetic Beta Dental",
      }),
      dentalRow({
        Patient: "Synthetic Patient B",
        "Referring Practice": "",
      }),
      dentalRow({
        Patient: "Synthetic Patient C",
        "Ins. Adj. Fee.": 10,
        "Referring Practice": "1ENDO",
      }),
      dentalRow({
        Patient: "Synthetic Patient D",
        Status: "Scheduled",
        "Ins. Adj. Fee.": 999,
      }),
      dentalRow({
        Patient: "",
        "Ins. Adj. Fee.": 5,
        "Referring Practice": "Synthetic Gamma Dental",
      }),
      dentalRow({
        "Treatment Date": "not-a-date",
        Patient: "Synthetic Patient E",
        "Ins. Adj. Fee.": 20,
      }),
    ];

    const result = await DentalEmrPmsParserService.parseRows({
      organizationId: 7,
      rows,
    });

    expect(result.monthlyRollup).toHaveLength(1);
    const april = result.monthlyRollup[0];
    expect(april).toMatchObject({
      month: "2026-04",
      total_referrals: 3,
      self_referrals: 2,
      doctor_referrals: 2,
      production_total: 190,
    });
    expect(april.sources).toEqual([
      {
        name: "Self",
        referrals: 2,
        production: 10,
        inferred_referral_type: "self",
      },
      {
        name: "Synthetic Alpha Dental",
        referrals: 1,
        production: 150,
        inferred_referral_type: "doctor",
      },
      {
        name: "Synthetic Beta Dental",
        referrals: 1,
        production: 25,
        inferred_referral_type: "doctor",
      },
      {
        name: "Synthetic Gamma Dental",
        referrals: 0,
        production: 5,
        inferred_referral_type: "doctor",
      },
    ]);
    expect(result.countSemantics).toEqual({
      referralCount: "unique_patient_global",
      sourceReferralCount: "unique_patient_per_source",
    });
    expect(result.requiresSanitization).toBe(false);
    expect(result.warnings).toHaveLength(2);
  });

  it("uses raw treatment dates for multiple months and target-month filtering", async () => {
    const rows = [
      dentalRow({ "Treatment Date": "04/30/2026", "Ins. Adj. Fee.": 10 }),
      dentalRow({
        "Treatment Date": "05/01/2026",
        Patient: "Synthetic Patient B",
        "Ins. Adj. Fee.": 20,
      }),
    ];

    const allMonths = await DentalEmrPmsParserService.parseRows({
      organizationId: 7,
      rows,
    });
    const mayOnly = await DentalEmrPmsParserService.parseRows({
      organizationId: 7,
      rows,
      targetMonth: "2026-05",
    });

    expect(allMonths.monthlyRollup.map((month) => month.month)).toEqual([
      "2026-04",
      "2026-05",
    ]);
    expect(mayOnly.monthlyRollup).toHaveLength(1);
    expect(mayOnly.monthlyRollup[0]).toMatchObject({
      month: "2026-05",
      production_total: 20,
    });
    expect(mayOnly.rawRows).toBe(rows);
  });

  it("parses tab-delimited pasted rows through the same accumulator", async () => {
    const rawText = [
      HEADERS.join("\t"),
      ["05/02/2026", "Done", "75.25", "Synthetic Patient A", "1endo"].join(
        "\t",
      ),
    ].join("\n");

    const result = await DentalEmrPmsParserService.parsePaste({
      organizationId: 7,
      rawText,
    });

    expect(result.monthlyRollup[0]).toMatchObject({
      month: "2026-05",
      total_referrals: 1,
      production_total: 75.25,
    });
    expect(result.rows[0]).toMatchObject({ source: "Self", referrals: 1 });
  });

  it("scans summary-first XLSX files and combines every matching raw sheet", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["Monthly summary"], ["Not raw data"]]),
      "Summary",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        HEADERS,
        ["04/01/2026", "Done", 10, "Synthetic Patient A", "Synthetic Alpha"],
      ]),
      "April Raw",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        HEADERS,
        ["05/01/2026", "Done", 20, "Synthetic Patient B", "Synthetic Beta"],
      ]),
      "May Raw",
    );
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const result = await DentalEmrPmsParserService.parseFile({
      organizationId: 7,
      targetMonth: "2026-05",
      file: multerFile(
        "synthetic-dentalemr.xlsx",
        buffer,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    });

    expect(result.selectedSheetNames).toEqual(["April Raw", "May Raw"]);
    expect(result.rawRows).toHaveLength(2);
    expect(result.monthlyRollup).toHaveLength(1);
    expect(result.monthlyRollup[0]).toMatchObject({
      month: "2026-05",
      total_referrals: 1,
      production_total: 20,
    });
  });

  it("supports CSV files and rejects missing required headers", async () => {
    const csv = [
      HEADERS.join(","),
      '"05/03/2026","Done","30","Synthetic Patient A","Synthetic Alpha"',
    ].join("\n");
    const result = await DentalEmrPmsParserService.parseFile({
      organizationId: 7,
      file: multerFile("synthetic.csv", Buffer.from(csv), "text/csv"),
    });

    expect(result.monthlyRollup[0].production_total).toBe(30);
    await expect(
      DentalEmrPmsParserService.parseRows({
        organizationId: 7,
        rows: [{ "Treatment Date": "05/03/2026", Status: "Done" }],
      }),
    ).rejects.toMatchObject({ code: "PMS_DENTALEMR_HEADERS_MISSING" });
  });

  it("rejects invalid target-month values", async () => {
    await expect(
      DentalEmrPmsParserService.parseRows({
        organizationId: 7,
        rows: [dentalRow()],
        targetMonth: "2026-13",
      }),
    ).rejects.toMatchObject({ code: "PMS_TARGET_MONTH_INVALID" });
  });

  it("rejects exports without completed treatments in scope", async () => {
    await expect(
      DentalEmrPmsParserService.parseRows({
        organizationId: 7,
        rows: [dentalRow({ Status: "Scheduled" })],
      }),
    ).rejects.toMatchObject({ code: "PMS_DENTALEMR_NO_QUALIFYING_ROWS" });
  });
});
