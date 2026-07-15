import * as XLSX from "xlsx";
import { PmsParserError } from "./PmsParserError";

export const DENTALEMR_REQUIRED_HEADERS = [
  "Treatment Date",
  "Status",
  "Ins. Adj. Fee.",
  "Patient",
  "Referring Practice",
] as const;

export type DentalEmrRequiredHeader =
  (typeof DENTALEMR_REQUIRED_HEADERS)[number];

const REQUIRED_HEADER_BY_KEY = new Map(
  DENTALEMR_REQUIRED_HEADERS.map((header) => [normalizeHeader(header), header])
);

export function normalizeHeader(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function hasDentalEmrRequiredHeaders(headers: unknown[]): boolean {
  const keys = new Set(headers.map(normalizeHeader));
  return DENTALEMR_REQUIRED_HEADERS.every((header) =>
    keys.has(normalizeHeader(header))
  );
}

export function canonicalDentalEmrHeader(value: unknown): string {
  const rawHeader = String(value ?? "").trim();
  return REQUIRED_HEADER_BY_KEY.get(normalizeHeader(rawHeader)) ?? rawHeader;
}

export function canonicalizeDentalEmrRows(
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  if (rows.length === 0) return [];

  const headers = Object.keys(rows[0]);
  assertDentalEmrRequiredHeaders(headers);

  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([header, value]) => [
        canonicalDentalEmrHeader(header),
        value,
      ])
    )
  );
}

export function assertDentalEmrRequiredHeaders(headers: unknown[]): void {
  const keys = new Set(headers.map(normalizeHeader));
  const missing = DENTALEMR_REQUIRED_HEADERS.filter(
    (header) => !keys.has(normalizeHeader(header))
  );
  if (missing.length === 0) return;

  throw new PmsParserError(
    "PMS_DENTALEMR_HEADERS_MISSING",
    `DentalEMR data is missing required columns: ${missing.join(", ")}.`,
    400,
    { missingHeaders: missing }
  );
}

export function assertValidTargetMonth(targetMonth?: string): void {
  if (!targetMonth) return;
  const match = /^(\d{4})-(\d{2})$/.exec(targetMonth);
  const month = match ? Number(match[2]) : 0;
  if (match && month >= 1 && month <= 12) return;

  throw new PmsParserError(
    "PMS_TARGET_MONTH_INVALID",
    "Target month must use YYYY-MM format.",
    400
  );
}

export function parseDentalEmrMonth(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? formatMonth(parsed.y, parsed.m) : null;
  }

  const text = String(value ?? "").trim();
  if (!text) return null;

  const iso = /^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?/.exec(text);
  if (iso) return formatMonth(Number(iso[1]), Number(iso[2]));

  const us = /^(\d{1,2})\/(?:\d{1,2})\/(\d{4})/.exec(text);
  if (us) return formatMonth(Number(us[2]), Number(us[1]));

  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const parsed = XLSX.SSF.parse_date_code(Number(text));
    return parsed ? formatMonth(parsed.y, parsed.m) : null;
  }

  return null;
}

export function parseDentalEmrProduction(value: unknown): {
  value: number;
  isValid: boolean;
} {
  if (typeof value === "number") {
    return {
      value: Number.isFinite(value) ? value : 0,
      isValid: Number.isFinite(value),
    };
  }

  const raw = String(value ?? "").trim();
  if (!raw) return { value: 0, isValid: true };
  const isParentheticalNegative = /^\(.*\)$/.test(raw);
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return { value: 0, isValid: false };
  return {
    value: isParentheticalNegative ? -Math.abs(parsed) : parsed,
    isValid: true,
  };
}

export function normalizeDentalEmrSource(value: unknown): string {
  const stripped = String(value ?? "")
    .trim()
    .replace(/^\*+|\*+$/g, "")
    .trim();
  return !stripped || stripped.toLowerCase() === "1endo" ? "Self" : stripped;
}

function formatMonth(year: number, month: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  if (year < 1000 || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}
