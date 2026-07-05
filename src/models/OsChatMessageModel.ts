import { BaseModel, QueryContext } from "./BaseModel";

export type OsChatRole = "user" | "assistant";

/**
 * A citation attached to an assistant message. The shape is EXACTLY the
 * retrieval-hit projection (see OsDocumentChunkModel.IOsChunkSearchHit): it is
 * built server-side from the retrieval result set only, never parsed from model
 * output. chunk_index is null for a whole-document (manual attachment) citation.
 */
export interface IOsChatCitation {
  document_id: string;
  version_no: number;
  chunk_index: number | null;
  heading_path: string | null;
}

export interface IOsChatMessage {
  id: string;
  conversation_id: string;
  role: OsChatRole;
  content: string;
  citations: IOsChatCitation[];
  created_at: Date;
}

const MESSAGE_COLUMNS = [
  "id",
  "conversation_id",
  "role",
  "content",
  "citations",
  "created_at",
] as const;

/**
 * os.chat_messages — the ordered turns of a conversation
 * (plans/07042026-alloro-os-admin-port, D4; P5 T1). role ∈ user|assistant (a DB
 * CHECK enforces it); citations is a jsonb array, defaulting to []. The row is
 * deleted by the conversation's ON DELETE CASCADE.
 *
 * citations is declared in jsonFields so BaseModel deserializes it on read; the
 * insert path stringifies it explicitly (pg's jsonb binding), mirroring
 * OsDocumentAiIndexModel's tags handling.
 *
 * §11.7 posture: os.* tables are internal-admin single-tenant by design;
 * isolation is the super-admin gate on every /api/admin/os route (§11.1) plus
 * per-user conversation ownership enforced in OsChatService.
 */
export class OsChatMessageModel extends BaseModel {
  protected static tableName = "os.chat_messages";
  protected static jsonFields = ["citations"];

  static async createMessage(
    conversationId: string,
    role: OsChatRole,
    content: string,
    citations: IOsChatCitation[],
    trx?: QueryContext
  ): Promise<IOsChatMessage> {
    // created_at has a DB default and there is no updated_at column, so insert
    // directly; citations rides a jsonb binding (§10.1) as a JSON string.
    const [row] = await this.table(trx)
      .insert({
        conversation_id: conversationId,
        role,
        content,
        citations: JSON.stringify(citations),
      })
      .returning([...MESSAGE_COLUMNS]);
    return this.deserializeJsonFields(row) as IOsChatMessage;
  }

  /** Every message in a conversation, oldest first — the transcript order. */
  static async listForConversation(
    conversationId: string,
    trx?: QueryContext
  ): Promise<IOsChatMessage[]> {
    const rows = await this.table(trx)
      .select(...MESSAGE_COLUMNS)
      .where({ conversation_id: conversationId })
      .orderBy("created_at", "asc")
      .orderBy("id", "asc");
    return rows.map(
      (row: unknown) => this.deserializeJsonFields(row) as IOsChatMessage
    );
  }
}
