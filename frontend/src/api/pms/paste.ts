import { apiPost } from "../index";
import { logger } from "../../lib/logger";

// =====================================================================
// PASTE-PARSE TYPES AND API FUNCTION
// =====================================================================

export interface SanitizationRow {
  source: string;
  type: "self" | "doctor";
  referrals: number;
  production: number;
  month: string;
}

export interface PasteParseApiResponse {
  success: boolean;
  data?: {
    rows: SanitizationRow[];
    warnings: string[];
    rowsParsed: number;
    monthsDetected: number;
  };
  error?: string;
}

/**
 * Send pasted text batch for JS parsing (fixed columns: Date, Source, Type, Production).
 */
export async function parsePastedData(
  rawText: string,
  currentMonth: string
): Promise<PasteParseApiResponse> {
  try {
    const result = await apiPost({
      path: "/pms/parse-paste",
      passedData: { rawText, currentMonth },
      additionalHeaders: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    return result as PasteParseApiResponse;
  } catch (error) {
    logger.error("PMS paste-parse API error:", error);
    return {
      success: false,
      error: "Failed to parse pasted data. Please try again.",
    };
  }
}

// =====================================================================
// PASTE SANITIZATION TYPES AND API FUNCTION
// =====================================================================

export interface MergeGroup {
  canonicalName: string;
  canonicalType: "self" | "doctor";
  sourceNames: string[];
  rows: SanitizationRow[];
}

export interface SanitizationStats {
  totalInputRows: number;
  exactGroupsMerged: number;
  fuzzyGroupsFound: number;
  fuzzyGroupsConfirmed: number;
  uniqueSourcesAfter: number;
}

export interface PasteSanitizeApiResponse {
  success: boolean;
  data?: {
    allRows: SanitizationRow[];
    mergeGroups: MergeGroup[];
    reasoning: string[];
    warnings: string[];
    stats: SanitizationStats;
  };
  error?: string;
}

/**
 * Deduplicate and sanitize parsed PMS rows (exact + AI fuzzy dedup).
 */
export async function sanitizePastedData(
  rows: SanitizationRow[]
): Promise<PasteSanitizeApiResponse> {
  try {
    const result = await apiPost({
      path: "/pms/sanitize-paste",
      passedData: { rows },
      additionalHeaders: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    return result as PasteSanitizeApiResponse;
  } catch (error) {
    logger.error("PMS sanitize-paste API error:", error);
    return {
      success: false,
      error: "Failed to sanitize pasted data. Please try again.",
    };
  }
}
