import { apiGet, apiPost } from "../index";

// =====================================================================
// COLUMN MAPPING TYPES (mirrored from backend src/types/pmsMapping.ts)
// =====================================================================

export type ColumnRole =
  | "date"
  | "source"
  | "referring_practice"
  | "referring_doctor"
  | "patient"
  | "type"
  | "status"
  | "production_gross"
  | "production_net"
  | "production_total"
  | "writeoffs"
  | "ignore";

export interface ColumnAssignment {
  header: string;
  role: ColumnRole;
  confidence: number;
}

export interface ProductionFormulaOp {
  op: "+" | "-";
  column: string;
}

export interface ProductionFormula {
  target: "production_gross" | "production_net" | "production_total";
  ops: ProductionFormulaOp[];
}

export interface StatusFilter {
  column: string;
  includeValues: string[];
}

export interface ColumnMapping {
  headers: string[];
  assignments: ColumnAssignment[];
  productionFormula?: ProductionFormula;
  statusFilter?: StatusFilter;
}

export type MappingSource = "org-cache" | "global-library" | "ai-inference";

/**
 * Doctor-readable label map for column roles (used in mapping drawer dropdowns).
 */
export const ROLE_LABELS: Record<ColumnRole, string> = {
  date: "Date of Visit",
  source: "Referral Source",
  referring_practice: "Referring Practice / Doctor",
  referring_doctor: "Referring Doctor (extra)",
  patient: "Patient ID or Name",
  type: "Referral Type",
  status: "Visit Status",
  production_gross: "Amount Billed",
  production_net: "Amount Collected",
  production_total: "Production (already summed)",
  writeoffs: "Writeoffs / Adjustments",
  ignore: "(Don't use this column)",
};

/**
 * Per-source aggregated production within a month.
 * Mirrors backend MonthlyRollup row shape.
 */
export interface MonthlyRollupSource {
  name: string;
  referrals: number;
  production: number;
  inferred_referral_type?: "self" | "doctor";
}

/**
 * Per-month aggregation produced by the mapping pipeline.
 * Mirrors the structure stored in pms_jobs.response_log.monthly_rollup.
 */
export interface MonthlyRollupMonth {
  month: string;
  self_referrals: number;
  doctor_referrals: number;
  total_referrals: number;
  production_total: number;
  sources: MonthlyRollupSource[];
}

/**
 * Full rollup container for a single PMS job.
 */
export interface MonthlyRollupForJob {
  monthly_rollup: MonthlyRollupMonth[];
}

// =====================================================================
// COLUMN MAPPING API FUNCTIONS
// =====================================================================

export interface PreviewMappingResponse {
  success: boolean;
  data?: {
    mapping: ColumnMapping;
    source: MappingSource;
    confidence: number;
    parsedPreview: MonthlyRollupForJob | null;
    mappingError?: string;
    /** Optional data-quality messages surfaced by the procedure-log adapter
     *  (e.g., skipped zero/negative-production triplets). Type added 0.0.34. */
    dataQualityFlags?: string[];
  };
  error?: string;
  message?: string;
}

/**
 * Resolve a column mapping for a freshly-read file.
 * Backend dispatches: org-cache → global-library → AI inference (Haiku 4.5).
 *
 * If `overrideMapping` is provided, the backend skips resolution and re-applies
 * the user-edited mapping to `sampleRows` to recompute parsedPreview.
 */
export async function previewMapping(payload: {
  headers: string[];
  sampleRows: Record<string, unknown>[];
  overrideMapping?: ColumnMapping;
}): Promise<PreviewMappingResponse> {
  try {
    const result = await apiPost({
      path: "/pms/preview-mapping",
      passedData: payload,
      additionalHeaders: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    return result as PreviewMappingResponse;
  } catch (error) {
    console.error("PMS previewMapping API error:", error);
    return {
      success: false,
      error: "Failed to preview column mapping. Please try again.",
    };
  }
}

export interface UploadWithMappingResponse {
  success: boolean;
  data?: {
    jobId: number;
    monthlyRollup: MonthlyRollupForJob;
  };
  error?: string;
  message?: string;
}

/**
 * Upload PMS data using a resolved (and possibly user-edited) column mapping.
 * Skips n8n; runs parsing inline. Clones the mapping into the org cache on success.
 */
export async function uploadWithMapping(payload: {
  domain?: string;
  rows?: Record<string, unknown>[];
  pasteText?: string;
  mapping: ColumnMapping;
  month?: string;
  locationId?: number | null;
}): Promise<UploadWithMappingResponse> {
  try {
    const result = await apiPost({
      path: "/pms/upload-with-mapping",
      passedData: payload,
      additionalHeaders: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    return result as UploadWithMappingResponse;
  } catch (error) {
    console.error("PMS uploadWithMapping API error:", error);
    return {
      success: false,
      error: "Failed to upload PMS data. Please try again.",
    };
  }
}

export interface ReprocessJobResponse {
  success: boolean;
  data?: {
    jobId: number;
    monthlyRollup: MonthlyRollupForJob;
    mappingId: number;
  };
  error?: string;
  message?: string;
}

/**
 * Re-apply a (potentially edited) mapping to an existing job's raw rows.
 * Updates pms_jobs.column_mapping_id + response_log atomically.
 */
export async function reprocessJob(
  jobId: number,
  mapping: ColumnMapping
): Promise<ReprocessJobResponse> {
  try {
    const result = await apiPost({
      path: `/pms/jobs/${jobId}/reprocess`,
      passedData: { mapping },
      additionalHeaders: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    return result as ReprocessJobResponse;
  } catch (error) {
    console.error("PMS reprocessJob API error:", error);
    return {
      success: false,
      error: "Failed to reprocess job. Please try again.",
    };
  }
}

export interface CachedMappingResponse {
  success: boolean;
  data?: ColumnMapping | null;
  error?: string;
  message?: string;
}

/**
 * Look up an org's cached mapping for a given header signature.
 * Returns null when no cache entry exists.
 */
export async function getCachedMapping(
  signature: string
): Promise<CachedMappingResponse> {
  return apiGet({
    path: `/pms/mappings/cache?signature=${encodeURIComponent(signature)}`,
  }) as Promise<CachedMappingResponse>;
}

/**
 * TanStack Query keys for column-mapping endpoints.
 *
 * Kept co-located with the API module rather than the central queryClient
 * factory to avoid coupling the central key registry to a feature-flagged
 * mapping system. Promote into `lib/queryClient.ts` if mapping queries
 * become a cross-cutting concern (multiple consumers, invalidation cascade).
 */
export const PMS_MAPPING_QUERY_KEYS = {
  pmsMappingPreview: (signature: string) =>
    ["pms", "mapping-preview", signature] as const,
  pmsMappingCached: (orgId: number | null, signature: string) =>
    ["pms", "mapping-cached", orgId, signature] as const,
} as const;
