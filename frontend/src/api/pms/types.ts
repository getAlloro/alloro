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

export interface AutomationSummary {
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
  locationId?: number | null;
  targetMonth?: string | null;
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

/**
 * Per-month referral source as emitted by the aggregator inside each month.
 * Unranked and values may arrive as strings (raw monthly_rollup shape), so
 * consumers normalize with Number() before use.
 */
export interface PmsKeyDataMonthSource {
  name?: string;
  referrals?: number | string;
  production?: number | string;
}

export interface PmsKeyDataMonth {
  month: string;
  selfReferrals: number;
  doctorReferrals: number;
  totalReferrals: number;
  productionTotal: number;
  actualProductionTotal?: number;
  attributedProductionTotal?: number;
  /** Per-month referral sources (already returned by /pms/keyData). */
  sources?: PmsKeyDataMonthSource[];
  /** Upload job timestamp for the winning entry of this month. */
  timestamp?: string;
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
