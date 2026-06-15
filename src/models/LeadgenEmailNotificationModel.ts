import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

/**
 * `leadgen_email_notifications` — the FAB "Email me when ready" queue.
 *
 * Owns the upsert + status-transition writes that the leadgen email-notify
 * service previously ran inline. The upsert is a Postgres `ON CONFLICT` raw
 * statement (preserved verbatim) because it carries a conditional `WHERE`
 * that knex's `onConflict().merge()` can't express cleanly.
 */
export interface ILeadgenEmailNotification {
  id: string;
  session_id: string;
  audit_id: string;
  email: string;
  status: string;
  attempt_count: number;
  last_error: string | null;
  sent_at: Date | null;
  created_at: Date;
}

/** Drain projection — the columns the worker drain selects. */
export type NotificationRow = Pick<
  ILeadgenEmailNotification,
  "id" | "session_id" | "audit_id" | "email" | "status"
>;

export class LeadgenEmailNotificationModel extends BaseModel {
  protected static tableName = "leadgen_email_notifications";

  /**
   * Idempotent upsert. Latest email wins on conflict, but a row already
   * marked `sent` is never overwritten (don't double-email the user).
   */
  static async upsertPending(
    sessionId: string,
    auditId: string,
    email: string,
    trx?: QueryContext
  ): Promise<void> {
    await (trx || db).raw(
      `
      INSERT INTO leadgen_email_notifications
        (session_id, audit_id, email, status, created_at)
      VALUES (?, ?, ?, 'pending', NOW())
      ON CONFLICT (session_id, audit_id) DO UPDATE
        SET email = EXCLUDED.email
        WHERE leadgen_email_notifications.status <> 'sent'
      `,
      [sessionId, auditId, email]
    );
  }

  /** Pending notifications for an audit (drain projection). */
  static async findPendingForAudit(
    auditId: string,
    trx?: QueryContext
  ): Promise<NotificationRow[]> {
    return this.table(trx)
      .select("id", "session_id", "audit_id", "email", "status")
      .where({ audit_id: auditId, status: "pending" });
  }

  /** Mark the (session_id, audit_id) row sent + bump attempt_count. */
  static async markSentBySessionAudit(
    sessionId: string,
    auditId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ session_id: sessionId, audit_id: auditId })
      .update({ status: "sent", sent_at: db.fn.now() })
      .increment("attempt_count", 1);
  }

  /** Mark the (session_id, audit_id) row failed + bump attempt_count. */
  static async markFailedBySessionAudit(
    sessionId: string,
    auditId: string,
    lastError: string | null,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ session_id: sessionId, audit_id: auditId })
      .update({ status: "failed", last_error: lastError })
      .increment("attempt_count", 1);
  }

  /** Mark a row sent by primary key + bump attempt_count (drain path). */
  static async markSentById(
    id: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id })
      .update({ status: "sent", sent_at: db.fn.now() })
      .increment("attempt_count", 1);
  }

  /** Mark a row failed by primary key + bump attempt_count (drain path). */
  static async markFailedById(
    id: string,
    lastError: string | null,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id })
      .update({ status: "failed", last_error: lastError })
      .increment("attempt_count", 1);
  }
}
