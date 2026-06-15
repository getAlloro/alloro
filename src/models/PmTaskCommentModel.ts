import { BaseModel, QueryContext } from "./BaseModel";

/**
 * PmTaskCommentModel — flat markdown comments on a PM task.
 *
 * `mentions` is a native PG INTEGER[] column (see migration
 * 20260414000002_pm_comments_and_notification_types.ts) — Knex round-trips
 * it as a JS number[] with no serialization, so it is NOT registered as a
 * jsonField.
 */
export class PmTaskCommentModel extends BaseModel {
  protected static tableName = "pm_task_comments";
  protected static jsonFields: string[] = [];

  // GET /api/pm/tasks/:id/comments — chronological, joined to author email.
  static async listByTaskWithAuthor(
    taskId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .from("pm_task_comments as c")
      .leftJoin("users as u", "c.author_id", "u.id")
      .where("c.task_id", taskId)
      .orderBy("c.created_at", "asc")
      .select(
        "c.id",
        "c.task_id",
        "c.author_id",
        "c.body",
        "c.mentions",
        "c.edited_at",
        "c.created_at",
        "u.email as author_email"
      );
  }

  // PUT /api/pm/tasks/:id/comments/:commentId — body/mentions edit.
  static async updateBody(
    commentId: string,
    data: { body: string; mentions: number[] },
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id: commentId })
      .update({
        body: data.body,
        mentions: data.mentions,
        edited_at: new Date(),
        updated_at: new Date(),
      });
  }

  // DELETE /api/pm/tasks/:id/comments/:commentId
  static async deleteByIdRaw(
    commentId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id: commentId }).del();
  }
}
