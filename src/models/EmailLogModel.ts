import { Knex } from "knex";
import { BaseModel } from "./BaseModel";

/**
 * `email_logs` — one row per outbound email, written at the single sendEmail
 * choke-point. Backs the internal-admin Email Logs dashboard
 * (plans/07062026-email-logs-dashboard).
 *
 * jsonb columns (recipients/cc/bcc/original_recipients) are inserted with an
 * explicit JSON.stringify — the proven repo pattern for jsonb writes (see
 * OsActivityModel/OsChatMessageModel); a bare JS array would be coerced into a
 * Postgres array literal, not JSON. Reads come back already parsed by node-pg.
 */

export type EmailLogStatus =
  | "queued"
  | "sent"
  | "failed"
  | "delivered"
  | "opened"
  | "bounced"
  | "complained";

export interface IEmailLog {
  id: string;
  category: string;
  status: EmailLogStatus;
  from_email: string | null;
  from_name: string | null;
  recipients: string[];
  cc: string[];
  bcc: string[];
  subject: string | null;
  body_html: string | null;
  provider_message_id: string | null;
  intercepted: boolean;
  original_recipients: string[] | null;
  error: string | null;
  created_at: Date;
  updated_at: Date;
  delivered_at: Date | null;
  opened_at: Date | null;
}

/** List rows omit the heavy (and PII-heavy) body_html; detail includes it. */
export type EmailLogListItem = Omit<IEmailLog, "body_html">;

export interface CreateEmailLogInput {
  category: string;
  status: EmailLogStatus;
  from_email: string | null;
  from_name: string | null;
  recipients: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body_html: string;
  provider_message_id: string | null;
  intercepted: boolean;
  original_recipients: string[] | null;
  error: string | null;
}

export interface EmailLogListFilters {
  category?: string;
  status?: string;
  from?: string; // ISO date/time lower bound (created_at >=)
  to?: string; // ISO date/time upper bound (created_at <=)
  search?: string; // matches subject or any recipient
  limit: number;
  offset: number;
}

const EVENT_STATUS = ["delivered", "opened", "bounced", "complained", "failed"] as const;
export type EmailLogEvent = (typeof EVENT_STATUS)[number];

const LIST_COLUMNS = [
  "id",
  "category",
  "status",
  "from_email",
  "from_name",
  "recipients",
  "cc",
  "bcc",
  "subject",
  "provider_message_id",
  "intercepted",
  "original_recipients",
  "error",
  "created_at",
  "updated_at",
  "delivered_at",
  "opened_at",
];

export class EmailLogModel extends BaseModel {
  protected static tableName = "email_logs";

  /** Insert one email-log row. Callers (sendEmail) swallow any throw. */
  static async createLog(input: CreateEmailLogInput): Promise<void> {
    await this.table().insert({
      category: input.category,
      status: input.status,
      from_email: input.from_email,
      from_name: input.from_name,
      recipients: JSON.stringify(input.recipients ?? []),
      cc: JSON.stringify(input.cc ?? []),
      bcc: JSON.stringify(input.bcc ?? []),
      subject: input.subject,
      body_html: input.body_html,
      provider_message_id: input.provider_message_id,
      intercepted: input.intercepted,
      original_recipients:
        input.original_recipients === null
          ? null
          : JSON.stringify(input.original_recipients),
      error: input.error,
    });
  }

  /**
   * Apply a Mailgun delivery/engagement event to the matching row, keyed on
   * provider_message_id. Idempotent (a repeat event re-writes the same state).
   * Returns rows affected (0 = no matching send row yet).
   *
   * `delivered` never regresses a row already marked `opened` (open implies
   * delivered, and delivered can arrive out of order on retries).
   */
  static async recordEvent(
    providerMessageId: string,
    event: EmailLogEvent
  ): Promise<number> {
    const now = new Date();

    if (event === "delivered") {
      return this.table()
        .where({ provider_message_id: providerMessageId })
        .whereNot({ status: "opened" })
        .update({ status: "delivered", delivered_at: now, updated_at: now });
    }

    if (event === "opened") {
      return this.table()
        .where({ provider_message_id: providerMessageId })
        .update({ status: "opened", opened_at: now, updated_at: now });
    }

    // bounced | complained | failed — terminal negative states.
    return this.table()
      .where({ provider_message_id: providerMessageId })
      .update({ status: event, updated_at: now });
  }

  /** Paginated, filtered list. Omits body_html (fetched only in detail). */
  static async listLogs(
    filters: EmailLogListFilters
  ): Promise<{ data: EmailLogListItem[]; total: number }> {
    const applyFilters = (qb: Knex.QueryBuilder): Knex.QueryBuilder => {
      let q = qb;
      if (filters.category) q = q.where("category", filters.category);
      if (filters.status) q = q.where("status", filters.status);
      if (filters.from) q = q.where("created_at", ">=", filters.from);
      if (filters.to) q = q.where("created_at", "<=", filters.to);
      if (filters.search) {
        const like = `%${filters.search}%`;
        q = q.where((b) => {
          b.whereRaw("subject ILIKE ?", [like]).orWhereRaw(
            "recipients::text ILIKE ?",
            [like]
          );
        });
      }
      return q;
    };

    const countRow = await applyFilters(this.table())
      .count("* as count")
      .first();
    const total = parseInt((countRow as { count?: string })?.count ?? "0", 10) || 0;

    const rows = (await applyFilters(this.table())
      .select(LIST_COLUMNS)
      .orderBy("created_at", "desc")
      .limit(filters.limit)
      .offset(filters.offset)) as EmailLogListItem[];

    return { data: rows, total };
  }

  /** Full detail including body_html. */
  static async getDetailById(id: string): Promise<IEmailLog | undefined> {
    const row = await this.table().where({ id }).first();
    return row as IEmailLog | undefined;
  }
}
