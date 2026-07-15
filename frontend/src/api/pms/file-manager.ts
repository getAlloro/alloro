import { apiDelete, apiGet, apiPatch, apiPost } from "../index";
import type { AutomationStatusDetail, ManualMonthEntry } from "./types";

// =====================================================================
// PMS FILE MANAGER API FUNCTIONS
// =====================================================================

export type PmsFileMonthSlot = {
  month: string;
  status: "active" | "missing";
  jobId: number | null;
  fileName: string | null;
};

export type PmsFileManagerEvent = {
  id: string;
  pms_job_id: number;
  actor_user_id: number | null;
  actor_name: string | null;
  actor_email: string | null;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type PmsFileManagerFile = {
  id: number;
  organization_id: number | null;
  location_id: number | null;
  status: string;
  timestamp: string;
  is_approved: boolean;
  is_client_approved: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  deleted_reason: string | null;
  deleted_by_user_id: number | null;
  deleted_by_name: string | null;
  original_file_name: string | null;
  original_file_mime_type: string | null;
  original_file_size_bytes: number | string | null;
  has_original_file: boolean;
  uploaded_by_user_id: number | null;
  uploaded_by_name: string | null;
  uploaded_by_email: string | null;
  months: string[];
  original_months: string[];
  active_months: string[];
  superseded_months: string[];
  automation_status_detail: AutomationStatusDetail | null;
};

export type PmsFileManagerFileDetail = PmsFileManagerFile & {
  response_log: unknown;
  original_response_log: unknown;
  raw_input_data: unknown;
  events: PmsFileManagerEvent[];
};

export type PmsFileManagerResponse = {
  success: boolean;
  data?: {
    files: PmsFileManagerFile[];
    monthSlots: PmsFileMonthSlot[];
  };
  error?: string;
  code?: string;
};

export type PmsFileDetailResponse = {
  success: boolean;
  data?: { file: PmsFileManagerFileDetail };
  error?: string;
  code?: string;
};

export type PmsConflictPreviewResponse = {
  success: boolean;
  data?: {
    incomingMonths: string[];
    supersededMonths: Array<{
      month: string;
      jobId: number;
      fileName: string | null;
      timestamp: string;
    }>;
    monthSlots: PmsFileMonthSlot[];
  };
  error?: string;
  code?: string;
};

export type PmsUploadPreviewResponse = {
  success: boolean;
  data?: {
    originalFileName: string;
    recordsProcessed: number;
    parserType: "default" | "dentalemr";
    requiresSanitization: boolean;
    countSemantics: {
      referralCount: "additive" | "unique_patient_global";
      sourceReferralCount: "additive" | "unique_patient_per_source";
    };
    selectedSheetNames: string[];
    mappingSource?: string;
    headerSignature?: string;
    warnings: string[];
    monthlyRollup: ManualMonthEntry[];
    incomingMonths: string[];
    supersededMonths: Array<{
      month: string;
      jobId: number;
      fileName: string | null;
      timestamp: string;
    }>;
    monthSlots: PmsFileMonthSlot[];
  };
  error?: string;
  code?: string;
};

export type PmsDownloadUrlResponse = {
  success: boolean;
  data?: { url: string; expiresInSeconds: number };
  error?: string;
  code?: string;
};

export async function fetchPmsFileManager(
  locationId: number
): Promise<PmsFileManagerResponse> {
  return apiGet({
    path: `/pms/file-manager?locationId=${encodeURIComponent(locationId)}`,
  }) as Promise<PmsFileManagerResponse>;
}

export async function fetchPmsFileDetail(
  jobId: number,
  locationId: number
): Promise<PmsFileDetailResponse> {
  return apiGet({
    path: `/pms/file-manager/jobs/${jobId}?locationId=${encodeURIComponent(locationId)}`,
  }) as Promise<PmsFileDetailResponse>;
}

export async function previewPmsFileConflicts(
  months: string[],
  locationId: number
): Promise<PmsConflictPreviewResponse> {
  return apiPost({
    path: `/pms/file-manager/conflicts?locationId=${encodeURIComponent(locationId)}`,
    passedData: { months },
  }) as Promise<PmsConflictPreviewResponse>;
}

export async function previewPmsUploadFile(
  file: File,
  locationId: number,
  targetMonth?: string | null,
): Promise<PmsUploadPreviewResponse> {
  const formData = new FormData();
  formData.append("csvFile", file);
  formData.append("locationId", String(locationId));
  if (targetMonth) {
    formData.append("targetMonth", targetMonth);
  }

  return apiPost({
    path: "/pms/file-manager/upload-preview",
    passedData: formData,
    additionalHeaders: {
      Accept: "application/json",
    },
  }) as Promise<PmsUploadPreviewResponse>;
}

export async function fetchPmsOriginalFileUrl(
  jobId: number,
  locationId: number
): Promise<PmsDownloadUrlResponse> {
  return apiGet({
    path: `/pms/file-manager/jobs/${jobId}/download-url?locationId=${encodeURIComponent(locationId)}`,
  }) as Promise<PmsDownloadUrlResponse>;
}

export async function updatePmsFileManagerFile(
  jobId: number,
  locationId: number,
  responseLog: Record<string, unknown>
): Promise<PmsFileDetailResponse> {
  return apiPatch({
    path: `/pms/file-manager/jobs/${jobId}?locationId=${encodeURIComponent(locationId)}`,
    passedData: { responseLog },
  }) as Promise<PmsFileDetailResponse>;
}

export async function deletePmsFileManagerFile(
  jobId: number,
  locationId: number
): Promise<{ success: boolean; data?: { deleted: boolean }; error?: string; code?: string }> {
  return apiDelete({
    path: `/pms/file-manager/jobs/${jobId}?locationId=${encodeURIComponent(locationId)}`,
  }) as Promise<{ success: boolean; data?: { deleted: boolean }; error?: string; code?: string }>;
}

export type PmsRerunInsightsResponse = {
  success: boolean;
  data?: { rerunning: boolean; jobId: number };
  error?: string;
  code?: string;
};

/**
 * Explicitly re-run the monthly agent for the location's latest active job.
 * Backs the "Get updated insights" CTA on the stale-data alert.
 */
export async function rerunPmsInsights(
  locationId: number
): Promise<PmsRerunInsightsResponse> {
  return apiPost({
    path: `/pms/file-manager/rerun?locationId=${encodeURIComponent(locationId)}`,
    passedData: {},
  }) as Promise<PmsRerunInsightsResponse>;
}
