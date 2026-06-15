import { apiGet } from "../index";
import type {
  ActiveAutomationJobsResponse,
  AutomationStatusResponse,
  PmsPipelineResponse,
} from "./types";

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
