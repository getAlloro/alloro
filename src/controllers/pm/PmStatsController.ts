import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { PmTaskModel, PmVelocityRange } from "../../models/PmTaskModel";
import { PmActivityLogModel } from "../../models/PmActivityLogModel";
import logger from "../../lib/logger";

function handleError(res: Response, error: unknown, operation: string): Response {
  logger.error({ err: error }, `[PM-STATS] ${operation} failed:`);
  const message = error instanceof Error ? error.message : String(error);
  return res.status(500).json({ success: false, error: message });
}

function parseUserId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseVelocityRange(value: unknown): PmVelocityRange {
  return value === "4w" || value === "3m" ? value : "7d";
}

// GET /api/pm/stats
export async function getStats(_req: AuthRequest, res: Response): Promise<any> {
  try {
    // Focus Today: tasks with priority P1 (top of the hour) or P2 (today), not completed
    const focusCount = await PmTaskModel.countActiveByPriorities(["P1", "P2"]);

    // This Week: tasks with priority P3 (3 days) or P4 (this week), not completed
    const weekCount = await PmTaskModel.countActiveByPriorities(["P3", "P4"]);

    // Backlog: tasks in Backlog columns of active projects
    const backlogCount = await PmTaskModel.countActiveBacklog();

    // Compute subtitles + severity
    const focus_today = {
      count: focusCount,
      subtitle: focusCount === 0 ? "You're clear" : `${focusCount} urgent`,
      severity: focusCount === 0 ? "green" : focusCount <= 3 ? "amber" : "red",
    };

    const this_week = {
      count: weekCount,
      subtitle: weekCount === 0 ? "All scheduled" : `${weekCount} this week`,
    };

    const backlog = {
      count: backlogCount,
      subtitle: backlogCount === 0 ? "All clear" : backlogCount <= 10 ? "unscheduled" : "consider triaging",
      severity: backlogCount <= 10 ? "normal" : "amber",
    };

    return res.json({ success: true, data: { focus_today, this_week, backlog } });
  } catch (error) {
    return handleError(res, error, "getStats");
  }
}

// GET /api/pm/stats/velocity?range=7d|4w|3m
export async function getVelocity(req: AuthRequest, res: Response): Promise<any> {
  try {
    const range = (req.query.range as string) || "7d";

    let completedQuery: string;
    let overdueQuery: string;
    let labelFormat: string;

    // Overdue = tasks whose deadline passed on that day AND were either:
    //   - not yet completed at that point, OR
    //   - completed after their deadline (completed late)
    if (range === "4w") {
      completedQuery = `
        SELECT DATE_TRUNC('week', completed_at)::date as period_start, COUNT(*)::int as completed
        FROM pm_tasks WHERE completed_at IS NOT NULL AND completed_at >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '3 weeks'
        GROUP BY DATE_TRUNC('week', completed_at) ORDER BY period_start ASC
      `;
      overdueQuery = `
        SELECT w.week_start::date as period_start, COUNT(t.id)::int as overdue
        FROM generate_series(DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '3 weeks', DATE_TRUNC('week', CURRENT_DATE), '1 week') as w(week_start)
        LEFT JOIN pm_tasks t ON t.deadline IS NOT NULL
          AND t.deadline >= w.week_start
          AND t.deadline < w.week_start + INTERVAL '7 days'
          AND (t.completed_at IS NULL OR DATE(t.completed_at AT TIME ZONE 'America/Los_Angeles') > DATE(t.deadline AT TIME ZONE 'UTC'))
        GROUP BY w.week_start ORDER BY w.week_start ASC
      `;
      labelFormat = "week";
    } else if (range === "3m") {
      completedQuery = `
        SELECT DATE_TRUNC('month', completed_at)::date as period_start, COUNT(*)::int as completed
        FROM pm_tasks WHERE completed_at IS NOT NULL AND completed_at >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '2 months'
        GROUP BY DATE_TRUNC('month', completed_at) ORDER BY period_start ASC
      `;
      overdueQuery = `
        SELECT m.month_start::date as period_start, COUNT(t.id)::int as overdue
        FROM generate_series(DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '2 months', DATE_TRUNC('month', CURRENT_DATE), '1 month') as m(month_start)
        LEFT JOIN pm_tasks t ON t.deadline IS NOT NULL
          AND t.deadline >= m.month_start
          AND t.deadline < m.month_start + INTERVAL '1 month'
          AND (t.completed_at IS NULL OR DATE(t.completed_at AT TIME ZONE 'America/Los_Angeles') > DATE(t.deadline AT TIME ZONE 'UTC'))
        GROUP BY m.month_start ORDER BY m.month_start ASC
      `;
      labelFormat = "month";
    } else {
      completedQuery = `
        SELECT DATE(completed_at) as period_start, COUNT(*)::int as completed
        FROM pm_tasks WHERE completed_at IS NOT NULL AND completed_at >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY DATE(completed_at) ORDER BY period_start ASC
      `;
      overdueQuery = `
        SELECT d.date::date as period_start, COUNT(t.id)::int as overdue
        FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day') as d(date)
        LEFT JOIN pm_tasks t ON t.deadline IS NOT NULL
          AND t.deadline >= d.date
          AND t.deadline < d.date + INTERVAL '1 day'
          AND (t.completed_at IS NULL OR DATE(t.completed_at AT TIME ZONE 'America/Los_Angeles') > DATE(t.deadline AT TIME ZONE 'UTC'))
        GROUP BY d.date ORDER BY d.date ASC
      `;
      labelFormat = "day";
    }

    const [completedRows, overdueRows] = await PmTaskModel.runVelocityRaw(
      completedQuery,
      overdueQuery,
      []
    );

    const completedMap = new Map<string, number>();
    for (const r of completedRows.rows) {
      completedMap.set(r.period_start.toISOString().slice(0, 10), r.completed);
    }

    const overdueMap = new Map<string, number>();
    for (const r of overdueRows.rows) {
      overdueMap.set(r.period_start.toISOString().slice(0, 10), r.overdue);
    }

    // Build merged data
    const allDates = new Set([...completedMap.keys(), ...overdueMap.keys()]);
    const sortedDates = [...allDates].sort();

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const data = sortedDates.map((dateStr) => {
      const d = new Date(dateStr);
      let label: string;
      if (labelFormat === "day") label = dayNames[d.getUTCDay()];
      else if (labelFormat === "week") label = `${monthNames[d.getUTCMonth()]} ${d.getUTCDate()}`;
      else label = monthNames[d.getUTCMonth()];

      return {
        label,
        period_start: dateStr,
        completed: completedMap.get(dateStr) || 0,
        overdue: overdueMap.get(dateStr) || 0,
      };
    });

    const completed_total = data.reduce((s, d) => s + d.completed, 0);
    const overdue_total = data.reduce((s, d) => s + d.overdue, 0);

    return res.json({ success: true, data: { completed_total, overdue_total, data } });
  } catch (error) {
    return handleError(res, error, "getVelocity");
  }
}

// GET /api/pm/stats/chart-data
// 14-day daily task_completed counts, zero-filled
export async function getChartData(_req: AuthRequest, res: Response): Promise<any> {
  try {
    const rows = await PmActivityLogModel.getDailyCompletionRows();

    const daily_completions = rows.map((r: any) => ({
      date:
        r.date instanceof Date
          ? r.date.toISOString().slice(0, 10)
          : String(r.date).slice(0, 10),
      count: Number(r.count) || 0,
    }));

    return res.json({ success: true, data: { daily_completions } });
  } catch (error) {
    return handleError(res, error, "getChartData");
  }
}

// GET /api/pm/stats/me
export async function getMyStats(req: AuthRequest, res: Response): Promise<any> {
  try {
    const stats = await PmTaskModel.getAssignedStats(req.user!.userId);
    return res.json({ success: true, data: stats });
  } catch (error) {
    return handleError(res, error, "getMyStats");
  }
}

// GET /api/pm/stats/assigned/:userId
export async function getAssignedStats(req: AuthRequest, res: Response): Promise<any> {
  try {
    const userId = parseUserId(req.params.userId);
    if (!userId) {
      return res.status(400).json({ success: false, error: "Valid userId is required" });
    }

    const stats = await PmTaskModel.getAssignedStats(userId);
    return res.json({ success: true, data: stats });
  } catch (error) {
    return handleError(res, error, "getAssignedStats");
  }
}

// GET /api/pm/stats/velocity/me
export async function getMyVelocity(req: AuthRequest, res: Response): Promise<any> {
  try {
    const range = parseVelocityRange(req.query.range);
    const velocity = await PmTaskModel.getAssignedVelocity(req.user!.userId, range);
    return res.json({ success: true, data: velocity });
  } catch (error) {
    return handleError(res, error, "getMyVelocity");
  }
}

// GET /api/pm/stats/velocity/assigned/:userId
export async function getAssignedVelocity(req: AuthRequest, res: Response): Promise<any> {
  try {
    const userId = parseUserId(req.params.userId);
    if (!userId) {
      return res.status(400).json({ success: false, error: "Valid userId is required" });
    }

    const range = parseVelocityRange(req.query.range);
    const velocity = await PmTaskModel.getAssignedVelocity(userId, range);
    return res.json({ success: true, data: velocity });
  } catch (error) {
    return handleError(res, error, "getAssignedVelocity");
  }
}
