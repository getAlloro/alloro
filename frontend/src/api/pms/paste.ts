import { apiPost } from "../index";
import { logger } from "../../lib/logger";
import type { ManualMonthEntry } from "./types";

type CanonicalApiError = {
  code: string;
  message: string;
  details: unknown;
};

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
    parserType: "default" | "dentalemr";
    requiresSanitization: boolean;
    rows: SanitizationRow[];
    monthlyRollup: ManualMonthEntry[];
    warnings: string[];
    rowsParsed: number;
    monthsDetected: number;
  };
  error?: string | CanonicalApiError;
}

/**
 * Send the complete pasted dataset for organization-routed parsing.
 */
export async function parsePastedData(
  rawText: string,
  currentMonth: string,
  targetMonth?: string | null,
): Promise<PasteParseApiResponse> {
  try {
    const result = await apiPost({
      path: "/pms/parse-paste",
      passedData: {
        rawText,
        currentMonth,
        targetMonth: targetMonth || undefined,
      },
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

export type PasteUploadRequest = {
  rawText: string;
  currentMonth: string;
  targetMonth?: string | null;
  domain: string;
  locationId?: number | null;
  monthlyDataOverride: ManualMonthEntry[];
};

export type PasteUploadResponse =
  | {
      success: true;
      data: {
        jobId: number;
        recordsProcessed: number;
        recordsStored: number;
        entryType: "paste";
        parserType: "default" | "dentalemr";
      };
      error: null;
    }
  | { success: false; data: null; error: CanonicalApiError };

export async function uploadPastedData(
  request: PasteUploadRequest,
): Promise<PasteUploadResponse> {
  try {
    return (await apiPost({
      path: "/pms/upload-paste",
      passedData: request,
      additionalHeaders: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    })) as PasteUploadResponse;
  } catch (error) {
    logger.error("PMS paste upload API error:", error);
    return {
      success: false,
      data: null,
      error: {
        code: "PMS_PASTE_UPLOAD_FAILED",
        message: "Failed to upload pasted data. Please try again.",
        details: null,
      },
    };
  }
}

/**
 * Deduplicate and sanitize parsed PMS rows (exact + AI fuzzy dedup).
 */
export async function sanitizePastedData(
  rows: SanitizationRow[],
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
