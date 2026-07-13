import { pasteTextToRecords } from "../pms-services/pms-paste-parse.service";
import {
  DENTALEMR_COUNT_SEMANTICS,
  type PmsParseFileInput,
  type PmsParsePasteInput,
  type PmsParseRowsInput,
  type PmsParserResult,
} from "../feature-utils/pmsParserContract";
import { PmsParserError } from "../feature-utils/PmsParserError";
import {
  assertValidTargetMonth,
  canonicalizeDentalEmrRows,
} from "../feature-utils/dentalEmrRows";
import { accumulateDentalEmrRows } from "../feature-utils/dentalEmrAccumulator";
import { readDentalEmrFile } from "../feature-utils/dentalEmrFileAdapter";
import { flattenMonthlyRollup } from "../feature-utils/pmsParserResult";

export class DentalEmrPmsParserService {
  static async parseRows(input: PmsParseRowsInput): Promise<PmsParserResult> {
    assertValidTargetMonth(input.targetMonth);
    if (input.rows.length === 0) {
      throw new PmsParserError(
        "PMS_PARSER_NO_ROWS",
        "DentalEMR data must include at least one row.",
        400,
      );
    }

    const canonicalRows = canonicalizeDentalEmrRows(input.rows);
    const parsed = accumulateDentalEmrRows(canonicalRows, input.targetMonth);
    if (parsed.monthlyRollup.length === 0) {
      throw new PmsParserError(
        "PMS_DENTALEMR_NO_QUALIFYING_ROWS",
        input.targetMonth
          ? `No completed DentalEMR treatments were found for ${input.targetMonth}.`
          : "No completed DentalEMR treatments with valid dates were found.",
        400,
      );
    }
    return {
      parserType: "dentalemr",
      requiresSanitization: false,
      rows: flattenMonthlyRollup(parsed.monthlyRollup),
      rawRows: input.rows,
      monthlyRollup: parsed.monthlyRollup,
      warnings: parsed.warnings,
      selectedSheetNames: [],
      countSemantics: DENTALEMR_COUNT_SEMANTICS,
    };
  }

  static async parsePaste(input: PmsParsePasteInput): Promise<PmsParserResult> {
    const tokenized = pasteTextToRecords(input.rawText);
    return this.parseRows({
      organizationId: input.organizationId,
      rows: tokenized.rows,
      targetMonth: input.targetMonth,
    });
  }

  static async parseFile(input: PmsParseFileInput): Promise<PmsParserResult> {
    const fileRows = await readDentalEmrFile(input.file);
    const result = await this.parseRows({
      organizationId: input.organizationId,
      rows: fileRows.rawRows,
      targetMonth: input.targetMonth,
    });
    return {
      ...result,
      selectedSheetNames: fileRows.selectedSheetNames,
    };
  }
}
