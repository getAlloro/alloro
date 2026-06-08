/**
 * Scheduler Processor (dispatcher)
 *
 * Runs every 60 seconds via BullMQ repeatable job.
 * Finds due schedules and dispatches one execution job per schedule onto the
 * `minds-schedule-exec` queue. Kept intentionally lightweight so the tick always
 * finishes well within its lock window. Actual agent execution (which can take
 * minutes) happens in scheduleExec.processor.ts — that way the 60s tick never
 * holds a lock through long-running work and can't fall into a stall/renew loop.
 */

import { Job } from "bullmq";
import { ScheduleModel, ScheduleRunModel } from "../../models/ScheduleModel";
import { getMindsQueue } from "../queues";
import { recordSchedulerTick } from "../workerHealth";

export async function processSchedulerTick(_job: Job): Promise<void> {
  // Processing heartbeat — must run BEFORE the early-return below so it fires
  // every tick even when no schedules are due. Read by the worker watchdog.
  recordSchedulerTick();

  const dueSchedules = await ScheduleModel.findDueSchedules();

  if (dueSchedules.length === 0) return;

  console.log(`[SCHEDULER] ${dueSchedules.length} schedule(s) due — dispatching`);

  const execQueue = getMindsQueue("schedule-exec");

  for (const schedule of dueSchedules) {
    // Skip if a run is already active — prevents piling up while a long agent runs.
    const isRunning = await ScheduleRunModel.hasActiveRun(schedule.id);
    if (isRunning) {
      console.log(`[SCHEDULER] Skipping "${schedule.agent_key}" — already running`);
      continue;
    }

    // Idempotent jobId keyed on the due window (next_run_at). Re-ticks that fire
    // before the run advances next_run_at produce the same id, so BullMQ dedupes
    // the enqueue instead of stacking duplicate executions.
    const windowMs = schedule.next_run_at
      ? new Date(schedule.next_run_at).getTime()
      : Date.now();

    await execQueue.add(
      "run-schedule",
      { scheduleId: schedule.id },
      {
        jobId: `sched-${schedule.id}-${windowMs}`,
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 25 },
      }
    );

    console.log(`[SCHEDULER] Dispatched "${schedule.agent_key}" (schedule ${schedule.id})`);
  }
}
