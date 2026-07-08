/**
 * Grounded RAG chat service for the OS knowledge base
 * (plans/07042026-alloro-os-admin-port, P5 T1; port of alloro-os ChatService).
 *
 * Owns the conversation lifecycle and the send pipeline: per-user ownership,
 * conversation/context CRUD, history build, context assembly (manual @-attached
 * documents in full + retrieved chunks), server-side citation assembly, async
 * non-blocking auto-title on the first message, and the grounded-refusal
 * contract (an empty retrieval → an honest no-answer with zero citations).
 *
 * Boundaries: all DB access rides Os*Model (§7.4); retrieval rides
 * OsRetrievalService (P4); token generation rides the OsLlmProvider seam. The
 * controller owns the SSE transport — this service exposes the pieces
 * (persist → build context → stream → persist) so the controller can interleave
 * SSE status/delta/done events between them.
 *
 * §11.7 posture: os.* tables are internal-admin single-tenant; isolation is the
 * super-admin gate (§11.1) PLUS per-user ownership enforced here — every
 * conversation read/write checks user_id, so one admin never touches another's
 * threads.
 */

import {
  IOsChatConversation,
  IOsChatConversationListRow,
  OsChatConversationModel,
} from "../../../models/OsChatConversationModel";
import {
  IOsChatCitation,
  IOsChatMessage,
  OsChatMessageModel,
} from "../../../models/OsChatMessageModel";
import {
  IOsChatContextDocument,
  OsChatContextDocumentModel,
} from "../../../models/OsChatContextDocumentModel";
import { OsDocumentModel } from "../../../models/OsDocumentModel";
import { OsDocumentVersionModel } from "../../../models/OsDocumentVersionModel";
import { OsRetrievalService } from "./OsRetrievalService";
import {
  getOsLlmProvider,
  OsChatTurn,
} from "./service.os-llm";
import { OsError } from "../feature-utils/OsError";
import logger from "../../../lib/logger";

/** Assembly caps (§4.2): total context budget, history window, title length. */
const OS_CHAT_MAX_CONTEXT_CHARS = 24000;
const OS_CHAT_HISTORY_TURNS = 6;
const OS_CHAT_TITLE_MAX = 60;

export interface OsChatConversationDetail {
  messages: IOsChatMessage[];
  context: IOsChatContextDocument[];
}

/** Result of assembling grounding context for one question. */
export interface OsChatContextBuild {
  contextText: string;
  citations: IOsChatCitation[];
  hasContent: boolean;
}

function conversationNotFound(conversationId: string): never {
  throw new OsError("OS_CONVERSATION_NOT_FOUND", "Conversation not found.", {
    conversationId,
  });
}

export class OsChatService {
  /**
   * Ownership guard for the mutating/detail paths: load the conversation and
   * confirm it belongs to the caller. Throws OS_CONVERSATION_NOT_FOUND (404)
   * for both "missing" and "not yours" — never reveal another user's thread.
   */
  private static async requireOwned(
    conversationId: string,
    userId: number
  ): Promise<IOsChatConversation> {
    const conversation =
      await OsChatConversationModel.findConversationById(conversationId);
    if (!conversation || conversation.user_id !== userId) {
      conversationNotFound(conversationId);
    }
    return conversation;
  }

  /** O(1) ownership check for the SSE send path — null when missing/not owned. */
  static async findOwnedConversation(
    conversationId: string,
    userId: number
  ): Promise<IOsChatConversation | null> {
    const conversation =
      await OsChatConversationModel.findConversationById(conversationId);
    return conversation && conversation.user_id === userId ? conversation : null;
  }

  static async createConversation(
    userId: number,
    title?: string | null
  ): Promise<IOsChatConversationListRow> {
    const row = await OsChatConversationModel.createConversation(
      userId,
      title?.trim() ? title.trim() : null
    );
    // A fresh conversation has no messages — return the enriched shape the list
    // uses so create and list share one contract.
    return {
      ...row,
      last_activity_at: row.created_at,
      message_count: 0,
      last_message_preview: null,
    };
  }

  static listConversations(
    userId: number
  ): Promise<IOsChatConversationListRow[]> {
    return OsChatConversationModel.listForUser(userId);
  }

  static async getConversation(
    conversationId: string,
    userId: number
  ): Promise<OsChatConversationDetail> {
    await this.requireOwned(conversationId, userId);
    const [messages, context] = await Promise.all([
      OsChatMessageModel.listForConversation(conversationId),
      OsChatContextDocumentModel.findByConversation(conversationId),
    ]);
    return { messages, context };
  }

  static async deleteConversation(
    conversationId: string,
    userId: number
  ): Promise<void> {
    await this.requireOwned(conversationId, userId);
    await OsChatConversationModel.deleteConversation(conversationId);
  }

  /** @-attach a live document as grounding context (idempotent). */
  static async attachContext(
    conversationId: string,
    documentId: string,
    userId: number
  ): Promise<void> {
    await this.requireOwned(conversationId, userId);
    const document = await OsDocumentModel.findDocumentById(documentId);
    if (!document || document.archived_at) {
      throw new OsError(
        "OS_DOCUMENT_NOT_FOUND",
        "Document not found or archived.",
        { documentId }
      );
    }
    await OsChatContextDocumentModel.attach(conversationId, documentId, "manual");
  }

  static async detachContext(
    conversationId: string,
    documentId: string,
    userId: number
  ): Promise<void> {
    await this.requireOwned(conversationId, userId);
    await OsChatContextDocumentModel.detach(conversationId, documentId);
  }

  // ── Send pipeline pieces (the controller interleaves SSE events) ───────────

  static persistUserMessage(
    conversationId: string,
    content: string
  ): Promise<IOsChatMessage> {
    return OsChatMessageModel.createMessage(conversationId, "user", content, []);
  }

  static persistAssistantMessage(
    conversationId: string,
    content: string,
    citations: IOsChatCitation[]
  ): Promise<IOsChatMessage> {
    return OsChatMessageModel.createMessage(
      conversationId,
      "assistant",
      content,
      citations
    );
  }

  /** The last few turns, oldest-first, as provider-neutral history. */
  static async history(conversationId: string): Promise<OsChatTurn[]> {
    const messages =
      await OsChatMessageModel.listForConversation(conversationId);
    return messages
      .slice(-OS_CHAT_HISTORY_TURNS)
      .map((message) => ({ role: message.role, content: message.content }));
  }

  /**
   * Assemble grounding context in priority order: manual @-attached documents
   * in full (resolved to their live version at query time), then retrieved
   * chunks (P4), each within the total character budget. Citations are built
   * from this result set ONLY — never parsed from model output — so a citation
   * can never reference a document the answer wasn't grounded in.
   */
  static async buildContext(
    conversationId: string,
    question: string
  ): Promise<OsChatContextBuild> {
    const attached =
      await OsChatContextDocumentModel.findByConversation(conversationId);
    let contextText = "";
    const citations: IOsChatCitation[] = [];

    for (const entry of attached.filter((a) => a.origin === "manual")) {
      const document = await OsDocumentModel.findDocumentById(entry.document_id);
      if (!document || document.archived_at || !document.current_version_id) {
        continue;
      }
      const version = await OsDocumentVersionModel.findVersionById(
        document.current_version_id
      );
      if (!version) continue;
      const block = `# ${document.title}\n${version.content_md}\n\n---\n\n`;
      if (contextText.length + block.length <= OS_CHAT_MAX_CONTEXT_CHARS) {
        contextText += block;
        citations.push({
          document_id: document.id,
          version_no: version.version_no,
          chunk_index: null,
          heading_path: document.title,
        });
      }
    }

    const hits = await OsRetrievalService.retrieve(question);
    for (const hit of hits) {
      const label = hit.heading_path
        ? `${hit.title} > ${hit.heading_path}`
        : hit.title;
      const block = `[${label}]\n${hit.content}\n\n`;
      if (contextText.length + block.length > OS_CHAT_MAX_CONTEXT_CHARS) break;
      contextText += block;
      citations.push({
        document_id: hit.document_id,
        version_no: hit.version_no,
        chunk_index: hit.chunk_index,
        heading_path: hit.heading_path,
      });
    }

    return { contextText, citations, hasContent: citations.length > 0 };
  }

  /** Grounded token stream for the current turn (history excludes it). */
  static streamAnswer(
    contextText: string,
    history: OsChatTurn[],
    question: string
  ): AsyncIterable<string> {
    return getOsLlmProvider().streamChat(contextText, history, question);
  }

  /**
   * Auto-title from the first user message — only when the conversation has no
   * title yet. Fire-and-forget from the controller: it must never block or fail
   * the stream, so failures are logged and swallowed here (§3.2 — logged, not
   * silently dropped). A one-shot title kept the analog cheap; we reuse the
   * first message truncated rather than a second LLM round-trip.
   */
  static async maybeAutoTitle(
    conversationId: string,
    firstMessage: string
  ): Promise<void> {
    try {
      const conversation =
        await OsChatConversationModel.findConversationById(conversationId);
      if (!conversation || conversation.title) return;
      const title = firstMessage.trim().slice(0, OS_CHAT_TITLE_MAX);
      if (title) await OsChatConversationModel.updateTitle(conversationId, title);
    } catch (error) {
      logger.warn(
        { err: error, conversationId },
        "[ADMIN-OS] auto-title failed (non-blocking)"
      );
    }
  }
}
