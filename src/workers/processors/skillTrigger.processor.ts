import { Job } from "bullmq";
import { MindSkillModel, TriggerType } from "../../models/MindSkillModel";
import { SkillWorkRunModel } from "../../models/SkillWorkRunModel";
import { fireWorkCreationWebhook } from "../../controllers/minds/feature-services/service.minds-work-pipeline";
import logger from "../../lib/logger";

/**
 * Calculate the next run time based on trigger type and config.
 */
function calculateNextRunAt(
  triggerType: TriggerType,
  triggerConfig: { day?: string; time?: string; timezone?: string }
): Date | null {
  const now = new Date();
  const time = triggerConfig.time || "08:00";
  const [hours, minutes] = time.split(":").map(Number);

  switch (triggerType) {
    case "daily": {
      const next = new Date(now);
      next.setUTCHours(hours, minutes, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      return next;
    }
    case "weekly": {
      const next = new Date(now);
      next.setUTCHours(hours, minutes, 0, 0);
      next.setDate(next.getDate() + 7);
      return next;
    }
    case "day_of_week": {
      const dayMap: Record<string, number> = {
        sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
        thursday: 4, friday: 5, saturday: 6,
      };
      const targetDay = dayMap[(triggerConfig.day || "monday").toLowerCase()];
      if (targetDay === undefined) return null;

      const next = new Date(now);
      next.setUTCHours(hours, minutes, 0, 0);
      const currentDay = next.getUTCDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      next.setDate(next.getDate() + daysUntil);
      return next;
    }
    case "manual":
    default:
      return null;
  }
}

type DueSkill = Awaited<ReturnType<typeof MindSkillModel.findDueSkills>>[number];

// How many skills to fire concurrently. Each fires a webhook to n8n, so bound
// concurrency rather than running fully sequential (slow) or unbounded (thundering herd).
const SKILL_TRIGGER_CONCURRENCY = 5;

/**
 * Create the work run + fire the webhook for a single due skill.
 * Self-contained error handling so one bad skill never blocks the others.
 */
async function processSingleSkill(skill: DueSkill): Promise<void> {
  try {
    // Create work run
    const workRun = await SkillWorkRunModel.create({
      skill_id: skill.id,
      triggered_by: "schedule",
      status: "pending",
      artifact_type: skill.work_creation_type,
      artifact_attachment_type: skill.artifact_attachment_type || null,
    });

    logger.info(
      `[SKILL-TRIGGER] Created work run ${workRun.id} for skill "${skill.name}"`
    );

    // Fire webhook
    await fireWorkCreationWebhook(workRun.id, skill);

    // Update run timestamps
    const now = new Date();
    const nextRunAt = calculateNextRunAt(
      skill.trigger_type,
      skill.trigger_config
    );
    await MindSkillModel.updateRunTimestamps(skill.id, now, nextRunAt);
  } catch (err: any) {
    logger.error({ err: err }, `[SKILL-TRIGGER] Error processing skill "${skill.name}":`);
    // Don't stop processing other skills
  }
}

/**
 * Skill Trigger Processor — runs every 5 minutes.
 * Checks for skills due to fire and creates work runs. Fires in bounded batches so
 * total wall-time doesn't scale linearly with due-skill count and blow the lock.
 */
export async function processSkillTrigger(_job: Job): Promise<void> {
  logger.info("[SKILL-TRIGGER] Checking for due skills...");

  try {
    const dueSkills = await MindSkillModel.findDueSkills();

    if (dueSkills.length === 0) {
      logger.info("[SKILL-TRIGGER] No skills due.");
      return;
    }

    logger.info(`[SKILL-TRIGGER] Found ${dueSkills.length} due skill(s).`);

    for (let i = 0; i < dueSkills.length; i += SKILL_TRIGGER_CONCURRENCY) {
      const batch = dueSkills.slice(i, i + SKILL_TRIGGER_CONCURRENCY);
      await Promise.allSettled(batch.map((skill) => processSingleSkill(skill)));
    }
  } catch (err: any) {
    logger.error({ err: err }, "[SKILL-TRIGGER] Fatal error:");
    throw err;
  }
}

/**
 * Dead Letter Check Processor — runs every 10 minutes.
 * Finds work runs stuck in pending/running for > 15 minutes and marks them failed.
 */
export async function processDeadLetterCheck(job: Job): Promise<void> {
  logger.info("[DEAD-LETTER] Checking for stuck work runs...");

  try {
    const stuckRuns = await SkillWorkRunModel.findStuckRuns(15);

    if (stuckRuns.length === 0) {
      logger.info("[DEAD-LETTER] No stuck runs found.");
      return;
    }

    logger.info(`[DEAD-LETTER] Found ${stuckRuns.length} stuck run(s).`);

    for (const run of stuckRuns) {
      await SkillWorkRunModel.updateStatus(run.id, "failed", {
        error: "n8n_timeout",
      });
      logger.info(
        `[DEAD-LETTER] Marked run ${run.id} as failed (was ${run.status} since ${run.triggered_at})`
      );
    }
  } catch (err: any) {
    logger.error({ err: err }, "[DEAD-LETTER] Fatal error:");
    throw err;
  }
}
