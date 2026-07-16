/**
 * AdminSchedulesController
 *
 * CRUD for schedules + manual trigger + run history.
 */

import { Request, Response } from "express";
import { CronExpressionParser } from "cron-parser";
import { ScheduleModel, ScheduleRunModel, ISchedule } from "../../models/ScheduleModel";
import { getAgentHandler, getRegisteredAgents } from "../../services/agentRegistry";
import logger from "../../lib/logger";

function handleError(res: Response, error: unknown, operation: string): Response {
  logger.error({ err: error }, `[ADMIN-SCHEDULES] ${operation} failed:`);
  const message = error instanceof Error ? error.message : String(error);
  return res.status(500).json({ success: false, error: message });
}

function computeNextRunAt(schedule: Partial<ISchedule>): Date {
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

  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

// GET /api/admin/schedules
export async function listSchedules(_req: Request, res: Response): Promise<any> {
  try {
    const schedules = await ScheduleModel.listAll();

    // Attach latest run to each schedule
    const enriched = await Promise.all(
      schedules.map(async (s) => {
        const latestRun = await ScheduleRunModel.latestRun(s.id);
        return { ...s, latest_run: latestRun || null };
      }),
    );

    return res.json({ success: true, data: enriched });
  } catch (error) {
    return handleError(res, error, "listSchedules");
  }
}

// GET /api/admin/schedules/registry
export async function listRegistry(_req: Request, res: Response): Promise<any> {
  try {
    const agents = getRegisteredAgents();
    return res.json({ success: true, data: agents });
  } catch (error) {
    return handleError(res, error, "listRegistry");
  }
}

// GET /api/admin/schedules/server-time
export async function getServerTime(_req: Request, res: Response): Promise<any> {
  return res.json({ success: true, data: { serverTime: new Date().toISOString() } });
}

// GET /api/admin/schedules/:id/runs
export async function listRuns(req: Request, res: Response): Promise<any> {
  try {
    const scheduleId = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;

    const [runs, total] = await Promise.all([
      ScheduleRunModel.listByScheduleId(scheduleId, limit, offset),
      ScheduleRunModel.countByScheduleId(scheduleId),
    ]);

    return res.json({ success: true, data: runs, total });
  } catch (error) {
    return handleError(res, error, "listRuns");
  }
}

// POST /api/admin/schedules
export async function createSchedule(req: Request, res: Response): Promise<any> {
  try {
    const { agent_key, display_name, description, schedule_type, cron_expression, interval_days, timezone, enabled } = req.body;

    if (!agent_key || !display_name || !schedule_type) {
      return res.status(400).json({ success: false, error: "agent_key, display_name, and schedule_type are required" });
    }

    if (schedule_type === "cron" && !cron_expression) {
      return res.status(400).json({ success: false, error: "cron_expression is required for cron schedule type" });
    }

    if (schedule_type === "interval_days" && !interval_days) {
      return res.status(400).json({ success: false, error: "interval_days is required for interval_days schedule type" });
    }

    // Validate cron expression
    if (cron_expression) {
      try {
        CronExpressionParser.parse(cron_expression);
      } catch {
        return res.status(400).json({ success: false, error: "Invalid cron expression" });
      }
    }

    // Check for duplicate agent_key
    const existing = await ScheduleModel.findByAgentKey(agent_key);
    if (existing) {
      return res.status(409).json({ success: false, error: `Schedule for "${agent_key}" already exists` });
    }

    const nextRunAt = computeNextRunAt({ schedule_type, cron_expression, interval_days, timezone });

    const schedule = await ScheduleModel.create({
      agent_key,
      display_name,
      description: description || null,
      schedule_type,
      cron_expression: cron_expression || null,
      interval_days: interval_days || null,
      timezone: timezone || "UTC",
      enabled: enabled !== false,
      next_run_at: nextRunAt,
    });

    return res.status(201).json({ success: true, data: schedule });
  } catch (error) {
    return handleError(res, error, "createSchedule");
  }
}

// PATCH /api/admin/schedules/:id
export async function updateSchedule(req: Request, res: Response): Promise<any> {
  try {
    const scheduleId = Number(req.params.id);
    const { display_name, description, schedule_type, cron_expression, interval_days, timezone, enabled } = req.body;

    const existing = await ScheduleModel.findById(scheduleId);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Schedule not found" });
    }

    // Validate cron if provided
    if (cron_expression) {
      try {
        CronExpressionParser.parse(cron_expression);
      } catch {
        return res.status(400).json({ success: false, error: "Invalid cron expression" });
      }
    }

    const updates: Partial<ISchedule> = {};
    if (display_name !== undefined) updates.display_name = display_name;
    if (description !== undefined) updates.description = description;
    if (timezone !== undefined) updates.timezone = timezone;
    if (enabled !== undefined) updates.enabled = enabled;

    // If schedule timing changed, recompute next_run_at
    if (schedule_type !== undefined || cron_expression !== undefined || interval_days !== undefined) {
      if (schedule_type !== undefined) updates.schedule_type = schedule_type;
      if (cron_expression !== undefined) updates.cron_expression = cron_expression;
      if (interval_days !== undefined) updates.interval_days = interval_days;

      const merged = { ...existing, ...updates };
      updates.next_run_at = computeNextRunAt(merged);
    }

    const updated = await ScheduleModel.updateAndReturn(scheduleId, updates);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleError(res, error, "updateSchedule");
  }
}

// DELETE /api/admin/schedules/:id
export async function deleteSchedule(req: Request, res: Response): Promise<any> {
  try {
    const scheduleId = Number(req.params.id);
    const deleted = await ScheduleModel.remove(scheduleId);

    if (!deleted) {
      return res.status(404).json({ success: false, error: "Schedule not found" });
    }

    return res.json({ success: true });
  } catch (error) {
    return handleError(res, error, "deleteSchedule");
  }
}

// POST /api/admin/schedules/:id/run
export async function triggerRun(req: Request, res: Response): Promise<any> {
  try {
    const scheduleId = Number(req.params.id);

    const schedule = await ScheduleModel.findById(scheduleId);
    if (!schedule) {
      return res.status(404).json({ success: false, error: "Schedule not found" });
    }

    const isRunning = await ScheduleRunModel.hasActiveRun(schedule.id);
    if (isRunning) {
      return res.status(409).json({ success: false, error: "Schedule is already running" });
    }

    const agent = getAgentHandler(schedule.agent_key);
    if (!agent) {
      return res.status(400).json({ success: false, error: `No handler registered for "${schedule.agent_key}"` });
    }

    // Create run record and execute in background
    const run = await ScheduleRunModel.createRun(schedule.id);

    // Return immediately — run executes in background
    res.json({ success: true, data: { runId: run.id, message: `"${schedule.display_name}" triggered` } });

    // ---- Background execution. Everything past the response above MUST be
    // self-contained: the reply is already sent, so an error escaping to the
    // outer catch would call handleError() on a finished response and throw
    // ERR_HTTP_HEADERS_SENT instead of reporting anything useful.
    //
    // This is the manual-trigger twin of the scheduler's failure contract
    // (workers/processors/scheduleExec.processor.ts). It cannot rethrow into
    // BullMQ retry/backoff — it is not a job, it is an operator pressing "run
    // now" in-process — so the §21.2 obligation it CAN meet is the other half:
    // never drop the failure silently. It used to call failRun() and swallow,
    // logging nothing at all, so a failed manual run was invisible outside the
    // runs table. It now logs with full context (§21.4) and can no longer
    // corrupt the response.
    void (async () => {
      try {
        const result = await agent.handler();
        await ScheduleRunModel.completeRun(run.id, result.summary);
        await ScheduleModel.updateById(schedule.id, { last_run_at: new Date() });
        logger.info(
          { scheduleId: schedule.id, runId: run.id, agentKey: schedule.agent_key },
          `[ADMIN-SCHEDULES] manual run of "${schedule.agent_key}" completed`
        );
      } catch (error: any) {
        const message = error?.message || String(error);
        // §21.4 — identifiers + the error. No retry: a manual trigger is
        // operator-initiated, so the operator is the retry, and this log plus
        // the failed run row is what tells them.
        logger.error(
          { err: message, scheduleId: schedule.id, runId: run.id, agentKey: schedule.agent_key },
          `[ADMIN-SCHEDULES] manual run of "${schedule.agent_key}" FAILED`
        );
        try {
          await ScheduleRunModel.failRun(run.id, message);
        } catch (markError: any) {
          // The run row is now stuck 'running' and hasActiveRun() will block
          // re-triggering this schedule. Say so loudly — this is the one that
          // needs a human.
          logger.error(
            {
              err: markError?.message || String(markError),
              originalErr: message,
              scheduleId: schedule.id,
              runId: run.id,
              agentKey: schedule.agent_key,
            },
            `[ADMIN-SCHEDULES] could not mark run ${run.id} failed — the run row may be stranded 'running' and block re-triggering`
          );
        }
      }
    })();
  } catch (error) {
    return handleError(res, error, "triggerRun");
  }
}
