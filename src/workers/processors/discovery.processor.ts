import { Job } from "bullmq";
import { MindModel } from "../../models/MindModel";
import { runDiscoveryForMind } from "../../controllers/minds/feature-services/service.minds-discovery";
import logger from "../../lib/logger";

interface DiscoveryJobData {
  mindId?: string; // If provided, run for specific mind; otherwise run for all
}

export async function processDiscovery(job: Job<DiscoveryJobData>): Promise<void> {
  logger.info("[MINDS-WORKER] Starting discovery job");

  const { mindId } = job.data;

  if (mindId) {
    // Run for specific mind
    try {
      const result = await runDiscoveryForMind(mindId);
      logger.info(
        `[MINDS-WORKER] Discovery for mind ${mindId}: ${result.newPostsCount} new posts, ${result.errors.length} errors`
      );
    } catch (err: any) {
      logger.error({ err: err }, `[MINDS-WORKER] Discovery failed for mind ${mindId}:`);
    }
    return;
  }

  // Run for all minds
  const minds = await MindModel.listAll();
  for (const mind of minds) {
    try {
      const result = await runDiscoveryForMind(mind.id);
      logger.info(
        `[MINDS-WORKER] Discovery for ${mind.name}: ${result.newPostsCount} new posts, ${result.errors.length} errors`
      );
    } catch (err: any) {
      logger.error({ err: err }, `[MINDS-WORKER] Discovery failed for ${mind.name}:`);
    }
  }

  logger.info("[MINDS-WORKER] Discovery job completed");
}
