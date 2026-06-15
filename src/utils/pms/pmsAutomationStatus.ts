/**
 * PMS Automation Status Helper
 *
 * Utilities for tracking the progress of PMS file upload → monthly agents automation flow.
 * Status is stored in pms_jobs.automation_status_detail JSONB column.
 */

import { PmsJobModel } from "../../models/PmsJobModel";
import logger from "../../lib/logger";

// =====================================================================
// TYPE DEFINITIONS
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
  // For monthly_agents step
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

// =====================================================================
// STEP CONFIGURATION
// =====================================================================

export const STEP_CONFIG: Record<
  StepKey,
  { label: string; progressStart: number; progressEnd: number }
> = {
  file_upload: { label: "File Upload", progressStart: 0, progressEnd: 10 },
  pms_parser: { label: "PMS Parser", progressStart: 10, progressEnd: 20 },
  admin_approval: {
    label: "Admin Approval",
    progressStart: 20,
    progressEnd: 30,
  },
  client_approval: {
    label: "Client Approval",
    progressStart: 30,
    progressEnd: 40,
  },
  monthly_agents: {
    label: "Monthly Agents",
    progressStart: 40,
    progressEnd: 90,
  },
  task_creation: { label: "Task Creation", progressStart: 90, progressEnd: 98 },
  complete: { label: "Complete", progressStart: 98, progressEnd: 100 },
};

export const MONTHLY_AGENT_CONFIG: Record<
  MonthlyAgentKey,
  { label: string; progressOffset: number }
> = {
  data_fetch: { label: "Fetching data", progressOffset: 0 },
  summary_agent: { label: "Summary Agent", progressOffset: 10 },
  opportunity_agent: { label: "Opportunity Agent", progressOffset: 22 },
  cro_optimizer: { label: "CRO Optimizer", progressOffset: 34 },
  referral_engine: { label: "Referral Engine", progressOffset: 46 },
};

// =====================================================================
// HELPER FUNCTIONS
// =====================================================================

/**
 * Initialize automation status when a PMS file is uploaded
 */
export function createInitialStatus(): AutomationStatusDetail {
  const now = new Date().toISOString();
  return {
    status: "processing",
    currentStep: "file_upload",
    currentSubStep: "Uploading file",
    message: "Uploading file...",
    progress: 0,
    steps: {
      file_upload: { status: "processing", startedAt: now },
      pms_parser: { status: "pending" },
      admin_approval: { status: "pending" },
      client_approval: { status: "pending" },
      monthly_agents: { status: "pending", agentsCompleted: [] },
      task_creation: { status: "pending" },
      complete: { status: "pending" },
    },
    startedAt: now,
  };
}

/**
 * Calculate progress percentage based on current step and sub-step
 */
function calculateProgress(step: StepKey, subStep?: MonthlyAgentKey): number {
  const stepConfig = STEP_CONFIG[step];

  if (step === "monthly_agents" && subStep) {
    const agentConfig = MONTHLY_AGENT_CONFIG[subStep];
    return stepConfig.progressStart + agentConfig.progressOffset;
  }

  return stepConfig.progressStart;
}

/**
 * Get human-readable message for current step/substep
 */
function getMessage(
  step: StepKey,
  subStep?: string,
  customMessage?: string
): string {
  if (customMessage) return customMessage;

  const stepConfig = STEP_CONFIG[step];

  if (step === "monthly_agents" && subStep) {
    const agentKey = subStep as MonthlyAgentKey;
    const agentConfig = MONTHLY_AGENT_CONFIG[agentKey];
    if (agentConfig) {
      return `Running ${agentConfig.label}...`;
    }
  }

  switch (step) {
    case "file_upload":
      return "Uploading file...";
    case "pms_parser":
      return "Processing PMS data...";
    case "admin_approval":
      return "Awaiting admin review";
    case "client_approval":
      return "Awaiting client approval";
    case "monthly_agents":
      return "Running monthly agents...";
    case "task_creation":
      return "Creating tasks...";
    case "complete":
      return "Automation complete";
    default:
      return stepConfig.label;
  }
}

/**
 * Update automation status in database
 */
export async function updateAutomationStatus(
  jobId: number,
  updates: Partial<AutomationStatusDetail> & {
    step?: StepKey;
    subStep?: string;
    stepStatus?: StepStatus;
    agentCompleted?: MonthlyAgentKey;
    customMessage?: string;
  }
): Promise<void> {
  // Get current status
  const job = await PmsJobModel.findAutomationStatusDetailById(jobId);

  if (!job) {
    logger.error(`[PMS-AUTOMATION] Job ${jobId} not found`);
    return;
  }

  let currentStatus: AutomationStatusDetail;

  if (job.automation_status_detail) {
    currentStatus =
      typeof job.automation_status_detail === "string"
        ? JSON.parse(job.automation_status_detail)
        : job.automation_status_detail;
  } else {
    currentStatus = createInitialStatus();
  }

  const now = new Date().toISOString();

  // Update step status if provided
  if (updates.step) {
    const step = updates.step;

    // Mark current step
    currentStatus.currentStep = step;
    currentStatus.currentSubStep = updates.subStep;

    // Update step details
    if (!currentStatus.steps[step]) {
      currentStatus.steps[step] = { status: "pending" };
    }

    if (updates.stepStatus) {
      currentStatus.steps[step].status = updates.stepStatus;

      if (
        updates.stepStatus === "processing" &&
        !currentStatus.steps[step].startedAt
      ) {
        currentStatus.steps[step].startedAt = now;
      }

      if (updates.stepStatus === "completed") {
        currentStatus.steps[step].completedAt = now;
      }
    }

    // Handle monthly agents sub-step
    if (step === "monthly_agents") {
      if (updates.subStep) {
        currentStatus.steps[step].subStep = updates.subStep as MonthlyAgentKey;
        currentStatus.steps[step].currentAgent =
          updates.subStep as MonthlyAgentKey;
      }

      if (updates.agentCompleted) {
        if (!currentStatus.steps[step].agentsCompleted) {
          currentStatus.steps[step].agentsCompleted = [];
        }
        if (
          !currentStatus.steps[step].agentsCompleted!.includes(
            updates.agentCompleted
          )
        ) {
          currentStatus.steps[step].agentsCompleted!.push(
            updates.agentCompleted
          );
        }
      }
    }

    // Calculate progress
    currentStatus.progress = calculateProgress(
      step,
      updates.subStep as MonthlyAgentKey
    );

    // Update message
    currentStatus.message = getMessage(
      step,
      updates.subStep,
      updates.customMessage
    );
  }

  // Apply direct updates
  if (updates.status) currentStatus.status = updates.status;
  if (updates.message) currentStatus.message = updates.message;
  if (updates.progress !== undefined) currentStatus.progress = updates.progress;
  if (updates.summary) currentStatus.summary = updates.summary;
  if (updates.error) currentStatus.error = updates.error;
  if (updates.completedAt) currentStatus.completedAt = updates.completedAt;

  // Save to database
  await PmsJobModel.updateAutomationStatusDetailRaw(
    jobId,
    JSON.stringify(currentStatus),
  );

  logger.info(
    `[PMS-AUTOMATION] [${jobId}] Status updated: ${currentStatus.currentStep} - ${currentStatus.message} (${currentStatus.progress}%)`
  );
}

/**
 * Mark a step as completed and move to next step
 */
export async function completeStep(
  jobId: number,
  completedStep: StepKey,
  nextStep?: StepKey
): Promise<void> {
  await updateAutomationStatus(jobId, {
    step: completedStep,
    stepStatus: "completed",
  });

  if (nextStep) {
    await updateAutomationStatus(jobId, {
      step: nextStep,
      stepStatus:
        nextStep === "admin_approval" || nextStep === "client_approval"
          ? "pending"
          : "processing",
    });
  }
}

/**
 * Mark automation as awaiting approval (admin or client)
 */
export async function setAwaitingApproval(
  jobId: number,
  approvalType: "admin_approval" | "client_approval"
): Promise<void> {
  await updateAutomationStatus(jobId, {
    status: "awaiting_approval",
    step: approvalType,
    stepStatus: "pending",
    customMessage:
      approvalType === "admin_approval"
        ? "Awaiting admin review"
        : "Awaiting client approval",
  });
}

/**
 * Mark automation as failed
 */
export async function failAutomation(
  jobId: number,
  step: StepKey,
  errorMessage: string
): Promise<void> {
  const now = new Date().toISOString();

  await updateAutomationStatus(jobId, {
    status: "failed",
    step,
    stepStatus: "failed",
    error: errorMessage,
    customMessage: `Failed: ${errorMessage}`,
    completedAt: now,
  });
}

/**
 * Reset automation status to retry from a specific step
 * Clears error state, resets the target step and all subsequent steps
 */
export async function resetToStep(
  jobId: number,
  targetStep: StepKey
): Promise<void> {
  const job = await PmsJobModel.findAutomationStatusDetailById(jobId);

  if (!job) {
    logger.error(`[PMS-AUTOMATION] Job ${jobId} not found for reset`);
    return;
  }

  let currentStatus: AutomationStatusDetail;

  if (job.automation_status_detail) {
    currentStatus =
      typeof job.automation_status_detail === "string"
        ? JSON.parse(job.automation_status_detail)
        : job.automation_status_detail;
  } else {
    currentStatus = createInitialStatus();
  }

  const now = new Date().toISOString();

  // Define step order for determining which steps to reset
  const stepOrder: StepKey[] = [
    "file_upload",
    "pms_parser",
    "admin_approval",
    "client_approval",
    "monthly_agents",
    "task_creation",
    "complete",
  ];

  const targetIndex = stepOrder.indexOf(targetStep);

  // Reset target step and all subsequent steps
  for (let i = targetIndex; i < stepOrder.length; i++) {
    const stepKey = stepOrder[i];

    if (stepKey === targetStep) {
      // Reset target step to processing
      currentStatus.steps[stepKey] = {
        status: "processing",
        startedAt: now,
      };

      // Special handling for monthly_agents - reset agentsCompleted
      if (stepKey === "monthly_agents") {
        currentStatus.steps[stepKey].agentsCompleted = [];
        currentStatus.steps[stepKey].currentAgent = undefined;
        currentStatus.steps[stepKey].subStep = undefined;
      }
    } else {
      // Reset subsequent steps to pending
      currentStatus.steps[stepKey] = {
        status: "pending",
      };

      // Special handling for monthly_agents
      if (stepKey === "monthly_agents") {
        currentStatus.steps[stepKey].agentsCompleted = [];
      }
    }
  }

  // Update top-level status
  currentStatus.status = "processing";
  currentStatus.currentStep = targetStep;
  currentStatus.currentSubStep = undefined;
  currentStatus.progress = calculateProgress(targetStep);
  currentStatus.message = getMessage(
    targetStep,
    undefined,
    `Retrying ${STEP_CONFIG[targetStep].label}...`
  );
  currentStatus.error = undefined;
  currentStatus.completedAt = undefined;
  currentStatus.summary = undefined;

  // Save to database
  await PmsJobModel.updateAutomationStatusDetailRaw(
    jobId,
    JSON.stringify(currentStatus),
  );

  logger.info(
    `[PMS-AUTOMATION] [${jobId}] Reset to step: ${targetStep} for retry`
  );
}

/**
 * Complete the entire automation process
 */
export async function completeAutomation(
  jobId: number,
  summary: AutomationSummary
): Promise<void> {
  const now = new Date().toISOString();

  // Get current status to update all intermediate steps
  const job = await PmsJobModel.findAutomationStatusDetailById(jobId);

  let currentStatus: AutomationStatusDetail;

  if (job?.automation_status_detail) {
    currentStatus =
      typeof job.automation_status_detail === "string"
        ? JSON.parse(job.automation_status_detail)
        : job.automation_status_detail;
  } else {
    currentStatus = createInitialStatus();
  }

  // Mark monthly_agents as completed if it was processing
  if (currentStatus.steps.monthly_agents.status === "processing") {
    currentStatus.steps.monthly_agents.status = "completed";
    currentStatus.steps.monthly_agents.completedAt = now;
  }

  // Mark task_creation as completed if it was processing
  if (currentStatus.steps.task_creation.status === "processing") {
    currentStatus.steps.task_creation.status = "completed";
    currentStatus.steps.task_creation.completedAt = now;
  }

  // Mark complete step
  currentStatus.steps.complete.status = "completed";
  currentStatus.steps.complete.completedAt = now;

  // Update top-level status
  currentStatus.status = "completed";
  currentStatus.currentStep = "complete";
  currentStatus.progress = 100;
  currentStatus.message = `Complete - ${summary.tasksCreated.total} tasks created`;
  currentStatus.summary = summary;
  currentStatus.completedAt = now;

  // Save to database
  await PmsJobModel.updateAutomationStatusDetailRaw(
    jobId,
    JSON.stringify(currentStatus),
  );

  logger.info(
    `[PMS-AUTOMATION] [${jobId}] Automation completed - ${summary.tasksCreated.total} tasks created`
  );
}

/**
 * Get automation status for a job
 */
export async function getAutomationStatus(
  jobId: number
): Promise<AutomationStatusDetail | null> {
  const job = await PmsJobModel.findAutomationStatusDetailById(jobId);

  if (!job || !job.automation_status_detail) {
    return null;
  }

  return typeof job.automation_status_detail === "string"
    ? JSON.parse(job.automation_status_detail)
    : job.automation_status_detail;
}

/**
 * Initialize automation status for a new upload
 */
export async function initializeAutomationStatus(jobId: number): Promise<void> {
  const initialStatus = createInitialStatus();

  await PmsJobModel.updateAutomationStatusDetailRaw(
    jobId,
    JSON.stringify(initialStatus),
  );

  logger.info(`[PMS-AUTOMATION] [${jobId}] Automation status initialized`);
}
