import { BaseModel, QueryContext } from "./BaseModel";

/** How a document became grounding context: user @-attach, or AI-retrieved. */
export type OsChatContextOrigin = "manual" | "ai";

export interface IOsChatContextDocument {
  conversation_id: string;
  document_id: string;
  origin: OsChatContextOrigin;
}

const CONTEXT_COLUMNS = ["conversation_id", "document_id", "origin"] as const;

/**
 * os.chat_context_documents — documents pinned to a conversation as grounding
 * context (plans/07042026-alloro-os-admin-port, D4; P5 T1). Composite PK
 * (conversation_id, document_id); origin ∈ manual|ai. Rows cascade-delete with
 * either the conversation or the document. Attach is an idempotent upsert so a
 * re-attach never errors (§21.1-style safety on a user action).
 *
 * §11.7 posture: os.* tables are internal-admin single-tenant by design;
 * isolation is the super-admin gate on every /api/admin/os route (§11.1) plus
 * per-user conversation ownership enforced in OsChatService before any call
 * here.
 */
export class OsChatContextDocumentModel extends BaseModel {
  protected static tableName = "os.chat_context_documents";

  static async findByConversation(
    conversationId: string,
    trx?: QueryContext
  ): Promise<IOsChatContextDocument[]> {
    return this.table(trx)
      .select(...CONTEXT_COLUMNS)
      .where({ conversation_id: conversationId })
      .orderBy("document_id", "asc");
  }

  /** Idempotent attach — re-attaching the same doc keeps the existing origin. */
  static async attach(
    conversationId: string,
    documentId: string,
    origin: OsChatContextOrigin,
    trx?: QueryContext
  ): Promise<void> {
    await this.table(trx)
      .insert({
        conversation_id: conversationId,
        document_id: documentId,
        origin,
      })
      .onConflict(["conversation_id", "document_id"])
      .ignore();
  }

  static async detach(
    conversationId: string,
    documentId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ conversation_id: conversationId, document_id: documentId })
      .del();
  }
}
