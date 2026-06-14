import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

export class PmProjectModel extends BaseModel {
  protected static tableName = "pm_projects";
  protected static jsonFields: string[] = [];

  // GET /api/pm/projects — projects of a given status, each augmented with
  // total/completed task counts and the latest open-task deadline.
  static async listByStatusWithTaskCounts(
    status: string,
    trx?: QueryContext
  ): Promise<any[]> {
    const ctx = trx || db;
    return this.table(trx)
      .where({ status })
      .select("pm_projects.*")
      .select(
        ctx.raw(`(SELECT COUNT(*) FROM pm_tasks WHERE pm_tasks.project_id = pm_projects.id)::int AS total_tasks`)
      )
      .select(
        ctx.raw(`(SELECT COUNT(*) FROM pm_tasks WHERE pm_tasks.project_id = pm_projects.id AND pm_tasks.completed_at IS NOT NULL)::int AS completed_tasks`)
      )
      .select(
        ctx.raw(`(SELECT MAX(deadline) FROM pm_tasks WHERE pm_tasks.project_id = pm_projects.id AND pm_tasks.completed_at IS NULL AND deadline IS NOT NULL) AS latest_task_deadline`)
      )
      .orderBy("created_at", "desc");
  }

  // Per-project task counts grouped by column name (status breakdown).
  static async getStatusCounts(
    projectId: string,
    trx?: QueryContext
  ): Promise<Array<{ name: string; count: number | string }>> {
    return this.table(trx)
      .from("pm_tasks")
      .join("pm_columns", "pm_tasks.column_id", "pm_columns.id")
      .where("pm_tasks.project_id", projectId)
      .groupBy("pm_columns.name")
      .select("pm_columns.name")
      .count("* as count");
  }

  // Daily activity-log counts for a project over the last 90 days.
  static async getDailyActivity(
    projectId: string,
    trx?: QueryContext
  ): Promise<Array<{ date: unknown; count: number | string }>> {
    const ctx = trx || db;
    return this.table(trx)
      .from("pm_activity_log")
      .where("project_id", projectId)
      .where("created_at", ">=", ctx.raw("NOW() - INTERVAL '90 days'"))
      .groupByRaw("DATE(created_at)")
      .select(ctx.raw("DATE(created_at) as date"))
      .count("* as count")
      .orderBy("date", "asc");
  }

  // GET /api/pm/projects/:id — columns ordered by position.
  static async getColumns(
    projectId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .from("pm_columns")
      .where({ project_id: projectId })
      .orderBy("position", "asc");
  }

  // GET /api/pm/projects/:id — tasks for a project joined to creator/assignee.
  static async getTasksWithUsers(
    projectId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .from("pm_tasks")
      .select(
        "pm_tasks.*",
        "creators.email as creator_email",
        "assignees.email as assignee_email"
      )
      .leftJoin("users as creators", "pm_tasks.created_by", "creators.id")
      .leftJoin("users as assignees", "pm_tasks.assigned_to", "assignees.id")
      .where("pm_tasks.project_id", projectId)
      .orderBy("pm_tasks.position", "asc");
  }

  // Fetch a single project row by id (raw row, no JSON handling).
  static async findByIdRaw(
    id: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx).where({ id }).first();
  }

  // Fetch a single project's name (used in notification metadata).
  static async findNameById(
    id: string,
    trx?: QueryContext
  ): Promise<{ name: string } | undefined> {
    return this.table(trx).where("id", id).select("name").first();
  }

  // Active projects with id/name/description for AI-synth cross-project prompts.
  static async listActiveForPrompt(
    trx?: QueryContext
  ): Promise<Array<{ id: string; name: string; description: string | null }>> {
    return this.table(trx)
      .where({ status: "active" })
      .select("id", "name", "description")
      .orderBy("name", "asc");
  }
}
