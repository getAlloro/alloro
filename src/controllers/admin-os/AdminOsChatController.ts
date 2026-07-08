import { Response } from "express";
import { z } from "zod";
import { AuthRequest } from "../../middleware/auth";
import { OsChatService } from "./feature-services/OsChatService";
import { isOsModelBusyError } from "./feature-services/service.os-llm";
import { ok, handleOsError } from "./feature-utils/osResponses";
import { osActorId } from "./feature-utils/osRequestParams";
import { osChatMessageSchema } from "../../validation/os.schemas";
import logger from "../../lib/logger";

/**
 * Admin OS — grounded RAG chat (plans/07042026-alloro-os-admin-port, P5 T2;
 * ports alloro-os ChatController). Conversation + context CRUD answer with the
 * §8.1 envelope via osResponses; the send endpoint is the ONE sanctioned
 * non-envelope path — Server-Sent Events, minds-exact headers (§14.2/§17.5
 * mirror of MindsChatController). The whole domain is super-admin gated in
 * routes/admin/os.ts (§11.1), so the SSE endpoint inherits auth.
 *
 * SSE event vocabulary (ported): a stream is zero-or-more
 * `data: {"status": string}` progress lines, then many `data: {"delta": token}`
 * lines, then exactly one `data: {"done": true, "message_id", "citations"}`. A
 * failure AFTER headers are sent arrives as `data: {"error": code, "message"}`
 * and never as an envelope (§8.3 — envelope before headers, in-stream event
 * after). Citations are built server-side from the retrieval set only.
 */

// Pre-token status copy shown in the thinking cue while the slow steps
// (retrieval, then model prefill) produce no visible output (§4.2).
const OS_CHAT_STATUS_SEARCHING = "Searching the knowledge base…";
const OS_CHAT_STATUS_COMPOSING = "Composing a grounded answer…";

const OS_CHAT_BUSY_MESSAGE =
  "The assistant is busy right now. Please try again in a moment.";
const OS_CHAT_FAILED_MESSAGE =
  "Something went wrong generating a reply. Please try again.";

export class AdminOsChatController {
  /** POST /api/admin/os/chat/conversations — create an empty thread. */
  static async create(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const conversation = await OsChatService.createConversation(
        osActorId(req),
        typeof req.body?.title === "string" ? req.body.title : null
      );
      return ok(res, { conversation }, 201);
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** GET /api/admin/os/chat/conversations — the caller's threads, newest first. */
  static async list(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const conversations = await OsChatService.listConversations(
        osActorId(req)
      );
      return ok(res, { conversations });
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** GET /api/admin/os/chat/conversations/:id — thread + attached context. */
  static async get(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const detail = await OsChatService.getConversation(
        req.params.id,
        osActorId(req)
      );
      return ok(res, detail);
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** DELETE /api/admin/os/chat/conversations/:id — cascade-removes messages. */
  static async remove(req: AuthRequest, res: Response): Promise<Response> {
    try {
      await OsChatService.deleteConversation(req.params.id, osActorId(req));
      return ok(res, { deleted: true });
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** POST /api/admin/os/chat/conversations/:id/context/:documentId — @-attach. */
  static async attachContext(
    req: AuthRequest,
    res: Response
  ): Promise<Response> {
    try {
      await OsChatService.attachContext(
        req.params.id,
        req.params.documentId,
        osActorId(req)
      );
      return ok(res, { attached: true }, 201);
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** DELETE /api/admin/os/chat/conversations/:id/context/:documentId — detach. */
  static async detachContext(
    req: AuthRequest,
    res: Response
  ): Promise<Response> {
    try {
      await OsChatService.detachContext(
        req.params.id,
        req.params.documentId,
        osActorId(req)
      );
      return ok(res, { detached: true });
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /**
   * POST /api/admin/os/chat/conversations/:id/messages — send a message and
   * stream a grounded answer over SSE. Ownership + validation run BEFORE the
   * stream opens so those errors stay JSON envelopes; once headers are flushed,
   * every outcome (including failures) is an in-stream event. The assistant
   * message is persisted ONLY on a completed stream — a disconnect leaves the
   * already-persisted user message so a retry is natural (no half-written reply).
   */
  static async sendMessage(req: AuthRequest, res: Response): Promise<void> {
    const conversationId = req.params.id;
    // One SSE frame writer so every event uses the same wire shape.
    const sendEvent = (payload: Record<string, unknown>): void => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    try {
      const actorId = osActorId(req);
      const parsed = osChatMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({
            success: false,
            data: null,
            error: {
              code: "OS_CHAT_MESSAGE_REQUIRED",
              message: "A message is required.",
              details: null,
            },
          });
        return;
      }
      const owned = await OsChatService.findOwnedConversation(
        conversationId,
        actorId
      );
      if (!owned) {
        res
          .status(404)
          .json({
            success: false,
            data: null,
            error: {
              code: "OS_CONVERSATION_NOT_FOUND",
              message: "Conversation not found.",
              details: null,
            },
          });
        return;
      }
      const message = parsed.data.message.trim();

      // Minds-exact SSE headers (MindsChatController:32-36) — copy exactly.
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      await OsChatService.persistUserMessage(conversationId, message);
      // Auto-title is fire-and-forget — it must never block or fail the stream.
      void OsChatService.maybeAutoTitle(conversationId, message);
      const history = await OsChatService.history(conversationId);

      // Retrieval (embed + vector search) is the first slow, silent step.
      sendEvent({ status: OS_CHAT_STATUS_SEARCHING });
      const { contextText, citations, hasContent } =
        await OsChatService.buildContext(conversationId, message);

      // The current turn is already in history (persisted above) — drop it so
      // it isn't duplicated as both history and the question.
      sendEvent({ status: OS_CHAT_STATUS_COMPOSING });
      let full = "";
      for await (const delta of OsChatService.streamAnswer(
        contextText,
        history.slice(0, -1),
        message
      )) {
        full += delta;
        sendEvent({ delta });
      }

      // Grounded-refusal safety: no evidence ⇒ no citations, ever.
      const sources = hasContent ? citations : [];
      const saved = await OsChatService.persistAssistantMessage(
        conversationId,
        full,
        sources
      );
      sendEvent({ done: true, message_id: saved.id, citations: sources });
      res.end();
    } catch (error) {
      logger.error(
        { err: error, conversationId },
        "[ADMIN-OS] chat send failed"
      );
      if (res.headersSent) {
        // Stream already open — surface a readable message, never internals
        // (§3.4), as an in-stream error event (§8.3).
        const busy = isOsModelBusyError(error);
        sendEvent({
          error: busy ? "model_busy" : "chat_failed",
          message: busy ? OS_CHAT_BUSY_MESSAGE : OS_CHAT_FAILED_MESSAGE,
        });
        res.end();
      } else {
        handleOsError(res, error);
      }
    }
  }
}
