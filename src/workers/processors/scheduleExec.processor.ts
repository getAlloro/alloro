/**
 * Schedule Exec Processor
 *
 * Executes a single due schedule's agent handler. Dispatched by the scheduler
 * tick (scheduler.processor.ts) onto the `minds-schedule-exec` queue. Lives on
 * its own queue/worker with a long lock so multi-minute agent runs never stall
 * the 60s scheduler tick. Owns the `schedule_runs` lifecycle and the
 * `next_run_at` advance (one row + one advance per execution).
 */

import { Job } from "bullmq";
import { CronExpressionParser } from "cron-parser";
import { ScheduleModel, ScheduleRunModel, ISchedule } from "../../models/ScheduleModel";
import { getAgentHandler } from "../../services/agentRegistry";

interface ScheduleExecJobData {
  scheduleId: number;
}

function computeNextRunAt(schedule: ISchedule): Date {
  if (schedule.schedule_type === "cron" && schedule.cron_expression) {
    const interval = CronExpressionParser.parse(schedule.cron_expression, {
      currentDate: new Date(),
      tz: schedule.timezone || "UTC",
    });
    return interval.next().toDate();
  }

  if (schedule.schedule_type === "interval_days" && schedule.interval_days) {
    return new Date(Date.now() + schedule.interval_days * 24 * 60 * 60 * 1000);
  }

  // Fallback: 24 hours from now
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

export async function processScheduleExec(job: Job<ScheduleExecJobData>): Promise<void> {
  const { scheduleId } = job.data;

  const schedule = await ScheduleModel.findById(scheduleId);
  if (!schedule) {
    console.warn(`[SCHEDULE-EXEC] Schedule ${scheduleId} not found — skipping`);
    return;
  }

  // Re-check at execution time. The dispatcher already guards, but the exec queue
  // may lag, so guard again to keep at-most-one active run per schedule.
  const isRunning = await ScheduleRunModel.hasActiveRun(scheduleId);
  if (isRunning) {
    console.log(`[SCHEDULE-EXEC] Schedule ${scheduleId} already running — skipping`);
    return;
  }

  const agent = getAgentHandler(schedule.agent_key);
  if (!agent) {
    console.error(`[SCHEDULE-EXEC] No handler registered for agent_key "${schedule.agent_key}"`);
    return;
  }

  console.log(`[SCHEDULE-EXEC] Executing "${schedule.agent_key}" (${agent.displayName})`);

  const run = await ScheduleRunModel.createRun(schedule.id);

  try {
    const result = await agent.handler();

    await ScheduleRunModel.completeRun(run.id, result.summary);

    const nextRunAt = computeNextRunAt(schedule);
    await ScheduleModel.updateById(schedule.id, {
      last_run_at: new Date(),
      next_run_at: nextRunAt,
    });

    console.log(`[SCHEDULE-EXEC] "${schedule.agent_key}" completed. Next run: ${nextRunAt.toISOString()}`);
  } catch (error: any) {
    console.error(`[SCHEDULE-EXEC] "${schedule.agent_key}" failed:`, error.message);
    await ScheduleRunModel.failRun(run.id, error.message || String(error));

    // Still advance next_run_at so we don't retry immediately.
    const nextRunAt = computeNextRunAt(schedule);
    await ScheduleModel.updateById(schedule.id, {
      last_run_at: new Date(),
      next_run_at: nextRunAt,
    });
  }
}
