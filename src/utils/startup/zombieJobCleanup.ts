import db from "../../database/connection";
import logger from "../../lib/logger";

const ZOMBIE_THRESHOLD_MINUTES = 30;

export async function cleanupZombieJobs(): Promise<void> {
  try {
    const zombies = await db("pms_jobs")
      .whereRaw(
        `automation_status_detail::jsonb->>'status' = 'processing'
         AND automation_status_detail::jsonb->>'startedAt' IS NOT NULL
         AND (NOW() - (automation_status_detail::jsonb->>'startedAt')::timestamptz) > interval '${ZOMBIE_THRESHOLD_MINUTES} minutes'`,
      )
      .select("id", "organization_id", "location_id", "automation_status_detail");

    if (zombies.length === 0) {
      logger.info("[startup] No zombie jobs found");
      return;
    }

    logger.info(
      `[startup] Found ${zombies.length} zombie job(s) stuck in processing > ${ZOMBIE_THRESHOLD_MINUTES}min`,
    );

    for (const job of zombies) {
      await db("pms_jobs")
        .where("id", job.id)
        .update({
          automation_status_detail: db.raw(
            `jsonb_set(jsonb_set(automation_status_detail::jsonb, '{status}', '"failed"'), '{message}', '"Server restarted — run interrupted and marked failed on startup"')`,
          ),
        });

      logger.info(
        `[startup]   Reset job ${job.id} (org=${job.organization_id}, location=${job.location_id}) from processing → failed`,
      );
    }

    logger.info(`[startup] Zombie cleanup complete`);
  } catch (err: any) {
    logger.error(`[startup] Zombie cleanup failed: ${err.message}`);
  }
}
