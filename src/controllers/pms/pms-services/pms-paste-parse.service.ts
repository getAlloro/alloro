/**
 * PMS Paste-Parse Service
 *
 * Two-tier dispatch:
 *   Tier 1 (fast-path): if the pasted file's header signature matches the
 *     canonical Alloro 4-col template, run the legacy positional parser
 *     verbatim — guarantees byte-identical output for the existing path.
 *   Tier 2 (mapping system): for any other shape, parse rows into records
 *     keyed by header, then dispatch through the column-mapping resolver
 *     (org-cache → global-library → AI inference) and apply the resolved
 *     mapping to produce a `MonthlyRollupForJob`. The legacy `ParsedRow[]`
 *     return shape is reconstructed from the rollup so existing callers
 *     don't break.
 *
 * Stateless — no database writes (the resolver layer manages cache reads;
 * the upload-with-mapping endpoint owns the clone-on-confirm write).
 */

import { signHeaders } from "../../../utils/pms/headerSignature";
import { resolveMapping } from "../../../utils/pms/resolveColumnMapping";
import {
  applyMapping,
  type MonthlyRollupForJob,
} from "../../../utils/pms/applyColumnMapping";
import logger from "../../../lib/logger";

export interface ParsedRow {
  source: string;
  type: "self" | "doctor";
  referrals: number;
  production: number;
  month: string; // YYYY-MM
}

export interface PasteParseResult {
  rows: ParsedRow[];
  warnings: string[];
  rowsParsed: number;
  monthsDetected: number;
}

/**
 * Canonical Alloro template signature — the four-column "Treatment Date,
 * Source, Type, Production" shape that this service has parsed positionally
 * since v0. Computed once at module load so the fast-path test is O(1).
 */
const ALLORO_TEMPLATE_HEADERS = [
  "Treatment Date",
  "Source",
  "Type",
  "Production",
];
const ALLORO_TEMPLATE_SIGNATURE = signHeaders(ALLORO_TEMPLATE_HEADERS);

/**
 * Detect delimiter: tab (pasted from spreadsheet) or comma (CSV file).
 */
function detectDelimiter(line: string): "\t" | "," {
  return line.includes("\t") ? "\t" : ",";
}

/**
 * Parse a single CSV line respecting quoted fields.
 * Handles: "field with, comma" and "field with ""escaped"" quotes"
 * Only needed for comma-delimited CSV files — tab splits are safe as-is.
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote ("") or end of quoted field
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }

  fields.push(current);
  return fields;
}

/**
 * Split a data line into columns based on delimiter.
 * Tab-delimited: simple split (pasted from spreadsheet).
 * Comma-delimited: quote-aware CSV parsing (exported CSV files).
 */
function splitLine(line: string, delimiter: "\t" | ","): string[] {
  if (delimiter === "\t") {
    return line.split("\t").map((c) => c.trim());
  }
  return parseCSVLine(line).map((c) => c.trim());
}

/**
 * Parse a date string into YYYY-MM format.
 * Handles: MM/DD/YYYY, YYYY-MM-DD, "January 2025", "Jan 2025", etc.
 */
export function parseDateToMonth(dateStr: string, fallback: string): string {
  const trimmed = dateStr.trim();
  if (!trimmed) return fallback;

  // Try YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[\-\/](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}`;
  }

  // Try MM/DD/YYYY or M/D/YYYY
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    return `${usMatch[3]}-${usMatch[1].padStart(2, "0")}`;
  }

  // Try "Month Year" or "Mon Year" (e.g. "January 2025", "Jan 2025")
  const monthNames: Record<string, string> = {
    january: "01", jan: "01", february: "02", feb: "02", march: "03", mar: "03",
    april: "04", apr: "04", may: "05", june: "06", jun: "06",
    july: "07", jul: "07", august: "08", aug: "08", september: "09", sep: "09",
    october: "10", oct: "10", november: "11", nov: "11", december: "12", dec: "12",
  };
  const monthYearMatch = trimmed.match(/^([a-zA-Z]+)\s+(\d{4})/);
  if (monthYearMatch) {
    const mm = monthNames[monthYearMatch[1].toLowerCase()];
    if (mm) return `${monthYearMatch[2]}-${mm}`;
  }

  // Try M/YYYY
  const shortMatch = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (shortMatch) {
    return `${shortMatch[2]}-${shortMatch[1].padStart(2, "0")}`;
  }

  return fallback;
}

/**
 * Parse a production value string to number.
 * Strips $, commas, whitespace. Returns 0 for unparseable.
 */
function parseProduction(val: string): number {
  const cleaned = val.replace(/[$,\s]/g, "").trim();
  const num = Number(cleaned);
  return isNaN(num) ? 0 : Math.max(0, num);
}

/**
 * Clean special characters from a source name.
 * Keeps: letters, numbers, spaces, dots, commas, dashes, em dashes,
 * parentheses, ampersands, apostrophes, forward slashes.
 * Strips: asterisks, #, @, ~, ^, {, }, [, ], <, >, |, \, =, +, _, etc.
 * Collapses multiple spaces and trims.
 */
function cleanSourceName(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9\s.\,\-\—\(\)&'\/]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Normalize type string to "self" | "doctor".
 */
function parseType(val: string): "self" | "doctor" {
  const lower = val.toLowerCase().trim();
  if (lower === "doctor" || lower === "dr" || lower === "doc") return "doctor";
  return "self";
}

/**
 * Internal: split raw text into headers + rows-as-records keyed by header.
 * Used by the Tier 2 path (mapping system) and exported for callers that
 * need to reuse paste delimiter handling without going through positional
 * parsing (e.g. `uploadWithMapping` in PmsController).
 */
export function pasteTextToRecords(rawText: string): {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: "\t" | ",";
} {
  const lines = rawText.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw Object.assign(
      new Error("Data must have a header row and at least one data row"),
      { statusCode: 400 }
    );
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitLine(lines[0], delimiter).map((h) => h.trim());

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i], delimiter);
    const record: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = (cols[j] ?? "").toString();
    }
    rows.push(record);
  }

  return { headers, rows, delimiter };
}

/**
 * Tier 1 fast-path: legacy positional parser. Preserved verbatim from the
 * pre-mapping-system implementation so byte-identical output is guaranteed
 * for the canonical 4-col Alloro template.
 */
function parseAlloroTemplate(
  rawText: string,
  currentMonth: string
): PasteParseResult {
  const lines = rawText.split("\n").filter((l) => l.trim().length > 0);
  // Header + data row count is already validated by caller via pasteTextToRecords.

  const delimiter = detectDelimiter(lines[0]);
  const dataLines = lines.slice(1);

  logger.info(
    `[PMS-Paste] (tier1/template) Parsing ${dataLines.length} data rows ` +
      `(delimiter: ${delimiter === "\t" ? "TAB" : "COMMA"})`
  );

  const warnings: string[] = [];
  const rows: ParsedRow[] = [];
  const monthsSet = new Set<string>();

  for (let i = 0; i < dataLines.length; i++) {
    const cols = splitLine(dataLines[i], delimiter);

    // Need at least 4 columns: date, source, type, production
    if (cols.length < 4) {
      warnings.push(
        `Row ${i + 2}: skipped — expected 4 columns, got ${cols.length}`
      );
      continue;
    }

    const [dateStr, source, typeStr, productionStr] = cols;

    const month = parseDateToMonth(dateStr, currentMonth);
    const type = parseType(typeStr);
    const production = parseProduction(productionStr);

    monthsSet.add(month);
    rows.push({
      source: cleanSourceName(source) || "Unknown",
      type,
      referrals: 1, // each row = 1 referral
      production,
      month,
    });
  }

  if (rows.length === 0) {
    throw Object.assign(
      new Error(
        "No parseable data found. Make sure the pasted content has Date, Source, Type, Production columns."
      ),
      { statusCode: 400 }
    );
  }

  logger.info(
    `[PMS-Paste] (tier1/template) Parsed ${rows.length} rows across ${monthsSet.size} month(s)`
  );

  return {
    rows,
    warnings,
    rowsParsed: rows.length,
    monthsDetected: monthsSet.size,
  };
}

/**
 * Convert a `MonthlyRollupForJob` (the mapping-system output) back into the
 * legacy `ParsedRow[]` shape this service has historically returned. One
 * `ParsedRow` is emitted per (month, source) pair, with `referrals` and
 * `production` summed across the rollup. `type` is derived from the source's
 * `inferred_referral_type` (procedure-log adapter sets it; template adapter
 * leaves it unset, in which case we default to "self").
 */
function rollupToParsedRows(rollup: MonthlyRollupForJob): {
  rows: ParsedRow[];
  monthsDetected: number;
} {
  const out: ParsedRow[] = [];
  const monthsSet = new Set<string>();

  for (const monthEntry of rollup) {
    monthsSet.add(monthEntry.month);
    for (const src of monthEntry.sources) {
      const type: "self" | "doctor" =
        src.inferred_referral_type === "doctor" ? "doctor" : "self";
      out.push({
        source: src.name || "Unknown",
        type,
        referrals: src.referrals,
        production: src.production,
        month: monthEntry.month,
      });
    }
  }

  return { rows: out, monthsDetected: monthsSet.size };
}

/**
 * Parse pasted text. Dispatches to Tier 1 (Alloro template) or Tier 2
 * (mapping system) based on header signature.
 *
 * @param rawText - pasted spreadsheet/CSV content (with header row).
 * @param currentMonth - fallback month in YYYY-MM format used when a row's
 *   date can't be parsed.
 * @param orgId - optional org id for Tier 1 cache lookup. When omitted (or
 *   the caller doesn't have an authenticated org), the mapping system still
 *   runs but skips org-cache and falls through to global library + AI.
 */
export async function parsePastedData(
  rawText: string,
  currentMonth: string,
  orgId?: number
): Promise<PasteParseResult> {
  if (!rawText || rawText.trim().length === 0) {
    throw Object.assign(new Error("No data provided to parse"), {
      statusCode: 400,
    });
  }

  // Always tokenize first so we can inspect the header signature.
  const { headers, rows: rowRecords } = pasteTextToRecords(rawText);

  const signature = signHeaders(headers);

  // -----------------------------------------------------------------
  // Tier 1: Alloro 4-col template — legacy positional parser.
  // Byte-identical output to pre-mapping-system behavior.
  // -----------------------------------------------------------------
  if (signature === ALLORO_TEMPLATE_SIGNATURE) {
    return parseAlloroTemplate(rawText, currentMonth);
  }

  // -----------------------------------------------------------------
  // Tier 2: dispatch through the mapping system.
  // -----------------------------------------------------------------
  logger.info(
    `[PMS-Paste] (tier2/mapping) signature=${signature} headers=${headers.length} rows=${rowRecords.length} orgId=${orgId ?? "none"}`
  );

  // Resolver requires a numeric orgId — when the caller didn't pass one
  // (e.g. pre-existing /pms/parse-paste route ran without RBAC), fall back
  // to a sentinel that will miss every org-cache and proceed to global
  // library + AI inference. This preserves the resolver's tier ordering
  // without inventing a new "no-org" code path.
  const effectiveOrgId = orgId ?? -1;

  const resolved = await resolveMapping(
    effectiveOrgId,
    headers,
    rowRecords.slice(0, 10)
  );

  // Apply mapping to produce a MonthlyRollupForJob.
  let rollup: MonthlyRollupForJob;
  try {
    rollup = applyMapping(rowRecords, resolved.mapping);
  } catch (err) {
    // Invalid mapping (e.g. neither source nor referring_practice mapped,
    // or both mapped). Surface as a 400 so the UI can prompt the user to
    // fix the mapping in the side drawer.
    throw Object.assign(
      new Error(
        err instanceof Error
          ? err.message
          : "Could not apply column mapping to pasted data."
      ),
      { statusCode: 400 }
    );
  }

  const { rows: legacyRows, monthsDetected } = rollupToParsedRows(rollup);

  logger.info(
    `[PMS-Paste] (tier2/mapping) Produced ${legacyRows.length} parsed rows across ${monthsDetected} month(s) via ${resolved.source}`
  );

  return {
    rows: legacyRows,
    warnings: [],
    rowsParsed: legacyRows.length,
    monthsDetected,
  };
}

/**
 * Re-export the canonical signature so other services / tests can verify
 * Tier 1 behavior without recomputing it.
 */
export { ALLORO_TEMPLATE_SIGNATURE };

/**
 * `toNumber` helper exposed for external callers (mirrors the helper used
 * by `pmsAggregator.ts` and `productionFormula.ts`). Kept here as a
 * convenience export — not the canonical home; that remains pmsAggregator.
 */
export function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.\-]/g, "");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
