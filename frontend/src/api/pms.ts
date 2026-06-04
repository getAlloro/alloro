import { apiDelete, apiGet, apiPatch, apiPost } from "./index";

// =====================================================================
// AUTOMATION STATUS TYPES
// =====================================================================

export type AutomationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "awaiting_approval";

export type StepStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "skipped";

export type StepKey =
  | "file_upload"
  | "pms_parser"
  | "admin_approval"
  | "client_approval"
  | "monthly_agents"
  | "task_creation"
  | "complete";

export type MonthlyAgentKey =
  | "data_fetch"
  | "summary_agent"
  | "referral_engine"
  | "opportunity_agent"
  | "cro_optimizer";

export interface StepDetail {
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  subStep?: MonthlyAgentKey;
  agentsCompleted?: MonthlyAgentKey[];
  currentAgent?: MonthlyAgentKey;
}

export interface AgentResult {
  success: boolean;
  resultId?: number;
  error?: string;
}

export interface TasksCreatedSummary {
  user: number;
  alloro: number;
  total: number;
}

export interface AutomationSummary {
  tasksCreated: TasksCreatedSummary;
  agentResults: {
    summary?: AgentResult;
    referral_engine?: AgentResult;
    opportunity?: AgentResult;
    cro_optimizer?: AgentResult;
  };
  duration?: string;
}

export interface AutomationStatusDetail {
  status: AutomationStatus;
  currentStep: StepKey;
  currentSubStep?: string;
  message: string;
  progress: number;
  steps: Record<StepKey, StepDetail>;
  summary?: AutomationSummary;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface AutomationStatusResponse {
  success: boolean;
  data?: {
    jobId: number;
    organization_id: number | null;
    jobStatus: string;
    isAdminApproved: boolean;
    isClientApproved: boolean;
    timestamp: string;
    automationStatus: AutomationStatusDetail | null;
  };
  error?: string;
  message?: string;
}

export interface ActiveAutomationJobsResponse {
  success: boolean;
  data?: {
    jobs: Array<{
      jobId: number;
      organization_id: number | null;
      jobStatus: string;
      isAdminApproved: boolean;
      isClientApproved: boolean;
      timestamp: string;
      automationStatus: AutomationStatusDetail | null;
    }>;
    count: number;
  };
  error?: string;
  message?: string;
}

// =====================================================================
// PIPELINE DEBUG MODAL TYPES
// =====================================================================

export interface PipelineAgentNode {
  agent_type: string;
  status: "success" | "pending" | "error" | "archived" | "missing";
  result_id: number | null;
  run_id: string | null;
  date_start: string | null;
  date_end: string | null;
  agent_input: Record<string, unknown> | null;
  agent_output: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string | null;
}

export interface PipelinePmsJob {
  id: number;
  organization_id: number | null;
  location_id: number | null;
  status: string;
  is_approved: boolean;
  is_client_approved: boolean;
  timestamp: string;
  response_log: Record<string, unknown> | null;
  automation_status_detail: AutomationStatusDetail | null;
}

export interface PmsPipelineResponse {
  success: boolean;
  pms_job?: PipelinePmsJob;
  agents?: PipelineAgentNode[];
  error?: string;
  message?: string;
}

// =====================================================================
// EXISTING TYPES
// =====================================================================

export interface PmsJob {
  id: number;
  time_elapsed: number | null;
  status: string;
  response_log: unknown;
  timestamp: string;
  is_approved: boolean;
  is_client_approved: boolean;
  organization_id?: number | null;
  location_name?: string | null;
  automation_status_detail?: AutomationStatusDetail | null;
}

export interface FetchPmsJobsParams {
  page?: number;
  status?: string[];
  isApproved?: boolean;
  organization_id?: number;
  location_id?: number;
}

export interface FetchPmsJobsResponse {
  success: boolean;
  data?: {
    jobs: PmsJob[];
    pagination: {
      page: number;
      perPage: number;
      total: number;
      totalPages: number;
      hasNextPage: boolean;
    };
    filters?: {
      statuses?: string[];
      isApproved?: boolean;
      organization_id?: number;
    };
  };
  error?: string;
  message?: string;
}

export interface PMSRecord {
  date: string;
  referral_type: string;
  referral_source?: string;
  production_amount: number;
  appointment_type?: string;
  treatment_category?: string;
  notes?: string;
}

export interface PMSUploadRequest {
  domain: string;
  file: File;
  pmsType?: string;
  locationId?: number | null;
  monthlyDataOverride?: ManualMonthEntry[];
}

export interface PMSUploadResponse {
  success: boolean;
  data?: {
    recordsProcessed: number;
    recordsStored: number;
    entryType?: "csv" | "manual";
    jobId?: number;
  };
  error?: string;
  message?: string;
}

// =====================================================================
// MANUAL ENTRY TYPES
// =====================================================================

export interface ManualSourceEntry {
  name: string;
  referrals: number;
  production: number;
  inferred_referral_type?: "self" | "doctor";
}

export interface ManualMonthEntry {
  month: string;
  self_referrals: number;
  doctor_referrals: number;
  total_referrals: number;
  production_total: number;
  sources: ManualSourceEntry[];
}

export interface PMSManualEntryRequest {
  domain: string;
  monthlyData: ManualMonthEntry[];
  locationId?: number | null;
}

export interface PmsKeyDataMonth {
  month: string;
  selfReferrals: number;
  doctorReferrals: number;
  totalReferrals: number;
  productionTotal: number;
  actualProductionTotal?: number;
  attributedProductionTotal?: number;
}

export interface PmsKeyDataSource {
  rank: number;
  name: string;
  referrals: number;
  production: number;
  percentage: number;
}

export interface PmsKeyDataResponse {
  success: boolean;
  data?: {
    organizationId: number;
    months: PmsKeyDataMonth[];
    sources: PmsKeyDataSource[];
    totals: {
      totalReferrals: number;
      totalProduction: number;
      totalAttributedProduction?: number;
    };
    stats: {
      jobCount: number;
      earliestJobTimestamp: string | null;
      latestJobTimestamp: string | null;
      distinctMonths: number;
      latestJobStatus: string | null;
      latestJobIsApproved: boolean | null;
      latestJobIsClientApproved: boolean | null;
      latestJobId: number | null;
      /** True when PMS data was edited/deleted after the last completed run. */
      insightsStale: boolean;
      /** ISO timestamp of the latest edit/delete event, or null. */
      lastDataChangeAt: string | null;
      /** ISO timestamp of the latest completed monthly-agent run, or null. */
      lastInsightsRunAt: string | null;
    };
    latestJobRaw: unknown;
  };
  error?: string;
  message?: string;
}

/**
 * Fetch paginated PMS job records
 */
export async function fetchPmsJobs(
  params: FetchPmsJobsParams = {}
): Promise<FetchPmsJobsResponse> {
  const query = new URLSearchParams();

  if (params.page && params.page > 1) {
    query.set("page", String(params.page));
  }

  if (params.status?.length) {
    query.set("status", params.status.join(","));
  }

  if (typeof params.isApproved === "boolean") {
    query.set("isApproved", params.isApproved ? "1" : "0");
  }

  if (params.organization_id) {
    query.set("organization_id", String(params.organization_id));
  }

  if (params.location_id) {
    query.set("location_id", String(params.location_id));
  }

  const queryString = query.toString();

  return apiGet({
    path: `/pms/jobs${queryString ? `?${queryString}` : ""}`,
  });
}

/**
 * Upload PMS data via CSV file
 * @param request - Contains clientId and file
 * @returns Promise with upload result
 */
export async function uploadPMSData(
  request: PMSUploadRequest
): Promise<PMSUploadResponse> {
  try {
    // Create FormData to send the file
    const formData = new FormData();
    formData.append("csvFile", request.file);
    formData.append("domain", request.domain);
    if (request.pmsType) {
      formData.append("pmsType", request.pmsType);
    }
    if (request.locationId) {
      formData.append("locationId", String(request.locationId));
    }
    if (request.monthlyDataOverride?.length) {
      formData.append("entryType", "file_with_edits");
      formData.append("manualData", JSON.stringify(request.monthlyDataOverride));
    }

    // Use apiPost with FormData support
    const result = await apiPost({
      path: "/pms/upload",
      passedData: formData,
      additionalHeaders: {
        Accept: "application/json",
      },
    });

    return result;
  } catch (error) {
    console.error("PMS upload API error:", error);
    return {
      success: false,
      error: "Failed to upload PMS data. Please try again.",
    };
  }
}

/**
 * Submit manually entered PMS data (no file upload)
 * Data goes directly to monthly agents, skipping admin/client approval
 * @param request - Contains domain and structured monthly data
 * @returns Promise with submission result
 */
export async function submitManualPMSData(
  request: PMSManualEntryRequest
): Promise<PMSUploadResponse> {
  try {
    const result = await apiPost({
      path: "/pms/upload",
      passedData: {
        domain: request.domain,
        manualData: request.monthlyData,
        entryType: "manual",
        locationId: request.locationId || undefined,
      },
      additionalHeaders: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    return result;
  } catch (error) {
    console.error("PMS manual entry API error:", error);
    return {
      success: false,
      error: "Failed to submit PMS data. Please try again.",
    };
  }
}

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
    console.error("PMS paste-parse API error:", error);
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
    console.error("PMS sanitize-paste API error:", error);
    return {
      success: false,
      error: "Failed to sanitize pasted data. Please try again.",
    };
  }
}

/**
 * Get PMS data summary for a client
 * @param clientId - Client identifier
 * @returns Promise with PMS data summary
 */
export async function getPMSDataSummary(clientId: string) {
  try {
    const response = await apiPost({
      path: "/pms/summary",
      passedData: { clientId },
      additionalHeaders: {
        Accept: "application/json",
      },
    });

    return response;
  } catch (error) {
    console.error("PMS summary API error:", error);
    return {
      success: false,
      error: "Failed to fetch PMS data summary.",
    };
  }
}

/**
 * Toggle or set the approval state for a PMS job
 */
export async function togglePmsJobApproval(jobId: number, isApproved: boolean) {
  return apiPatch({
    path: `/pms/jobs/${jobId}/approval`,
    passedData: { isApproved },
  });
}

/**
 * Persist updates to a PMS job response log
 */
export async function updatePmsJobResponse(
  jobId: number,
  responseLog: string | null
) {
  return apiPatch({
    path: `/pms/jobs/${jobId}/response`,
    passedData: { responseLog },
  });
}

export async function updatePmsJobClientApproval(
  jobId: number,
  isClientApproved: boolean
) {
  return apiPatch({
    path: `/pms/jobs/${jobId}/client-approval`,
    passedData: { isClientApproved },
  });
}

/**
 * Delete a PMS job entry permanently.
 */
export async function deletePmsJob(jobId: number) {
  return apiDelete({
    path: `/pms/jobs/${jobId}`,
  });
}

/**
 * Fetch PMS key data aggregation for an organization.
 */
export async function fetchPmsKeyData(
  organizationId?: number,
  locationId?: number | null
): Promise<PmsKeyDataResponse> {
  const params = new URLSearchParams();
  if (organizationId) params.set("organization_id", String(organizationId));
  if (locationId) params.set("location_id", String(locationId));
  const query = params.toString();
  return apiGet({
    path: `/pms/keyData${query ? `?${query}` : ""}`,
  }) as Promise<PmsKeyDataResponse>;
}

// =====================================================================
// AUTOMATION STATUS API FUNCTIONS
// =====================================================================

/**
 * Fetch automation status for a specific PMS job
 */
export async function fetchAutomationStatus(
  jobId: number
): Promise<AutomationStatusResponse> {
  return apiGet({
    path: `/pms/jobs/${jobId}/automation-status`,
  }) as Promise<AutomationStatusResponse>;
}

/**
 * Fetch the full agent pipeline (RE + Summary inputs/outputs) for one PMS job.
 * Backs the "View Pipeline" admin debug modal at /admin/ai-pms-automation.
 */
export async function fetchPmsPipeline(
  jobId: number
): Promise<PmsPipelineResponse> {
  return apiGet({
    path: `/admin/pms-jobs/${jobId}/pipeline`,
  }) as Promise<PmsPipelineResponse>;
}

/**
 * Fetch all active (non-completed) automation jobs
 */
export async function fetchActiveAutomationJobs(
  organizationId?: number,
  locationId?: number | null
): Promise<ActiveAutomationJobsResponse> {
  const params = new URLSearchParams();
  if (organizationId) params.set("organization_id", String(organizationId));
  if (locationId) params.set("location_id", String(locationId));
  const query = params.toString();
  return apiGet({
    path: `/pms/automation/active${query ? `?${query}` : ""}`,
  }) as Promise<ActiveAutomationJobsResponse>;
}

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
    mappingSource: string;
    headerSignature: string;
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
  locationId: number
): Promise<PmsUploadPreviewResponse> {
  const formData = new FormData();
  formData.append("csvFile", file);
  formData.append("locationId", String(locationId));

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

// =====================================================================
// RETRY TYPES AND API FUNCTIONS
// =====================================================================

export type RetryableStep = "pms_parser" | "monthly_agents";

export interface RetryStepResponse {
  success: boolean;
  message?: string;
  data?: {
    jobId: number;
    stepRetried: RetryableStep;
    organization_id?: number;
  };
  error?: string;
}

/**
 * Retry a failed automation step
 * @param jobId - The PMS job ID
 * @param stepToRetry - Either 'pms_parser' or 'monthly_agents'
 */
export async function retryPmsStep(
  jobId: number,
  stepToRetry: RetryableStep
): Promise<RetryStepResponse> {
  try {
    const result = await apiPost({
      path: `/pms/jobs/${jobId}/retry`,
      passedData: { stepToRetry },
    });
    return result as RetryStepResponse;
  } catch (error) {
    console.error("PMS retry API error:", error);
    return {
      success: false,
      error: "Failed to retry step. Please try again.",
    };
  }
}

/**
 * Restart a completed monthly agents run.
 * Deletes all data from the run and re-triggers from scratch.
 */
export type RestartPmsJobResponse = {
  success: boolean;
  message?: string;
  data?: { jobId: number; restarted: boolean; deletionCounts: Record<string, number> };
  error?: string;
};

export async function restartPmsJob(
  jobId: number
): Promise<RestartPmsJobResponse> {
  try {
    const result = await apiPost({
      path: `/pms/jobs/${jobId}/restart`,
      passedData: {},
    });
    return result as RestartPmsJobResponse;
  } catch (error) {
    console.error("PMS restart API error:", error);
    return {
      success: false,
      error: "Failed to restart run. Please try again.",
    };
  }
}

/**
 * Get the retryable step for a failed automation
 * Returns the step that can be retried based on current failure state
 */
export function getRetryableStep(
  automationStatus: AutomationStatusDetail | null
): RetryableStep | null {
  if (!automationStatus || automationStatus.status !== "failed") {
    return null;
  }

  const { currentStep, steps } = automationStatus;

  // Check if pms_parser failed
  if (currentStep === "pms_parser" || steps.pms_parser?.status === "failed") {
    return "pms_parser";
  }

  // Check if monthly_agents failed
  if (
    currentStep === "monthly_agents" ||
    steps.monthly_agents?.status === "failed"
  ) {
    return "monthly_agents";
  }

  return null;
}

// =====================================================================
// STEP CONFIGURATION (for UI display)
// =====================================================================

export const STEP_CONFIG: Record<StepKey, { label: string; icon: string }> = {
  file_upload: { label: "File Upload", icon: "📤" },
  pms_parser: { label: "PMS Parser", icon: "🔄" },
  admin_approval: { label: "Admin Approval", icon: "✅" },
  client_approval: { label: "Client Approval", icon: "✅" },
  monthly_agents: { label: "Monthly Agents", icon: "🤖" },
  task_creation: { label: "Task Creation", icon: "📋" },
  complete: { label: "Complete", icon: "✓" },
};

// Only the agents that actually run today appear here. Opportunity Agent
// and CRO Optimizer are intentionally omitted — they're disabled in the
// orchestrator (`if (false)` blocks). Keep them in the MonthlyAgentKey
// union type for back-compat with any legacy automation_status_detail
// rows that still list them in agentsCompleted.
export const MONTHLY_AGENT_CONFIG: Partial<Record<MonthlyAgentKey, { label: string }>> =
  {
    data_fetch: { label: "Fetching data" },
    summary_agent: { label: "Summary Agent" },
    referral_engine: { label: "Referral Engine" },
  };

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
