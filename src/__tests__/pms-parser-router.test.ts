import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PmsParserResult } from "../controllers/pms/feature-utils/pmsParserContract";

const mocks = vi.hoisted(() => ({
  findPmsTypeById: vi.fn(),
  defaultParseRows: vi.fn(),
  defaultParsePaste: vi.fn(),
  defaultParseFile: vi.fn(),
  dentalParseRows: vi.fn(),
  dentalParsePaste: vi.fn(),
  dentalParseFile: vi.fn(),
}));

vi.mock("../models/OrganizationModel", () => ({
  OrganizationModel: { findPmsTypeById: mocks.findPmsTypeById },
}));

vi.mock(
  "../controllers/pms/feature-services/DefaultPmsParserService",
  () => ({
    DefaultPmsParserService: {
      parseRows: mocks.defaultParseRows,
      parsePaste: mocks.defaultParsePaste,
      parseFile: mocks.defaultParseFile,
    },
  })
);

vi.mock(
  "../controllers/pms/feature-services/DentalEmrPmsParserService",
  () => ({
    DentalEmrPmsParserService: {
      parseRows: mocks.dentalParseRows,
      parsePaste: mocks.dentalParsePaste,
      parseFile: mocks.dentalParseFile,
    },
  })
);

import { PmsParserRouterService } from "../controllers/pms/feature-services/PmsParserRouterService";

const defaultResult: PmsParserResult = {
  parserType: "default",
  requiresSanitization: true,
  rows: [],
  rawRows: [],
  monthlyRollup: [],
  warnings: [],
  selectedSheetNames: [],
  countSemantics: {
    referralCount: "additive",
    sourceReferralCount: "additive",
  },
};

const dentalResult: PmsParserResult = {
  ...defaultResult,
  parserType: "dentalemr",
  requiresSanitization: false,
  countSemantics: {
    referralCount: "unique_patient_global",
    sourceReferralCount: "unique_patient_per_source",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.defaultParseRows.mockResolvedValue(defaultResult);
  mocks.defaultParsePaste.mockResolvedValue(defaultResult);
  mocks.defaultParseFile.mockResolvedValue(defaultResult);
  mocks.dentalParseRows.mockResolvedValue(dentalResult);
  mocks.dentalParsePaste.mockResolvedValue(dentalResult);
  mocks.dentalParseFile.mockResolvedValue(dentalResult);
});

describe("PmsParserRouterService", () => {
  it("uses the organization value and ignores a client parser override", async () => {
    mocks.findPmsTypeById.mockResolvedValue({ pms_type: "default" });
    const input = {
      organizationId: 7,
      rows: [{ field: "value" }],
      pmsType: "dentalemr",
    };

    const result = await PmsParserRouterService.parseRows(input);

    expect(result.parserType).toBe("default");
    expect(mocks.defaultParseRows).toHaveBeenCalledWith(input);
    expect(mocks.dentalParseRows).not.toHaveBeenCalled();
  });

  it("routes file parsing to DentalEMR when the organization selects it", async () => {
    mocks.findPmsTypeById.mockResolvedValue({ pms_type: "dentalemr" });
    const input = {
      organizationId: 8,
      targetMonth: "2026-05",
      file: { originalname: "synthetic.xlsx" } as Express.Multer.File,
    };

    const result = await PmsParserRouterService.parseFile(input);

    expect(result.parserType).toBe("dentalemr");
    expect(mocks.dentalParseFile).toHaveBeenCalledWith(input);
    expect(mocks.defaultParseFile).not.toHaveBeenCalled();
  });

  it("falls unknown stored values back to the default parser", async () => {
    mocks.findPmsTypeById.mockResolvedValue({ pms_type: "future-parser" });

    await PmsParserRouterService.parsePaste({
      organizationId: 9,
      rawText: "Header\nValue",
    });

    expect(mocks.defaultParsePaste).toHaveBeenCalledOnce();
    expect(mocks.dentalParsePaste).not.toHaveBeenCalled();
  });

  it("rejects an organization id that does not resolve", async () => {
    mocks.findPmsTypeById.mockResolvedValue(undefined);

    await expect(
      PmsParserRouterService.parseRows({ organizationId: 404, rows: [] })
    ).rejects.toMatchObject({
      code: "PMS_ORGANIZATION_NOT_FOUND",
      statusCode: 404,
    });
  });
});
