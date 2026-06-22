/**
 * Pure helpers and shared constants for PMSManualEntryModal.
 * Moved verbatim from PMSManualEntryModal.tsx during decomposition.
 * No React, no hooks — pure parsing/formatting plus presentational color tokens.
 */

import { toYm } from "./pmsDataTransform";
import { formatDataMonth } from "../../utils/timeframe";
import type { MonthBucket } from "./types";
import type {
  ManualMonthEntry,
  MonthlyRollupMonth,
  PmsUploadPreviewResponse,
} from "../../api/pms";

export const ALORO_ORANGE = "#C9765E";
export const ALORO_ORANGE_DARK = "#D66853";
export type PmsUploadPreviewData = NonNullable<PmsUploadPreviewResponse["data"]>;

/**
 * State-machine CSV/TSV parser for the mapping-preview path.
 *
 * Handles:
 *   - Tab or comma delimiters (auto-detected from first line)
 *   - Quoted fields containing the delimiter (e.g. `"Diab, Zied"`)
 *   - Escaped quotes inside quoted fields (`""` → `"`)
 *   - LF and CRLF row endings
 *   - Newlines inside quoted fields (rare but legal)
 *   - Ragged rows (fewer cells than headers → undefined)
 *
 * The previous naive `split(delimiter)` implementation broke on the very
 * common case of practice-management exports that quote fields with commas
 * (Patient, Provider, Referring User on the Open Dental shape), causing the
 * mapping to read column N as column N+k for arbitrary k. Verified against
 * `Fredericksburg February 2026 - Raw Data.csv` (515 rows, 11 cols).
 */
export const parseTabularToRows = (
  raw: string
): { headers: string[]; rows: Record<string, unknown>[] } => {
  if (!raw.trim()) return { headers: [], rows: [] };

  const firstLineEnd = raw.indexOf("\n");
  const firstLine = firstLineEnd === -1 ? raw : raw.slice(0, firstLineEnd);
  const delimiter = firstLine.includes("\t") ? "\t" : ",";

  const allRows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote: "" → "
        if (raw[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      currentRow.push(currentField);
      currentField = "";
    } else if (ch === "\n" || ch === "\r") {
      // Skip the LF in CRLF
      if (ch === "\r" && raw[i + 1] === "\n") i++;
      currentRow.push(currentField);
      currentField = "";
      if (currentRow.some((c) => c.length > 0)) {
        allRows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += ch;
    }
  }

  // Flush final field/row
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((c) => c.length > 0)) {
      allRows.push(currentRow);
    }
  }

  if (allRows.length === 0) return { headers: [], rows: [] };

  const headers = allRows[0].map((h) => h.trim());
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < allRows.length; i++) {
    const cells = allRows[i];
    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return { headers, rows };
};

/**
 * Get the previous month in YYYY-MM format
 */
export const getPreviousMonth = (): string => {
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return toYm(prevMonth.getFullYear(), prevMonth.getMonth() + 1);
};

// Delegates to the shared timezone-safe labeler (utils/timeframe). Kept as a
// named re-export so existing call sites stay stable (§4.3).
export const formatMonthLabel = (month: string): string =>
  formatDataMonth(month);

export const formatMonthList = (months: string[]): string => {
  if (months.length === 0) return "none";
  return months.map(formatMonthLabel).join(", ");
};

export const monthlyRollupToBuckets = (
  rows: Array<MonthlyRollupMonth | ManualMonthEntry>
): MonthBucket[] => {
  return rows.map((m, i) => ({
    id: Date.now() + i,
    month: m.month,
    rows: m.sources.map((s, j) => ({
      id: Date.now() + i * 1000 + j,
      source: s.name,
      type: (s.inferred_referral_type as "self" | "doctor") || "self",
      referrals: String(s.referrals),
      production: String(s.production),
    })),
  }));
};
