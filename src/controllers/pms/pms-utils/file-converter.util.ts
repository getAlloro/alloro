import * as XLSX from "xlsx";
import csv from "csvtojson";

/**
 * Convert an Excel buffer (XLSX/XLS) to CSV string.
 */
export function convertExcelToCsv(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw Object.assign(new Error("No sheet found in Excel file"), {
      statusCode: 400,
    });
  }
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_csv(worksheet);
}

/**
 * Convert a CSV string to a JSON array using csvtojson.
 */
export async function convertCsvToJson(csvData: string): Promise<any[]> {
  return csv().fromString(csvData);
}

/**
 * Convert a multer file buffer to JSON array.
 * Handles CSV, XLSX, and XLS formats.
 */
export async function convertFileToJson(file: Express.Multer.File): Promise<any[]> {
  const fileName = file.originalname.toLowerCase();
  let csvData: string;

  if (fileName.endsWith(".csv")) {
    csvData = file.buffer.toString("utf-8");
  } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    csvData = convertExcelToCsv(file.buffer);
  } else {
    throw Object.assign(new Error("Unsupported file type"), {
      statusCode: 400,
    });
  }

  const jsonData = await convertCsvToJson(csvData);

  if (!jsonData) {
    throw Object.assign(new Error("Failed to convert file data to JSON"), {
      statusCode: 500,
    });
  }

  return jsonData;
}
