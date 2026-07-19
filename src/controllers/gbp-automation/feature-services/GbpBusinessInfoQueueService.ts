import { getGbpAutomationQueue } from "../../../workers/queues";
import type { IGbpWorkItem } from "../../../models/GbpWorkItemModel";

type QueueActor = {
  userId: number | null;
  actorEmail?: string | null;
};

const SCHEDULED_JOB_STATES = new Set([
  "active",
  "delayed",
  "prioritized",
  "waiting",
  "waiting-children",
]);

const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 30000 },
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: { age: 604800, count: 5000 },
};

/**
 * Owns BullMQ state recovery for business-info writes.
 *
 * A deterministic ID prevents duplicate jobs, but queue.add() does not revive a
 * retained failed/completed job. Recovery must inspect the existing job and move
 * finished jobs back to waiting explicitly.
 */
export class GbpBusinessInfoQueueService {
  static async ensureDeploymentScheduled(
    item: IGbpWorkItem,
    actor: QueueActor
  ): Promise<void> {
    await this.ensureScheduled({
      name: "deploy-business-info",
      data: {
        workItemId: item.id,
        userId: actor.userId,
        actorEmail: actor.actorEmail || null,
      },
      jobId: `gbp-business-info-${item.id}-${item.retry_count || 0}`,
    });
  }

  static async ensureRevertScheduled(
    item: IGbpWorkItem,
    actor: QueueActor
  ): Promise<void> {
    await this.ensureScheduled({
      name: "revert-business-info",
      data: {
        workItemId: item.id,
        userId: actor.userId,
        actorEmail: actor.actorEmail || null,
      },
      jobId: `gbp-business-info-revert-${item.id}`,
    });
  }

  private static async ensureScheduled(params: {
    name: "deploy-business-info" | "revert-business-info";
    data: {
      workItemId: string;
      userId: number | null;
      actorEmail: string | null;
    };
    jobId: string;
  }): Promise<void> {
    const queue = getGbpAutomationQueue("deployment");
    const existingJob = await queue.getJob(params.jobId);
    if (!existingJob) {
      await queue.add(params.name, params.data, {
        ...JOB_OPTIONS,
        jobId: params.jobId,
      });
      return;
    }

    const state = await existingJob.getState();
    if (state === "failed" || state === "completed") {
      await existingJob.retry(state);
      return;
    }
    if (SCHEDULED_JOB_STATES.has(state)) return;

    throw new Error(
      `Cannot recover BullMQ job ${params.jobId}: current state is ${state}.`
    );
  }
}
