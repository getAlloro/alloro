import { PmsJobModel } from "../../../models/PmsJobModel";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { notifyAdmins } from "../../../utils/core/notificationHelper";
import {
  completeStep,
  setAwaitingApproval,
  AutomationStatusDetail,
} from "../../../utils/pms/pmsAutomationStatus";
import logger from "../../../lib/logger";

/**
 * Get automation status for a job with auto-advancement logic.
 * If job status is "completed" but pms_parser is still "processing",
 * auto-advances to admin_approval and sends admin email.
 */
export async function getJobAutomationStatus(jobId: number) {
  const job = await PmsJobModel.findForAutomationStatusById(jobId);

  if (!job) {
    throw Object.assign(new Error("PMS job not found"), { statusCode: 404 });
  }

  // Parse automation status
  let automationStatus: AutomationStatusDetail | null = null;
  if (job.automation_status_detail) {
    automationStatus =
      typeof job.automation_status_detail === "string"
        ? JSON.parse(job.automation_status_detail)
        : job.automation_status_detail;
  }

  // Auto-advance: If job status is "completed" but pms_parser is still processing,
  // n8n has finished - advance to admin_approval awaiting
  if (
    job.status === "completed" &&
    automationStatus?.steps?.pms_parser?.status === "processing" &&
    !job.is_approved
  ) {
    await completeStep(jobId, "pms_parser", "admin_approval");
    await setAwaitingApproval(jobId, "admin_approval");

    // Send admin email notification that PMS output is ready for review
    try {
      let orgLabel = "Unknown";
      if (job.organization_id) {
        const org = await OrganizationModel.findById(job.organization_id);
        orgLabel = org?.name || `Org #${job.organization_id}`;
      }
      await notifyAdmins({
        summary: `PMS parser output is ready for admin review for ${orgLabel}`,
        newActionItems: 1,
        practiceRankingsCompleted: [],
        monthlyAgentsCompleted: [],
      });
      logger.info(
        `[PMS] Admin email sent for PMS job ${jobId} ready for review`
      );
    } catch (emailError: any) {
      logger.error({ err: emailError.message }, `[PMS] Failed to send admin email for PMS job ${jobId}:`);
      // Don't fail the request if email fails
    }

    // Refresh the automation status
    const updatedJob = await PmsJobModel.findAutomationStatusDetailById(jobId);
    if (updatedJob?.automation_status_detail) {
      automationStatus =
        typeof updatedJob.automation_status_detail === "string"
          ? JSON.parse(updatedJob.automation_status_detail)
          : updatedJob.automation_status_detail;
    }
  }

  return {
    jobId: job.id,
    organization_id: job.organization_id,
    jobStatus: job.status,
    isAdminApproved: job.is_approved === 1 || job.is_approved === true,
    isClientApproved:
      job.is_client_approved === 1 || job.is_client_approved === true,
    timestamp: job.timestamp,
    automationStatus: automationStatus,
  };
}

/**
 * Get all active (non-completed) PMS automation jobs.
 * Optionally filtered by organization and/or location.
 */
export async function getActiveJobs(
  organizationId?: number,
  locationId?: number
) {
  const jobs = await PmsJobModel.findActiveAutomationJobs(
    organizationId,
    locationId
  );

  const formattedJobs = jobs.map((job: any) => {
    let automationStatus: AutomationStatusDetail | null = null;
    if (job.automation_status_detail) {
      automationStatus =
        typeof job.automation_status_detail === "string"
          ? JSON.parse(job.automation_status_detail)
          : job.automation_status_detail;
    }

    return {
      jobId: job.id,
      organization_id: job.organization_id,
      jobStatus: job.status,
      isAdminApproved: job.is_approved === 1 || job.is_approved === true,
      isClientApproved:
        job.is_client_approved === 1 || job.is_client_approved === true,
      timestamp: job.timestamp,
      automationStatus: automationStatus,
    };
  });

  return {
    jobs: formattedJobs,
    count: formattedJobs.length,
  };
}
