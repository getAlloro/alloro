import { Job } from "bullmq";
import { GbpReviewReplyService } from "../../controllers/gbp-automation/feature-services/GbpReviewReplyService";

export interface GbpAutomationJobData {
  workItemId: string;
  userId: number | null;
  actorEmail?: string | null;
}

export async function processGbpAutomationJob(
  job: Job<GbpAutomationJobData>
): Promise<void> {
  if (job.name !== "deploy-review-reply") {
    throw new Error(`Unsupported GBP automation job: ${job.name}`);
  }

  const maxAttempts = job.opts.attempts || 1;
  await GbpReviewReplyService.deployNow(job.data.workItemId, job.data.userId, {
    isFinalAttempt: job.attemptsMade + 1 >= maxAttempts,
  });
}
