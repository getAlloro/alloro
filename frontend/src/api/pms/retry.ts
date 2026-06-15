import { apiPost } from "../index";
import type { AutomationStatusDetail } from "./types";

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
