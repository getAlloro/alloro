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
import {
  createAgentRunContext,
  getAgentRetryPolicy,
} from "../../services/agentRegistry";
import { getMindsQueue } from "../queues";
import { recordSchedulerTick } from "../workerHealth";
import logger from "../../lib/logger";

/**
 * Translate an agent's declared policy into BullMQ job options (§21.2/§21.1).
 * `backoff` is omitted entirely for a single-attempt job — it would be dead
 * config, and stating it would imply a retry that will never happen.
 */
function retryOptions(agentKey: string): { attempts: number; backoff?: { type: string; delay: number } } {
  const policy = getAgentRetryPolicy(agentKey);
  if (policy.attempts <= 1) return { attempts: 1 };
  return {
    attempts: policy.attempts,
    backoff: { type: "exponential", delay: policy.backoffMs },
  };
}

export async function processSchedulerTick(_job: Job): Promise<void> {
  // Processing heartbeat — must run BEFORE the early-return below so it fires
  // every tick even when no schedules are due. Read by the worker watchdog.
  recordSchedulerTick();

  const dueSchedules = await ScheduleModel.findDueSchedules();

  if (dueSchedules.length === 0) return;

  logger.info(`[SCHEDULER] ${dueSchedules.length} schedule(s) due — dispatching`);

  const execQueue = getMindsQueue("schedule-exec");

  for (const schedule of dueSchedules) {
    // Skip if a run is already active — prevents piling up while a long agent runs.
    const isRunning = await ScheduleRunModel.hasActiveRun(schedule.id);
    if (isRunning) {
      logger.info(`[SCHEDULER] Skipping "${schedule.agent_key}" — already running`);
      continue;
    }

    // Idempotent jobId keyed on the due window (next_run_at). Re-ticks that fire
    // before the run advances next_run_at produce the same id, so BullMQ dedupes
    // the enqueue instead of stacking duplicate executions.
    const logicalWindow = schedule.next_run_at
      ? new Date(schedule.next_run_at)
      : new Date();
    const logicalContext = createAgentRunContext(logicalWindow);
    const windowMs = logicalWindow.getTime();

    await execQueue.add(
      "run-schedule",
      {
        scheduleId: schedule.id,
        ...logicalContext,
      },
      {
        jobId: `sched-${schedule.id}-${windowMs}`,
        // Bounded retry with backoff (§21.2), PER AGENT (§21.1) — never a
        // queue-wide default. This queue is shared by every scheduled agent and
        // a retry re-runs the whole handler, so a blanket `attempts: 3` here
        // would impose retries on handlers that are not repeat-safe and
        // duplicate their writes (ranking, live in prod, is exactly that — see
        // the reasoning recorded on its registry entry). Agents opt in; the
        // default is no retry.
        //
        // Either way the exec processor RETHROWS, so a failed run reaches the
        // failed set instead of silently resolving. With attempts: 1 that is
        // immediate and terminal — same execution behaviour as before this
        // change, but the failure is finally visible and retained for
        // inspection (removeOnFail) — the dead-letter path.
        ...retryOptions(schedule.agent_key),
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 25 },
      }
    );

    logger.info(`[SCHEDULER] Dispatched "${schedule.agent_key}" (schedule ${schedule.id})`);
  }
}
