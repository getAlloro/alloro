import { BaseModel } from "./BaseModel";
import { db } from "../database/connection";
import { PmColumnModel, PmProjectColumnIds } from "./PmColumnModel";

export type PmTaskStatusKey = "todo" | "in_progress" | "done";
export type PmVelocityRange = "7d" | "4w" | "3m";

export interface PmTaskViewRow {
  id: string;
  project_id: string;
  column_id: string;
  title: string;
  description: string | null;
  priority: "P1" | "P2" | "P3" | "P4" | "P5" | null;
  deadline: string | null;
  position: number;
  assigned_to: number | null;
  created_by: number;
  completed_at: string | null;
  source: "manual" | "ai_synth";
  created_at: string;
  updated_at: string;
  project_name: string;
  project_color: string;
  project_icon: string;
  column_name: string;
  column_is_backlog: boolean;
  creator_name: string | null;
  assignee_name: string | null;
  project_column_ids: PmProjectColumnIds;
}

export interface PmAssignedTaskGroups {
  todo: PmTaskViewRow[];
  in_progress: PmTaskViewRow[];
  done: PmTaskViewRow[];
}

export interface PmBacklogProjectGroup {
  project_id: string;
  project_name: string;
  project_color: string;
  project_icon: string;
  column_ids: PmProjectColumnIds;
  tasks: PmTaskViewRow[];
}

export interface PmAssignedStats {
  focus_today: {
    count: number;
    subtitle: string;
    severity: "green" | "amber" | "red";
  };
  this_week: { count: number; subtitle: string };
}

export interface PmVelocityData {
  completed_total: number;
  overdue_total: number;
  data: Array<{
    label: string;
    period_start: string;
    completed: number;
    overdue: number;
  }>;
}

type TaskViewDbRow = Omit<PmTaskViewRow, "creator_name" | "assignee_name" | "project_column_ids"> & {
  creator_email: string | null;
  assignee_email: string | null;
};

function nameFromEmail(email: string | null): string | null {
  return email ? email.split("@")[0] : null;
}

function statusKey(columnName: string): PmTaskStatusKey | null {
  const key = columnName.toLowerCase().replace(/\s+/g, "_");
  if (key === "to_do") return "todo";
  if (key === "in_progress" || key === "done") return key;
  return null;
}

function toDateKey(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function formatVelocityLabel(dateStr: string, labelFormat: "day" | "week" | "month"): string {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const d = new Date(dateStr);
  if (labelFormat === "day") return dayNames[d.getUTCDay()];
  if (labelFormat === "week") return `${monthNames[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return monthNames[d.getUTCMonth()];
}

export class PmTaskModel extends BaseModel {
  protected static tableName = "pm_tasks";
  protected static jsonFields: string[] = [];

  private static baseTaskViewQuery() {
    return db("pm_tasks")
      .select(
        "pm_tasks.*",
        "pm_projects.name as project_name",
        "pm_projects.color as project_color",
        "pm_projects.icon as project_icon",
        "pm_columns.name as column_name",
        "pm_columns.is_backlog as column_is_backlog",
        "creators.email as creator_email",
        "assignees.email as assignee_email"
      )
      .join("pm_projects", "pm_tasks.project_id", "pm_projects.id")
      .join("pm_columns", "pm_tasks.column_id", "pm_columns.id")
      .leftJoin("users as creators", "pm_tasks.created_by", "creators.id")
      .leftJoin("users as assignees", "pm_tasks.assigned_to", "assignees.id")
      .where("pm_projects.status", "active");
  }

  private static async hydrateRows(rows: TaskViewDbRow[]): Promise<PmTaskViewRow[]> {
    const columnMaps = await PmColumnModel.getActiveProjectColumnMaps();
    return rows.map((row) => {
      const { creator_email, assignee_email, ...task } = row;
      return {
        ...task,
        column_is_backlog: Boolean(task.column_is_backlog),
        creator_name: nameFromEmail(creator_email),
        assignee_name: nameFromEmail(assignee_email),
        project_column_ids:
          columnMaps.get(task.project_id) ?? {
            backlog_id: "",
            todo_id: "",
            in_progress_id: "",
            done_id: "",
            columns: [],
          },
      };
    });
  }

  static async listGlobalBacklogGroups(): Promise<PmBacklogProjectGroup[]> {
    const rows = (await this.baseTaskViewQuery()
      .where("pm_columns.is_backlog", true)
      .whereNull("pm_tasks.completed_at")
      .orderBy("pm_projects.name", "asc")
      .orderBy("pm_tasks.position", "asc")) as TaskViewDbRow[];

    const tasks = await this.hydrateRows(rows);
    const groups = new Map<string, PmBacklogProjectGroup>();

    for (const task of tasks) {
      const group = groups.get(task.project_id) ?? {
        project_id: task.project_id,
        project_name: task.project_name,
        project_color: task.project_color,
        project_icon: task.project_icon,
        column_ids: task.project_column_ids,
        tasks: [],
      };
      group.tasks.push(task);
      groups.set(task.project_id, group);
    }

    return Array.from(groups.values());
  }

  static async listAssignedTaskGroups(userId: number): Promise<PmAssignedTaskGroups> {
    const rows = (await this.baseTaskViewQuery()
      .where("pm_tasks.assigned_to", userId)
      .where("pm_columns.is_backlog", false)
      .orderBy("pm_columns.position", "asc")
      .orderBy("pm_tasks.position", "asc")) as TaskViewDbRow[];

    const tasks = await this.hydrateRows(rows);
    const groups: PmAssignedTaskGroups = { todo: [], in_progress: [], done: [] };

    for (const task of tasks) {
      const key = statusKey(task.column_name);
      if (key) groups[key].push(task);
    }

    return groups;
  }

  static async getAssignedStats(userId: number): Promise<PmAssignedStats> {
    const [focusResult] = await db("pm_tasks")
      .join("pm_projects", "pm_tasks.project_id", "pm_projects.id")
      .where("pm_projects.status", "active")
      .whereNull("pm_tasks.completed_at")
      .where("pm_tasks.assigned_to", userId)
      .whereIn("pm_tasks.priority", ["P1", "P2"])
      .count("* as count");

    const [weekResult] = await db("pm_tasks")
      .join("pm_projects", "pm_tasks.project_id", "pm_projects.id")
      .where("pm_projects.status", "active")
      .whereNull("pm_tasks.completed_at")
      .where("pm_tasks.assigned_to", userId)
      .whereIn("pm_tasks.priority", ["P3", "P4"])
      .count("* as count");

    const focusCount = parseInt(focusResult.count as string, 10) || 0;
    const weekCount = parseInt(weekResult.count as string, 10) || 0;

    return {
      focus_today: {
        count: focusCount,
        subtitle: focusCount === 0 ? "You're clear" : `${focusCount} urgent`,
        severity: focusCount === 0 ? "green" : focusCount <= 3 ? "amber" : "red",
      },
      this_week: {
        count: weekCount,
        subtitle: weekCount === 0 ? "All scheduled" : `${weekCount} this week`,
      },
    };
  }

  static async getAssignedVelocity(userId: number, range: PmVelocityRange): Promise<PmVelocityData> {
    let completedQuery: string;
    let overdueQuery: string;
    let labelFormat: "day" | "week" | "month";

    if (range === "4w") {
      completedQuery = `
        SELECT DATE_TRUNC('week', completed_at)::date as period_start, COUNT(*)::int as completed
        FROM pm_tasks WHERE completed_at IS NOT NULL AND assigned_to = ?
          AND completed_at >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '3 weeks'
        GROUP BY DATE_TRUNC('week', completed_at) ORDER BY period_start ASC
      `;
      overdueQuery = `
        SELECT w.week_start::date as period_start, COUNT(t.id)::int as overdue
        FROM generate_series(DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '3 weeks', DATE_TRUNC('week', CURRENT_DATE), '1 week') as w(week_start)
        LEFT JOIN pm_tasks t ON t.deadline IS NOT NULL AND t.assigned_to = ?
          AND t.deadline >= w.week_start AND t.deadline < w.week_start + INTERVAL '7 days'
          AND (t.completed_at IS NULL OR DATE(t.completed_at AT TIME ZONE 'America/Los_Angeles') > DATE(t.deadline AT TIME ZONE 'UTC'))
        GROUP BY w.week_start ORDER BY w.week_start ASC
      `;
      labelFormat = "week";
    } else if (range === "3m") {
      completedQuery = `
        SELECT DATE_TRUNC('month', completed_at)::date as period_start, COUNT(*)::int as completed
        FROM pm_tasks WHERE completed_at IS NOT NULL AND assigned_to = ?
          AND completed_at >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '2 months'
        GROUP BY DATE_TRUNC('month', completed_at) ORDER BY period_start ASC
      `;
      overdueQuery = `
        SELECT m.month_start::date as period_start, COUNT(t.id)::int as overdue
        FROM generate_series(DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '2 months', DATE_TRUNC('month', CURRENT_DATE), '1 month') as m(month_start)
        LEFT JOIN pm_tasks t ON t.deadline IS NOT NULL AND t.assigned_to = ?
          AND t.deadline >= m.month_start AND t.deadline < m.month_start + INTERVAL '1 month'
          AND (t.completed_at IS NULL OR DATE(t.completed_at AT TIME ZONE 'America/Los_Angeles') > DATE(t.deadline AT TIME ZONE 'UTC'))
        GROUP BY m.month_start ORDER BY m.month_start ASC
      `;
      labelFormat = "month";
    } else {
      completedQuery = `
        SELECT DATE(completed_at) as period_start, COUNT(*)::int as completed
        FROM pm_tasks WHERE completed_at IS NOT NULL AND assigned_to = ?
          AND completed_at >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY DATE(completed_at) ORDER BY period_start ASC
      `;
      overdueQuery = `
        SELECT d.date::date as period_start, COUNT(t.id)::int as overdue
        FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day') as d(date)
        LEFT JOIN pm_tasks t ON t.deadline IS NOT NULL AND t.assigned_to = ?
          AND t.deadline >= d.date AND t.deadline < d.date + INTERVAL '1 day'
          AND (t.completed_at IS NULL OR DATE(t.completed_at AT TIME ZONE 'America/Los_Angeles') > DATE(t.deadline AT TIME ZONE 'UTC'))
        GROUP BY d.date ORDER BY d.date ASC
      `;
      labelFormat = "day";
    }

    const [completedRows, overdueRows] = await Promise.all([
      db.raw(completedQuery, [userId]),
      db.raw(overdueQuery, [userId]),
    ]);

    const completedMap = new Map<string, number>();
    for (const r of completedRows.rows) {
      completedMap.set(toDateKey(r.period_start), r.completed);
    }

    const overdueMap = new Map<string, number>();
    for (const r of overdueRows.rows) {
      overdueMap.set(toDateKey(r.period_start), r.overdue);
    }

    const sortedDates = Array.from(new Set([...completedMap.keys(), ...overdueMap.keys()])).sort();
    const data = sortedDates.map((dateStr) => ({
      label: formatVelocityLabel(dateStr, labelFormat),
      period_start: dateStr,
      completed: completedMap.get(dateStr) || 0,
      overdue: overdueMap.get(dateStr) || 0,
    }));

    return {
      completed_total: data.reduce((sum, row) => sum + row.completed, 0),
      overdue_total: data.reduce((sum, row) => sum + row.overdue, 0),
      data,
    };
  }
}
