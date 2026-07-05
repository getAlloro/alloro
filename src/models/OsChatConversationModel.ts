import { db } from "../database/connection";
import { BaseModel, QueryContext } from "./BaseModel";

/** Bare os.chat_conversations row (no aggregates). */
export interface IOsChatConversation {
  id: string;
  user_id: number;
  title: string | null;
  created_at: Date;
}

/**
 * Enriched sidebar row: the conversation plus its last-activity time, message
 * count, and a one-line preview of the newest message. `last_activity_at`
 * falls back to created_at for an empty conversation so ordering + the relative
 * time never read null.
 */
export interface IOsChatConversationListRow extends IOsChatConversation {
  last_activity_at: Date;
  message_count: number;
  last_message_preview: string | null;
}

const CONVERSATION_COLUMNS = ["id", "user_id", "title", "created_at"] as const;

/** Preview length for the newest-message snippet in the sidebar (§4.2). */
const OS_CONVERSATION_PREVIEW_MAX = 140;

/**
 * os.chat_conversations — one grounded-RAG chat thread, owned by an admin user
 * (plans/07042026-alloro-os-admin-port, D4; P5 T1; port of alloro-os
 * ChatConversationModel). user_id is an integer FK → public.users; deleting the
 * conversation cascades its messages + context-document rows.
 *
 * §11.7 posture: os.* tables are internal-admin single-tenant by design — no
 * organization/location column exists. Isolation is the super-admin gate on
 * every /api/admin/os route (§11.1) PLUS per-user ownership: every read/write
 * here filters by the owning user_id, so one admin never sees another's threads.
 */
export class OsChatConversationModel extends BaseModel {
  protected static tableName = "os.chat_conversations";

  static async createConversation(
    userId: number,
    title: string | null,
    trx?: QueryContext
  ): Promise<IOsChatConversation> {
    // created_at has a DB default and there is no updated_at column, so insert
    // directly rather than through BaseModel.create.
    const [row] = await this.table(trx)
      .insert({ user_id: userId, title })
      .returning([...CONVERSATION_COLUMNS]);
    return row as IOsChatConversation;
  }

  static async findConversationById(
    id: string,
    trx?: QueryContext
  ): Promise<IOsChatConversation | undefined> {
    return this.table(trx)
      .select(...CONVERSATION_COLUMNS)
      .where({ id })
      .first();
  }

  /**
   * Enriched thread list for one user, newest activity first. Left-joins an
   * aggregate of os.chat_messages for the count, last-message timestamp, and a
   * preview of the newest message; coalesces the activity time to created_at so
   * fresh conversations sort sensibly. One builder, all in the model (§7.4).
   */
  static async listForUser(
    userId: number,
    trx?: QueryContext
  ): Promise<IOsChatConversationListRow[]> {
    const conn = trx || db;
    const rows = await conn("os.chat_conversations as c")
      .where("c.user_id", userId)
      .leftJoin(
        conn("os.chat_messages")
          .select("conversation_id")
          .count("* as message_count")
          .max("created_at as last_message_at")
          .groupBy("conversation_id")
          .as("m"),
        "m.conversation_id",
        "c.id"
      )
      .leftJoin(
        conn("os.chat_messages as lm")
          .select("lm.conversation_id")
          .select(
            conn.raw(
              "substring((array_agg(lm.content order by lm.created_at desc))[1] for ?) as preview",
              [OS_CONVERSATION_PREVIEW_MAX]
            )
          )
          .groupBy("lm.conversation_id")
          .as("p"),
        "p.conversation_id",
        "c.id"
      )
      .select("c.id", "c.user_id", "c.title", "c.created_at")
      .select(conn.raw("coalesce(m.last_message_at, c.created_at) as last_activity_at"))
      .select(conn.raw("coalesce(m.message_count, 0)::int as message_count"))
      .select("p.preview as last_message_preview")
      .orderByRaw("coalesce(m.last_message_at, c.created_at) desc");
    return rows as IOsChatConversationListRow[];
  }

  static async updateTitle(
    id: string,
    title: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).update({ title });
  }

  /** Hard delete — CASCADE removes messages + context-document rows. */
  static async deleteConversation(id: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ id }).del();
  }
}
