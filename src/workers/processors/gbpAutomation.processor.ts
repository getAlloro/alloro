import { Job } from "bullmq";
import { GbpBusinessInfoDeploymentService } from "../../controllers/gbp-automation/feature-services/GbpBusinessInfoDeploymentService";
import { GbpLocalPostDeploymentService } from "../../controllers/gbp-automation/feature-services/GbpLocalPostDeploymentService";
import { GbpLocalPostDraftService } from "../../controllers/gbp-automation/feature-services/GbpLocalPostDraftService";
import { GbpLocalPostScheduleService } from "../../controllers/gbp-automation/feature-services/GbpLocalPostScheduleService";
import { GbpPublishedLocalPostService } from "../../controllers/gbp-automation/feature-services/GbpPublishedLocalPostService";
import { GbpReviewReplyService } from "../../controllers/gbp-automation/feature-services/GbpReviewReplyService";
import { GbpSyncSource } from "../../models/GbpSyncHealthModel";

export interface GbpAutomationJobData {
  workItemId?: string;
  userId?: number | null;
  actorEmail?: string | null;
  limit?: number;
  organizationId?: number;
  locationId?: number;
  syncSource?: GbpSyncSource;
}

export async function processGbpAutomationJob(
  job: Job<GbpAutomationJobData>
): Promise<void> {
  const maxAttempts = job.opts.attempts || 1;
  if (job.name === "deploy-review-reply") {
    if (!job.data.workItemId) throw new Error("Missing workItemId for GBP reply deploy.");
    await GbpReviewReplyService.deployNow(job.data.workItemId, job.data.userId || null, {
      isFinalAttempt: job.attemptsMade + 1 >= maxAttempts,
    });
    return;
  }

  if (job.name === "deploy-local-post") {
    if (!job.data.workItemId) throw new Error("Missing workItemId for GBP post deploy.");
    await GbpLocalPostDeploymentService.deployNow(job.data.workItemId, job.data.userId || null, {
      isFinalAttempt: job.attemptsMade + 1 >= maxAttempts,
    });
    return;
  }

  if (job.name === "deploy-business-info") {
    if (!job.data.workItemId) throw new Error("Missing workItemId for GBP business-info deploy.");
    await GbpBusinessInfoDeploymentService.deployNow(job.data.workItemId, job.data.userId || null, {
      isFinalAttempt: job.attemptsMade + 1 >= maxAttempts,
    });
    return;
  }

  if (job.name === "revert-business-info") {
    if (!job.data.workItemId) throw new Error("Missing workItemId for GBP business-info revert.");
    await GbpBusinessInfoDeploymentService.revertNow(job.data.workItemId, job.data.userId || null);
    return;
  }

  if (job.name === "generate-local-post") {
    if (!job.data.workItemId) throw new Error("Missing workItemId for GBP post generation.");
    await GbpLocalPostDraftService.completeQueuedGeneration({
      workItemId: job.data.workItemId,
      userId: job.data.userId || null,
      actorEmail: job.data.actorEmail || null,
    });
    return;
  }

  if (job.name === "scan-local-post-generation") {
    await GbpLocalPostScheduleService.processDueSettings(job.data.limit || 25);
    return;
  }

  if (job.name === "sync-local-posts") {
    await GbpPublishedLocalPostService.syncAll({
      organizationId: job.data.organizationId,
      locationId: job.data.locationId,
      limit: job.data.limit,
      syncSource: job.data.syncSource || "auto",
      jobId: job.id || null,
      jobName: job.name,
    });
    return;
  }

  throw new Error(`Unsupported GBP automation job: ${job.name}`);
}
