import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

export class PmActivityLogModel extends BaseModel {
  protected static tableName = "pm_activity_log";
  protected static jsonFields = ["metadata"];

  // pm_activity_log has created_at (DB default) but no updated_at
  static async create(data: Record<string, unknown>, trx?: QueryContext): Promise<any> {
    const serialized = this.serializeJsonFields(data);
    const [result] = await this.table(trx).insert(serialized).returning("*");
    return this.deserializeJsonFields(result);
  }

  // Total count, optionally filtered by a single column equality.
  static async countAll(
    conditions?: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    let query = this.table(trx);
    if (conditions) query = query.where(conditions);
    const [countResult] = await query.count("* as count");
    return parseInt(countResult.count as string, 10) || 0;
  }

  // GET /api/pm/activity — global feed joined to project, task, and user.
  static async listGlobal(
    limit: number,
    offset: number,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .select(
        "pm_activity_log.*",
        "pm_projects.name as project_name",
        "pm_projects.color as project_color",
        "pm_tasks.title as task_title",
        "users.email as user_email"
      )
      .leftJoin("pm_projects", "pm_activity_log.project_id", "pm_projects.id")
      .leftJoin("pm_tasks", "pm_activity_log.task_id", "pm_tasks.id")
      .leftJoin("users", "pm_activity_log.user_id", "users.id")
      .orderBy("pm_activity_log.created_at", "desc")
      .limit(limit)
      .offset(offset);
  }

  // GET /api/pm/activity/projects/:id/activity — project-scoped feed.
  static async listByProject(
    projectId: string,
    limit: number,
    offset: number,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .select(
        "pm_activity_log.*",
        "pm_tasks.title as task_title",
        "users.email as user_email"
      )
      .leftJoin("pm_tasks", "pm_activity_log.task_id", "pm_tasks.id")
      .leftJoin("users", "pm_activity_log.user_id", "users.id")
      .where("pm_activity_log.project_id", projectId)
      .orderBy("pm_activity_log.created_at", "desc")
      .limit(limit)
      .offset(offset);
  }

  // GET /api/pm/tasks/:id/activity — task-scoped feed.
  static async listByTask(
    taskId: string,
    limit: number,
    offset: number,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .select("pm_activity_log.*", "users.email as user_email")
      .leftJoin("users", "pm_activity_log.user_id", "users.id")
      .where("pm_activity_log.task_id", taskId)
      .orderBy("pm_activity_log.created_at", "desc")
      .limit(limit)
      .offset(offset);
  }

  // DELETE /api/pm/activity — clear all rows, returns deleted count.
  static async deleteAll(trx?: QueryContext): Promise<number> {
    return this.table(trx).del();
  }

  // GET /api/pm/stats/chart-data — 14-day daily task_completed counts, zero-filled.
  static async getDailyCompletionRows(
    trx?: QueryContext
  ): Promise<Array<{ date: Date | string; count: number | string }>> {
    const result = await (trx || db).raw(`
      SELECT d.date::date as date, COUNT(a.id)::int as count
      FROM generate_series(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, '1 day') as d(date)
      LEFT JOIN pm_activity_log a
        ON a.action = 'task_completed'
        AND DATE(a.created_at) = d.date::date
      GROUP BY d.date
      ORDER BY d.date ASC
    `);
    return result.rows;
  }
}
