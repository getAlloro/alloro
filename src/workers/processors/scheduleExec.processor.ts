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
 * queue-wide (§21.1). This queue is shared, and a retry can re-run the whole
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
 * RETRY IDENTITY: the dispatcher gives each due window a deterministic BullMQ
 * job id. PostgreSQL stores that id as schedule_runs.logical_run_key under a
 * unique (schedule_id, logical_run_key) index. BullMQ's runId copy is only a
 * cache: if Redis updateData fails after the SQL insert, the retry recovers the
 * same row by logical key instead of treating it as an unrelated active run.
 * This does not claim cross-store atomicity; it removes the need for it.
 *
 * The dispatcher also stores one logical UTC window/date in job data. NAP
 * preflights its persisted (tenant, location, logical date) key before paid
 * measurement: locations that already landed are not paid for again; only
 * failed locations are retried. This is why retry remains opt-in per agent
 * rather than queue-wide.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { DelayedError, Job } from "bullmq";
import { CronExpressionParser } from "cron-parser";
import {
  ScheduleModel,
  ScheduleRunModel,
  ISchedule,
  IScheduleRun,
  ScheduleExecutionLock,
} from "../../models/ScheduleModel";
import {
  AgentRunContext,
  createAgentRunContext,
  getAgentHandler,
} from "../../services/agentRegistry";
import logger from "../../lib/logger";

export interface ScheduleExecJobData {
  scheduleId: number;
  /** Persisted by the dispatcher; optional only for jobs enqueued pre-deploy. */
  logicalRunAt?: string;
  /** Persisted UTC date derived from logicalRunAt. */
  logicalRunDate?: string;
  /** The schedule_runs row owned by this BullMQ logical job. */
  runId?: number;
  /** Paid handler result cached before completion bookkeeping. */
  resultSummary?: Record<string, unknown>;
}

const EXECUTION_LOCK_CONTENTION_DELAY_MS = 60_000;

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

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasStableLogicalContext(
  data: ScheduleExecJobData
): data is ScheduleExecJobData & AgentRunContext {
  if (!data.logicalRunAt || !data.logicalRunDate) return false;
  const logicalRunAt = new Date(data.logicalRunAt);
  return (
    !Number.isNaN(logicalRunAt.getTime()) &&
    logicalRunAt.toISOString().slice(0, 10) === data.logicalRunDate
  );
}

async function cacheJobData(
  job: Job<ScheduleExecJobData>,
  patch: Partial<ScheduleExecJobData>,
  context: Record<string, unknown>,
): Promise<ScheduleExecJobData> {
  const data = { ...job.data, ...patch };
  try {
    await job.updateData(data);
  } catch (error) {
    // PostgreSQL owns run state and the logical key. Redis job data is only a
    // retry cache; losing a cache write must never strand or abort a SQL-owned
    // run.
    logger.warn(
      { ...context, err: messageFrom(error) },
      "[SCHEDULE-EXEC] could not cache job metadata in Redis — continuing from authoritative in-memory/SQL state",
    );
  }
  return data;
}

async function ensureLogicalContext(
  job: Job<ScheduleExecJobData>,
  schedule: ISchedule
): Promise<ScheduleExecJobData & AgentRunContext> {
  if (hasStableLogicalContext(job.data)) return job.data;
  const dueWindow = schedule.next_run_at
    ? new Date(schedule.next_run_at)
    : new Date();
  const context = createAgentRunContext(dueWindow);
  const data = await cacheJobData(job, context, {
    jobId: job.id,
    scheduleId: schedule.id,
    cacheField: "logical-context",
  });
  return data as ScheduleExecJobData & AgentRunContext;
}

interface OwnedRun {
  run: IScheduleRun;
  data: ScheduleExecJobData & AgentRunContext;
}

function logicalRunKey(
  job: Job<ScheduleExecJobData>,
  schedule: ISchedule,
  data: ScheduleExecJobData & AgentRunContext
): string {
  if (job.id !== undefined) return String(job.id);
  return `sched-${schedule.id}-${new Date(data.logicalRunAt).getTime()}`;
}

async function resumeOwnedRun(
  run: IScheduleRun,
  scheduleId: number,
  data: ScheduleExecJobData & AgentRunContext
): Promise<OwnedRun> {
  if (run.status === "failed") {
    await ScheduleRunModel.resumeRun(run.id, scheduleId);
    return { run: { ...run, status: "running" }, data };
  }
  return { run, data };
}

async function resolveOwnedRun(
  job: Job<ScheduleExecJobData>,
  schedule: ISchedule,
  data: ScheduleExecJobData & AgentRunContext
): Promise<OwnedRun | null> {
  const runKey = logicalRunKey(job, schedule, data);

  if (data.runId !== undefined) {
    const cachedRun = await ScheduleRunModel.findRunByIdForSchedule(
      data.runId,
      schedule.id
    );
    if (!cachedRun) {
      throw new Error(
        `Schedule job ${job.id ?? "unknown"} cannot find its run ${data.runId} ` +
          `for schedule ${schedule.id}.`
      );
    }
    const ownedRun = await ScheduleRunModel.claimLogicalRunKey(
      cachedRun.id,
      schedule.id,
      runKey
    );
    return resumeOwnedRun(ownedRun, schedule.id, data);
  }

  // PostgreSQL is authoritative for ownership. This lookup closes the failure
  // window where createRun committed but Redis updateData never stored runId.
  const existing = await ScheduleRunModel.findRunByLogicalKey(
    schedule.id,
    runKey
  );
  if (existing) {
    return resumeOwnedRun(existing, schedule.id, data);
  }

  // The model locks the parent schedule row, then checks and inserts in one
  // transaction. Two different logical jobs therefore cannot both pass an
  // active-run check and start paid work.
  const run = await ScheduleRunModel.acquireRunForLogicalJob(
    schedule.id,
    runKey,
  );
  if (!run) {
    logger.info(`[SCHEDULE-EXEC] Schedule ${schedule.id} already running — skipping`);
    return null;
  }

  const persistedData = await cacheJobData(
    job,
    { runId: run.id },
    {
      jobId: job.id,
      scheduleId: schedule.id,
      runId: run.id,
      cacheField: "runId",
    },
  );
  return resumeOwnedRun(
    run,
    schedule.id,
    persistedData as ScheduleExecJobData & AgentRunContext
  );
}

function attemptState(job: Job<ScheduleExecJobData>): {
  attempt: number;
  maxAttempts: number;
  isTerminal: boolean;
} {
  // A job enqueued before retry options existed (in flight across a deploy)
  // reports no `attempts`; treat it as single-attempt, i.e. already terminal.
  const maxAttempts = job.opts?.attempts ?? 1;

  // `attemptsMade` is 0-based DURING processing: BullMQ increments it only in
  // moveToFailed/moveToCompleted, after the processor has returned or thrown
  // (bullmq@5.70.1 dist/cjs/classes/job.js:549). So attempt is 1-based here.
  //
  // `isTerminal` is deliberately the exact logical complement of BullMQ's own
  // retry predicate — `shouldRetryJob` retries iff
  // `attemptsMade + 1 < opts.attempts` (job.js:484), evaluated at job.js:506.
  const attempt = job.attemptsMade + 1;
  return { attempt, maxAttempts, isTerminal: attempt >= maxAttempts };
}

async function advanceSchedule(
  schedule: ISchedule,
  logLevel: "info" | "error",
  context: Record<string, unknown>,
  message: string
): Promise<void> {
  const nextRunAt = computeNextRunAt(schedule);
  await ScheduleModel.updateById(schedule.id, {
    last_run_at: new Date(),
    next_run_at: nextRunAt,
  });
  const logContext = { ...context, nextRunAt: nextRunAt.toISOString() };
  if (logLevel === "error") {
    logger.error(logContext, message);
  } else {
    logger.info(logContext, message);
  }
}

async function handleAttemptFailure(
  job: Job<ScheduleExecJobData>,
  schedule: ISchedule,
  run: IScheduleRun,
  error: unknown
): Promise<never> {
  const message = messageFrom(error);
  const { attempt, maxAttempts, isTerminal } = attemptState(job);

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

  try {
    await ScheduleRunModel.failRun(run.id, message);
  } catch (markError) {
    logger.error(
      {
        err: messageFrom(markError),
        originalErr: message,
        scheduleId: schedule.id,
        runId: run.id,
        agentKey: schedule.agent_key,
      },
      `[SCHEDULE-EXEC] could not mark run ${run.id} failed — the owning BullMQ retry will resume this run id`
    );
  }

  if (isTerminal) {
    try {
      await advanceSchedule(
        schedule,
        "error",
        {
          jobId: job.id,
          scheduleId: schedule.id,
          agentKey: schedule.agent_key,
          attempts: attempt,
        },
        `[SCHEDULE-EXEC] "${schedule.agent_key}" DEAD-LETTERED — no attempts left; job retained in the failed set for inspection`
      );
    } catch (advanceError) {
      logger.error(
        {
          err: messageFrom(advanceError),
          originalErr: message,
          scheduleId: schedule.id,
          agentKey: schedule.agent_key,
        },
        `[SCHEDULE-EXEC] could not advance next_run_at for schedule ${schedule.id} — it may stay due and be deduped behind the retained failed job until this is cleared`
      );
    }
  }

  throw error;
}

async function handlePreRunFailure(
  job: Job<ScheduleExecJobData>,
  schedule: ISchedule,
  error: unknown,
): Promise<never> {
  const message = messageFrom(error);
  const { attempt, maxAttempts, isTerminal } = attemptState(job);

  logger.error(
    {
      err: message,
      jobName: job.name,
      jobId: job.id,
      scheduleId: schedule.id,
      agentKey: schedule.agent_key,
      phase: "execution-lock",
      attempt,
      maxAttempts,
      terminal: isTerminal,
    },
    `[SCHEDULE-EXEC] could not acquire execution ownership for "${schedule.agent_key}"`,
  );

  if (isTerminal) {
    try {
      await advanceSchedule(
        schedule,
        "error",
        {
          jobId: job.id,
          scheduleId: schedule.id,
          agentKey: schedule.agent_key,
          attempts: attempt,
          phase: "execution-lock",
        },
        `[SCHEDULE-EXEC] "${schedule.agent_key}" DEAD-LETTERED before execution — no attempts left`,
      );
    } catch (advanceError) {
      logger.error(
        {
          err: messageFrom(advanceError),
          originalErr: message,
          scheduleId: schedule.id,
          agentKey: schedule.agent_key,
          phase: "execution-lock",
        },
        `[SCHEDULE-EXEC] could not advance next_run_at after execution-lock failure for schedule ${schedule.id}`,
      );
    }
  }

  throw error;
}

export async function processScheduleExec(job: Job<ScheduleExecJobData>): Promise<void> {
  const { scheduleId } = job.data;

  const schedule = await ScheduleModel.findById(scheduleId);
  if (!schedule) {
    logger.warn(`[SCHEDULE-EXEC] Schedule ${scheduleId} not found — skipping`);
    return;
  }

  const agent = getAgentHandler(schedule.agent_key);
  if (!agent) {
    logger.error(`[SCHEDULE-EXEC] No handler registered for agent_key "${schedule.agent_key}"`);
    return;
  }

  let executionLock: ScheduleExecutionLock | undefined;
  try {
    executionLock = await ScheduleRunModel.acquireExecutionLock(schedule.id);
  } catch (error) {
    await handlePreRunFailure(job, schedule, error);
  }

  if (!executionLock) {
    logger.info(
      { jobId: job.id, scheduleId: schedule.id, agentKey: schedule.agent_key },
      `[SCHEDULE-EXEC] Schedule ${schedule.id} already executing — deferring this delivery`,
    );
    try {
      await job.moveToDelayed(
        Date.now() + EXECUTION_LOCK_CONTENTION_DELAY_MS,
        job.token,
      );
    } catch (error) {
      await handlePreRunFailure(job, schedule, error);
    }
    throw new DelayedError();
  }

  try {
    logger.info(`[SCHEDULE-EXEC] Executing "${schedule.agent_key}" (${agent.displayName})`);

    const logicalData = await ensureLogicalContext(job, schedule);
    const owned = await resolveOwnedRun(job, schedule, logicalData);
    if (!owned) return;
    const { run } = owned;
    let data = owned.data;

    // If the paid handler completed before bookkeeping failed, its summary is
    // persisted in BullMQ data. Retry completion only; do not pay the provider
    // again. A completed run similarly means only schedule advancement remains.
    if (run.status !== "completed") {
      try {
        let summary = data.resultSummary;
        if (summary === undefined) {
          const result = await agent.handler({
            logicalRunAt: data.logicalRunAt,
            logicalRunDate: data.logicalRunDate,
          });
          summary = result.summary;
          data = await cacheJobData(
            job,
            { resultSummary: summary },
            {
              jobId: job.id,
              scheduleId: schedule.id,
              runId: run.id,
              cacheField: "resultSummary",
            },
          ) as
            ScheduleExecJobData & AgentRunContext;
        }

        await ScheduleRunModel.completeRun(run.id, summary);
      } catch (error) {
        await handleAttemptFailure(job, schedule, run, error);
      }
    }

    try {
      await advanceSchedule(
        schedule,
        "info",
        {
          jobId: job.id,
          scheduleId: schedule.id,
          runId: run.id,
          agentKey: schedule.agent_key,
          logicalRunAt: data.logicalRunAt,
          logicalRunDate: data.logicalRunDate,
        },
        `[SCHEDULE-EXEC] "${schedule.agent_key}" completed`
      );
    } catch (error) {
      // The run is already completed. Leave it completed and rethrow; the next
      // attempt identifies the same runId and retries only this bookkeeping.
      logger.error(
        {
          err: messageFrom(error),
          jobName: job.name,
          jobId: job.id,
          scheduleId: schedule.id,
          runId: run.id,
          agentKey: schedule.agent_key,
          logicalRunAt: data.logicalRunAt,
          logicalRunDate: data.logicalRunDate,
        },
        `[SCHEDULE-EXEC] completed run ${run.id} but could not advance schedule bookkeeping — retry will not rerun the agent`
      );
      throw error;
    }
  } finally {
    try {
      await executionLock.release();
    } catch (error) {
      logger.error(
        {
          err: messageFrom(error),
          jobId: job.id,
          scheduleId: schedule.id,
          agentKey: schedule.agent_key,
        },
        `[SCHEDULE-EXEC] could not release the execution lock for schedule ${schedule.id}`,
      );
    }
  }
}
