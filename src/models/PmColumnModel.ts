import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

export interface PmColumnSummary {
  id: string;
  project_id: string;
  name: string;
  position: number;
  is_backlog: boolean;
  task_count: number;
}

export interface PmProjectColumnIds {
  backlog_id: string;
  todo_id: string;
  in_progress_id: string;
  done_id: string;
  columns: PmColumnSummary[];
}

type PmColumnSummaryDbRow = Omit<PmColumnSummary, "task_count"> & {
  task_count: string | number;
};

export class PmColumnModel extends BaseModel {
  protected static tableName = "pm_columns";
  protected static jsonFields: string[] = [];

  // pm_columns has no created_at/updated_at — override BaseModel.create
  static async create(data: Record<string, unknown>, trx?: QueryContext): Promise<any> {
    const [result] = await this.table(trx).insert(data).returning("*");
    return result;
  }

  // The backlog column for a project (each project has exactly one).
  static async findBacklogForProject(
    projectId: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ project_id: projectId, is_backlog: true })
      .first();
  }

  static async getActiveProjectColumnMaps(): Promise<Map<string, PmProjectColumnIds>> {
    const rows = (await db("pm_columns")
      .join("pm_projects", "pm_columns.project_id", "pm_projects.id")
      .leftJoin("pm_tasks", "pm_tasks.column_id", "pm_columns.id")
      .where("pm_projects.status", "active")
      .groupBy(
        "pm_columns.id",
        "pm_columns.project_id",
        "pm_columns.name",
        "pm_columns.position",
        "pm_columns.is_backlog"
      )
      .select(
        "pm_columns.id",
        "pm_columns.project_id",
        "pm_columns.name",
        "pm_columns.position",
        "pm_columns.is_backlog"
      )
      .count("pm_tasks.id as task_count")
      .orderBy("pm_columns.project_id", "asc")
      .orderBy("pm_columns.position", "asc")) as unknown as PmColumnSummaryDbRow[];

    const maps = new Map<string, PmProjectColumnIds>();

    for (const row of rows) {
      const summary: PmColumnSummary = {
        id: row.id,
        project_id: row.project_id,
        name: row.name,
        position: Number(row.position),
        is_backlog: Boolean(row.is_backlog),
        task_count: Number(row.task_count) || 0,
      };

      const entry = maps.get(row.project_id) ?? {
        backlog_id: "",
        todo_id: "",
        in_progress_id: "",
        done_id: "",
        columns: [],
      };

      entry.columns.push(summary);
      const normalized = row.name.toLowerCase().replace(/\s+/g, "_");

      if (row.is_backlog) entry.backlog_id = row.id;
      else if (normalized === "to_do") entry.todo_id = row.id;
      else if (normalized === "in_progress") entry.in_progress_id = row.id;
      else if (normalized === "done") entry.done_id = row.id;

      maps.set(row.project_id, entry);
    }

    return maps;
  }
}
