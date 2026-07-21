import axios from "axios";
import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import { PmsJobModel } from "../../../models/PmsJobModel";
import {
  createNotification,
} from "../../../utils/core/notificationHelper";
import {
  completeStep,
  updateAutomationStatus,
  setAwaitingApproval,
} from "../../../utils/pms/pmsAutomationStatus";
import { parseResponseLog } from "../pms-utils/pms-normalizer.util";
import { OrganizationLifecycleService } from "../../../services/OrganizationLifecycleService";
import { serviceTokenHeader } from "../../../config/serviceToken";
import logger from "../../../lib/logger";

/**
 * Admin approval workflow.
 * Validates constraints, updates approval, advances automation, creates notification.
 */
export async function approveByAdmin(jobId: number, requestedApproval: boolean) {
  const existingJob = await PmsJobModel.findForAdminApprovalById(jobId);

  if (!existingJob) {
    throw Object.assign(new Error("PMS job not found"), { statusCode: 404 });
  }

  if (existingJob.organization_id) {
    await OrganizationLifecycleService.assertActive(existingJob.organization_id);
  }

  if (existingJob.is_approved === 1 && !requestedApproval) {
    throw Object.assign(
      new Error("Approval status cannot be reverted once enabled"),
      { statusCode: 400 }
    );
  }

  const nextApprovalValue = requestedApproval ? 1 : 0;
  const alreadyHasApprovedStatus = existingJob.status === "approved";

  if (
    existingJob.is_approved === nextApprovalValue &&
    (nextApprovalValue === 0 || alreadyHasApprovedStatus)
  ) {
    // No change needed
    return {
      changed: false,
      job: {
        id: existingJob.id,
        time_elapsed: existingJob.time_elapsed,
        status: existingJob.status,
        response_log: parseResponseLog(existingJob.response_log),
        timestamp: existingJob.timestamp,
        is_approved: existingJob.is_approved === 1,
      },
    };
  }

  const updatePayload: Record<string, any> = {
    is_approved: nextApprovalValue,
  };

  if (nextApprovalValue === 1 && !alreadyHasApprovedStatus) {
    updatePayload.status = "approved";
  }

  await PmsJobModel.applyApprovalUpdate(jobId, updatePayload);

  // Update automation status: admin approved, move to client approval
  if (nextApprovalValue === 1) {
    // First, complete pms_parser step if it was still processing
    await completeStep(jobId, "pms_parser", "admin_approval");
    // Now complete admin_approval and move to client_approval
    await completeStep(jobId, "admin_approval", "client_approval");
    await setAwaitingApproval(jobId, "client_approval");
  }

  // Create notification for PMS approval
  if (nextApprovalValue === 1 && existingJob.organization_id) {
    await createNotification(
      existingJob.organization_id,
      "PMS Data Approved",
      "PMS data is now ingested and ready for your review",
      "pms",
      { jobId, timestamp: new Date() },
      { locationId: existingJob.location_id }
    );
  }

  const updatedJob = await PmsJobModel.findAdminApprovalSummaryById(jobId);

  return {
    changed: true,
    job: {
      id: updatedJob?.id,
      time_elapsed: updatedJob?.time_elapsed,
      status: updatedJob?.status,
      response_log: parseResponseLog(updatedJob?.response_log),
      timestamp: updatedJob?.timestamp,
      is_approved: updatedJob?.is_approved === 1,
    },
    nextApprovalValue,
  };
}

/**
 * Client approval workflow.
 * Updates client approval flag, advances automation, triggers monthly agents.
 */
export async function approveByClient(jobId: number, clientApproval: boolean) {
  const existingJob = await PmsJobModel.findForClientApprovalById(jobId);

  if (!existingJob) {
    throw Object.assign(new Error("PMS job not found"), { statusCode: 404 });
  }

  if (existingJob.organization_id) {
    await OrganizationLifecycleService.assertActive(existingJob.organization_id);
  }

  await PmsJobModel.setClientApprovalFlag(jobId, clientApproval);

  // Update automation status: client approved, start monthly agents
  if (clientApproval) {
    await completeStep(jobId, "client_approval", "monthly_agents");
    await updateAutomationStatus(jobId, {
      status: "processing",
      step: "monthly_agents",
      stepStatus: "processing",
      subStep: "data_fetch",
      customMessage: "Starting monthly agents - fetching data...",
    });
  }

  const updatedJob = await PmsJobModel.findClientApprovalResultById(jobId);

  // Trigger monthly agents when client approves PMS
  if (clientApproval && updatedJob) {
    logger.info(
      `[PMS] Client approved PMS job ${jobId} - triggering monthly agents`
    );

    try {
      // Get google connection via organization
      const account = updatedJob.organization_id
        ? await GoogleConnectionModel.findOneByOrganization(updatedJob.organization_id)
        : null;

      if (account) {
        // Trigger monthly agents
        await axios.post(
          `http://localhost:${
            process.env.PORT || 3000
          }/api/agents/monthly-agents-run`,
          {
            googleAccountId: account.id,
            force: true,
            pmsJobId: jobId,
            locationId: updatedJob.location_id,
          },
          { headers: serviceTokenHeader() }
        );

        logger.info(
          `[PMS] Monthly agents triggered successfully for org ${updatedJob.organization_id}`
        );
      } else {
        logger.warn(
          `[PMS] No google connection found for org ${updatedJob.organization_id}`
        );
      }
    } catch (triggerError: any) {
      logger.error(
        `[PMS] Error triggering monthly agents: ${triggerError.message}`
      );
      // Don't fail the approval if agent trigger fails
    }
  }

  return {
    job: {
      id: updatedJob?.id,
      time_elapsed: updatedJob?.time_elapsed,
      status: updatedJob?.status,
      response_log: parseResponseLog(updatedJob?.response_log),
      timestamp: updatedJob?.timestamp,
      is_approved: updatedJob?.is_approved === 1,
      is_client_approved:
        updatedJob?.is_client_approved === 1 ||
        updatedJob?.is_client_approved === true,
    },
    clientApproval,
  };
}
