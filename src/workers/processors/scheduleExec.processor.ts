/**
 * Schedule Exec Processor
 *
 * Executes a single due schedule's agent handler. Dispatched by the scheduler
 * tick (scheduler.processor.ts) onto the `minds-schedule-exec` queue. Lives on
 * its own queue/worker with a long lock so multi-minute agent runs never stall
 * the 60s scheduler tick. Owns the `schedule_runs` lifecycle and the
 * `next_run_at` advance.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FAILURE CONTRACT (Dave review #166 round 3 item 2 — §21.2, §21.4).
 *
 * This processor used to mark the run failed, advance `next_run_at`, and then
 * SWALLOW the error. Three things followed, all bad: BullMQ saw the job resolve,
 * so its retry machinery never engaged; the failure never reached the failed set,
 * so nothing was retained for inspection; and the schedule quietly jumped to its
 * next window — a 14-day agent could fail every cycle and read as healthy.
 *
 * It now conforms to the failure contract every other job in this repo already
 * follows (osPurge / osIngest / osConvert / osLockReaper /
 * locationCancellationFinalizer): log with full context, then RETHROW so BullMQ
 * can apply retry/backoff and retains an exhausted job for inspection.
 *
 * WHETHER a rethrow is retried is decided PER AGENT, not here and not
 * queue-wide (§21.1). This queue is shared, and a retry re-runs the whole
 * handler, so retry is opt-in per agent via `agentRegistry`'s `retry` policy,
 * read at enqueue in `scheduler.processor.ts`; the default is no retry. Agents
 * that are not repeat-safe (ranking blind-inserts a fresh `practice_rankings`
 * batch on every run, and is live in prod) must NOT be retried — a retry would
 * duplicate their writes. For them `attempts: 1` means this catch is terminal
 * on the first failure: same execution behaviour as before the fix, except the
 * failure is now visible and retained instead of swallowed.
 *
 * `next_run_at` advances ONLY on a terminal attempt. Both halves below rest on
 * one fact, verified in BullMQ's own Lua rather than assumed: `Queue.add` with
 * an explicit jobId early-returns `handleDuplicatedJob` when
 * `EXISTS <prefix><jobId> == 1` (bullmq@5.70.1
 * dist/cjs/scripts/addStandardJob-9.js:421-426). That check is on the job HASH
 * and is STATE-AGNOSTIC — it dedupes against a job sitting in delayed, failed,
 * or anywhere else, for as long as the hash has not been evicted.
 *   - Non-terminal — leave `next_run_at` alone; the retry IS the retry. The
 *     schedule stays due, but the tick's jobId is keyed on `next_run_at`
 *     (`sched-{id}-{window}`), and the retry is sitting in `delayed` with that
 *     hash still present, so the tick's re-enqueue dedupes instead of stacking
 *     a duplicate execution.
 *   - Terminal — advance. Same dedupe, opposite consequence: an exhausted job
 *     is RETAINED by `removeOnFail: { count: 25 }`, so its hash still exists and
 *     every future re-enqueue under that jobId would dedupe against a corpse —
 *     the schedule would sit due forever and never run again. Advancing changes
 *     the window, which changes the jobId, which releases it.
 *
 * COST NOTE: a retried agent re-runs its measurement, so a retry-enabled paid
 * agent can cost up to `attempts`x one cycle instead of 1x when it fails. That
 * is the bounded, deliberate price of not silently dropping a run — and it is
 * one of the reasons retry is opt-in per agent rather than queue-wide.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Job } from "bullmq";
import { CronExpressionParser } from "cron-parser";
import { ScheduleModel, ScheduleRunModel, ISchedule } from "../../models/ScheduleModel";
import { getAgentHandler } from "../../services/agentRegistry";
import logger from "../../lib/logger";

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
    logger.warn(`[SCHEDULE-EXEC] Schedule ${scheduleId} not found — skipping`);
    return;
  }

  // Re-check at execution time. The dispatcher already guards, but the exec queue
  // may lag, so guard again to keep at-most-one active run per schedule.
  const isRunning = await ScheduleRunModel.hasActiveRun(scheduleId);
  if (isRunning) {
    logger.info(`[SCHEDULE-EXEC] Schedule ${scheduleId} already running — skipping`);
    return;
  }

  const agent = getAgentHandler(schedule.agent_key);
  if (!agent) {
    logger.error(`[SCHEDULE-EXEC] No handler registered for agent_key "${schedule.agent_key}"`);
    return;
  }

  logger.info(`[SCHEDULE-EXEC] Executing "${schedule.agent_key}" (${agent.displayName})`);

  const run = await ScheduleRunModel.createRun(schedule.id);

  try {
    const result = await agent.handler();

    await ScheduleRunModel.completeRun(run.id, result.summary);

    const nextRunAt = computeNextRunAt(schedule);
    await ScheduleModel.updateById(schedule.id, {
      last_run_at: new Date(),
      next_run_at: nextRunAt,
    });

    logger.info(`[SCHEDULE-EXEC] "${schedule.agent_key}" completed. Next run: ${nextRunAt.toISOString()}`);
  } catch (error: any) {
    const message = error?.message || String(error);

    // A job enqueued before retry options existed (in flight across a deploy)
    // reports no `attempts`; treat it as single-attempt, i.e. already terminal.
    const maxAttempts = job.opts?.attempts ?? 1;

    // `attemptsMade` is 0-based DURING processing: BullMQ increments it only in
    // moveToFailed/moveToCompleted, after the processor has returned or thrown
    // (bullmq@5.70.1 dist/cjs/classes/job.js:549). So attempt is 1-based here.
    //
    // `isTerminal` is deliberately the exact logical complement of BullMQ's own
    // retry predicate — `shouldRetryJob` retries iff
    // `attemptsMade + 1 < opts.attempts` (job.js:484), evaluated at job.js:506
    // on this same pre-increment value. Written this way, our "was this the last
    // attempt?" cannot drift from BullMQ's "will I retry?".
    const attempt = job.attemptsMade + 1;
    const isTerminal = attempt >= maxAttempts;

    // §21.4 — job name, payload identifiers, attempt count, and the error.
    logger.error(
      {
        err: message,
        jobName: job.name,
        jobId: job.id,
        scheduleId: schedule.id,
        runId: run.id,
        agentKey: schedule.agent_key,
        attempt,
        maxAttempts,
        terminal: isTerminal,
      },
      `[SCHEDULE-EXEC] "${schedule.agent_key}" failed`
    );

    // This attempt's run row is failed either way — each attempt IS a real run,
    // so each gets its own honest row rather than one row rewritten in place.
    //
    // Guarded, and the guard is load-bearing: the failure we most need to
    // survive is a DATABASE outage (that is precisely what NapPersistenceError
    // reports), which is exactly when this write is most likely to throw too.
    // Unguarded, it would skip the terminal advance below and leave the
    // schedule due forever behind a retained job that dedupes every re-enqueue
    // — the swallow replaced by a wedge. Never let bookkeeping cost us the
    // advance or the rethrow.
    try {
      await ScheduleRunModel.failRun(run.id, message);
    } catch (markError: any) {
      logger.error(
        {
          err: markError?.message || String(markError),
          originalErr: message,
          scheduleId: schedule.id,
          runId: run.id,
          agentKey: schedule.agent_key,
        },
        `[SCHEDULE-EXEC] could not mark run ${run.id} failed — the run row may be stranded 'running' and block future runs of this schedule`
      );
    }

    if (isTerminal) {
      // Retries exhausted (or never enabled for this agent). Advance so the
      // schedule is not left permanently due (see the jobId-dedupe wedge in the
      // header). Guarded for the same reason as failRun above — and separately,
      // so that a thrown advance cannot replace the ORIGINAL error with a
      // bookkeeping error in the failed set, which would hide the real cause.
      try {
        const nextRunAt = computeNextRunAt(schedule);
        await ScheduleModel.updateById(schedule.id, {
          last_run_at: new Date(),
          next_run_at: nextRunAt,
        });
        logger.error(
          {
            jobId: job.id,
            scheduleId: schedule.id,
            agentKey: schedule.agent_key,
            attempts: attempt,
            nextRunAt: nextRunAt.toISOString(),
          },
          `[SCHEDULE-EXEC] "${schedule.agent_key}" DEAD-LETTERED — no attempts left; job retained in the failed set for inspection`
        );
      } catch (advanceError: any) {
        logger.error(
          {
            err: advanceError?.message || String(advanceError),
            originalErr: message,
            scheduleId: schedule.id,
            agentKey: schedule.agent_key,
          },
          `[SCHEDULE-EXEC] could not advance next_run_at for schedule ${schedule.id} — it may stay due and be deduped behind the retained failed job until this is cleared`
        );
      }
    }

    // Always rethrow (§21.2/§3.2). Non-terminal: BullMQ retries with backoff.
    // Terminal: the job is recorded failed instead of silently resolving.
    throw error;
  }
}
