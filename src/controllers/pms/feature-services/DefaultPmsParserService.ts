import * as XLSX from "xlsx";
import type { ColumnMapping } from "../../../types/pmsMapping";
import { applyMapping } from "../../../utils/pms/applyColumnMapping";
import { signHeaders } from "../../../utils/pms/headerSignature";
import { resolveMapping } from "../../../utils/pms/resolveColumnMapping";
import { convertFileToJson } from "../pms-utils/file-converter.util";
import {
  ALLORO_TEMPLATE_SIGNATURE,
  parsePastedData,
  pasteTextToRecords,
} from "../pms-services/pms-paste-parse.service";
import {
  DEFAULT_COUNT_SEMANTICS,
  type PmsMappingMetadata,
  type PmsParseFileInput,
  type PmsParsePasteInput,
  type PmsParseRowsInput,
  type PmsParserResult,
} from "../feature-utils/pmsParserContract";
import { PmsParserError } from "../feature-utils/PmsParserError";
import { assertValidTargetMonth } from "../feature-utils/dentalEmrRows";
import {
  buildMonthlyRollupFromParsedRows,
  filterParserResultToMonth,
  flattenMonthlyRollup,
} from "../feature-utils/pmsParserResult";

const ALLORO_TEMPLATE_MAPPING: ColumnMapping = {
  headers: ["Treatment Date", "Source", "Type", "Production"],
  assignments: [
    { header: "Treatment Date", role: "date", confidence: 1 },
    { header: "Source", role: "source", confidence: 1 },
    { header: "Type", role: "type", confidence: 1 },
    { header: "Production", role: "production_total", confidence: 1 },
  ],
};

export class DefaultPmsParserService {
  static async parseRows(input: PmsParseRowsInput): Promise<PmsParserResult> {
    assertValidTargetMonth(input.targetMonth);
    if (input.rows.length === 0) {
      throw new PmsParserError(
        "PMS_PARSER_NO_ROWS",
        "PMS data must include at least one row.",
        400
      );
    }

    const headers = Object.keys(input.rows[0]);
    if (headers.length === 0) {
      throw new PmsParserError(
        "PMS_PARSER_NO_COLUMNS",
        "PMS data must include column headers.",
        400
      );
    }

    const resolved = await resolveMapping(
      input.organizationId,
      headers,
      input.rows.slice(0, 10)
    );
    const warnings: string[] = [];
    let monthlyRollup;
    try {
      monthlyRollup = applyMapping(input.rows, resolved.mapping, warnings);
    } catch (error) {
      throw new PmsParserError(
        "PMS_MAPPING_APPLY_FAILED",
        error instanceof Error
          ? error.message
          : "Could not apply the PMS column mapping.",
        400
      );
    }

    return filterParserResultToMonth(
      {
        parserType: "default" as const,
        requiresSanitization: true,
        rows: flattenMonthlyRollup(monthlyRollup),
        rawRows: input.rows,
        monthlyRollup,
        warnings,
        selectedSheetNames: [],
        mappingMetadata: resolved,
        countSemantics: DEFAULT_COUNT_SEMANTICS,
      },
      input.targetMonth
    );
  }

  static async parsePaste(input: PmsParsePasteInput): Promise<PmsParserResult> {
    assertValidTargetMonth(input.targetMonth);
    assertValidTargetMonth(input.fallbackMonth);
    const tokenized = pasteTextToRecords(input.rawText);
    const signature = signHeaders(tokenized.headers);

    if (signature !== ALLORO_TEMPLATE_SIGNATURE) {
      return this.parseRows({
        organizationId: input.organizationId,
        rows: tokenized.rows,
        targetMonth: input.targetMonth,
      });
    }

    const parsed = await parsePastedData(
      input.rawText,
      input.fallbackMonth ?? currentMonth(),
      input.organizationId
    );
    const monthlyRollup = buildMonthlyRollupFromParsedRows(parsed.rows);
    const mappingMetadata: PmsMappingMetadata = {
      mapping: ALLORO_TEMPLATE_MAPPING,
      source: "legacy-template",
      confidence: 1,
      signature,
    };

    return filterParserResultToMonth(
      {
        parserType: "default" as const,
        requiresSanitization: true,
        rows: parsed.rows,
        rawRows: tokenized.rows,
        monthlyRollup,
        warnings: parsed.warnings,
        selectedSheetNames: [],
        mappingMetadata,
        countSemantics: DEFAULT_COUNT_SEMANTICS,
      },
      input.targetMonth
    );
  }

  static async parseFile(input: PmsParseFileInput): Promise<PmsParserResult> {
    const rows = (await convertFileToJson(input.file)) as Record<string, unknown>[];
    const result = await this.parseRows({
      organizationId: input.organizationId,
      rows,
      targetMonth: input.targetMonth,
    });
    return {
      ...result,
      selectedSheetNames: selectedDefaultSheetNames(input.file),
    };
  }
}

function selectedDefaultSheetNames(file: Express.Multer.File): string[] {
  const fileName = file.originalname.toLowerCase();
  if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) return [];
  const workbook = XLSX.read(file.buffer, { type: "buffer" });
  return workbook.SheetNames[0] ? [workbook.SheetNames[0]] : [];
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
