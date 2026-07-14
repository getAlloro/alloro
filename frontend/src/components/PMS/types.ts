/**
 * UI-specific types for the redesigned PMSLatestJobEditor component
 */

/**
 * Represents a single source/referral row in the data entry grid
 */
export interface SourceRow {
  id: number; // Unique ID for React key
  source: string; // Source name (text input)
  type: "self" | "doctor"; // Referral type (from inferred_referral_type)
  referrals: string; // String for input field (number as string)
  production: string; // String for input field (formatted money)
}

/**
 * Represents a calendar month with all its sources
 */
export interface MonthBucket {
  id: number; // Unique ID for tracking (Date.now())
  month: string; // Format: YYYY-MM
  rows: SourceRow[]; // All sources for this month
  authoritativeTotalReferrals?: number;
  referralTotalMode?: "authoritative" | "derived";
}

/**
 * Calculated summary totals for a month
 */
export interface MonthSummary {
  selfReferrals: number;
  doctorReferrals: number;
  totalReferrals: number;
  productionTotal: number;
}

/**
 * Month/Year picker temporary state
 */
export interface MonthPickerState {
  isOpen: boolean;
  step: "month" | "year";
  selectedMonth: string | null; // MM (01-12)
  selectedYear?: number;
}

/**
 * Paste-parse request sent to POST /pms/parse-paste
 */
export interface PasteParseRequest {
  rawText: string;
  currentMonth: string; // YYYY-MM fallback
}

/**
 * A parsed row returned by the AI
 */
export interface ParsedPasteRow {
  source: string;
  type: "self" | "doctor";
  referrals: number;
  production: number;
}

/**
 * A parsed month bucket returned by the AI
 */
export interface ParsedPasteMonth {
  month: string; // YYYY-MM
  rows: ParsedPasteRow[];
}

/**
 * Full response from POST /pms/parse-paste
 */
export interface PasteParseResponse {
  success: boolean;
  data?: {
    months: ParsedPasteMonth[];
    warnings: string[];
    rowsParsed: number;
    monthsDetected: number;
  };
  error?: string;
}

/**
 * Info about a detected paste (before sending to AI)
 */
export interface PasteInfo {
  sizeKB: number;
  estimatedRows: number;
}
