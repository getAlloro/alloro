import * as XLSX from "xlsx";
import { convertCsvToJson } from "../pms-utils/file-converter.util";
import { PmsParserError } from "./PmsParserError";
import {
  canonicalDentalEmrHeader,
  hasDentalEmrRequiredHeaders,
} from "./dentalEmrRows";

export interface DentalEmrFileRows {
  rawRows: Record<string, unknown>[];
  selectedSheetNames: string[];
}

export async function readDentalEmrFile(
  file: Express.Multer.File
): Promise<DentalEmrFileRows> {
  const fileName = file.originalname.toLowerCase();
  if (fileName.endsWith(".csv")) {
    const converted: unknown = await convertCsvToJson(
      file.buffer.toString("utf-8")
    );
    return {
      rawRows: Array.isArray(converted) ? converted.filter(isRecord) : [],
      selectedSheetNames: [],
    };
  }

  if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
    throw new PmsParserError(
      "PMS_FILE_TYPE_UNSUPPORTED",
      "PMS files must be CSV, XLS, or XLSX.",
      400
    );
  }

  return readDentalEmrWorkbook(file.buffer);
}

export function readDentalEmrWorkbook(buffer: Buffer): DentalEmrFileRows {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const rawRows: Record<string, unknown>[] = [];
  const selectedSheetNames: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: null,
      raw: true,
    });
    const headerRowIndex = matrix.findIndex((row) =>
      hasDentalEmrRequiredHeaders(row)
    );
    if (headerRowIndex < 0) continue;

    selectedSheetNames.push(sheetName);
    const headers = matrix[headerRowIndex].map(canonicalDentalEmrHeader);
    rawRows.push(...recordsFromMatrix(matrix.slice(headerRowIndex + 1), headers));
  }

  if (selectedSheetNames.length === 0) {
    throw new PmsParserError(
      "PMS_DENTALEMR_RAW_SHEET_NOT_FOUND",
      "No DentalEMR raw-data worksheet with the required columns was found.",
      400
    );
  }

  return { rawRows, selectedSheetNames };
}

function recordsFromMatrix(
  rows: unknown[][],
  headers: string[]
): Record<string, unknown>[] {
  return rows
    .filter((row) => row.some((value) => value !== null && value !== ""))
    .map((row) =>
      Object.fromEntries(
        headers
          .map((header, index) => [header, row[index] ?? ""] as const)
          .filter(([header]) => Boolean(header))
      )
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
