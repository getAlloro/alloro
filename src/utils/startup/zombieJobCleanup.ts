import { PmsJobModel } from "../../models/PmsJobModel";
import logger from "../../lib/logger";

const ZOMBIE_THRESHOLD_MINUTES = 30;

export async function cleanupZombieJobs(): Promise<void> {
  try {
    const zombies = await PmsJobModel.findZombieProcessingJobs(
      ZOMBIE_THRESHOLD_MINUTES,
    );

    if (zombies.length === 0) {
      logger.info("[startup] No zombie jobs found");
      return;
    }

    logger.info(
      `[startup] Found ${zombies.length} zombie job(s) stuck in processing > ${ZOMBIE_THRESHOLD_MINUTES}min`,
    );

    for (const job of zombies) {
      await PmsJobModel.markZombieFailed(job.id);

      logger.info(
        `[startup]   Reset job ${job.id} (org=${job.organization_id}, location=${job.location_id}) from processing → failed`,
      );
    }

    logger.info(`[startup] Zombie cleanup complete`);
  } catch (err: any) {
    logger.error(`[startup] Zombie cleanup failed: ${err.message}`);
  }
}
