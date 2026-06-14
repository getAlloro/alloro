import { BaseModel, QueryContext } from "./BaseModel";

/**
 * PmNotificationModel — per-user PM notifications (pm_notifications).
 *
 * Rows are inserted by the comments/tasks controllers as part of their
 * create/move/assign transactions, so the write helpers thread `trx` to keep
 * those operations atomic. `metadata` is JSONB; Knex round-trips it without
 * manual serialization, matching the inline behavior these methods replaced.
 */
export class PmNotificationModel extends BaseModel {
  protected static tableName = "pm_notifications";
  protected static jsonFields: string[] = [];

  // GET /api/pm/notifications — newest 50 for a user, joined to actor email.
  static async listForUserWithActorEmail(
    userId: number,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .from("pm_notifications as n")
      .leftJoin("users as u", "n.actor_user_id", "u.id")
      .where("n.user_id", userId)
      .orderBy("n.created_at", "desc")
      .limit(50)
      .select("n.*", "u.email as actor_email");
  }

  // PUT /api/pm/notifications/read-all
  static async markAllReadForUser(
    userId: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ user_id: userId, is_read: false })
      .update({ is_read: true });
  }

  // DELETE /api/pm/notifications
  static async deleteAllForUser(
    userId: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where("user_id", userId).delete();
  }

  // Insert a single notification row (used inside task transactions).
  static async insertOne(
    payload: {
      user_id: number;
      type: string;
      task_id: string;
      actor_user_id: number;
      metadata: Record<string, unknown>;
    },
    trx?: QueryContext
  ): Promise<void> {
    await this.table(trx).insert(payload);
  }

  // Batch insert (used by the comment fan-out).
  static async insertMany(
    rows: Array<{
      user_id: number;
      type: string;
      task_id: string;
      actor_user_id: number;
      metadata: Record<string, unknown>;
    }>,
    trx?: QueryContext
  ): Promise<void> {
    if (rows.length === 0) return;
    await this.table(trx).insert(rows);
  }
}
