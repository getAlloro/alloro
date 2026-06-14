import { Request, Response } from "express";
import * as chatService from "./feature-services/service.minds-chat";
import logger from "../../lib/logger";

export async function chat(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    const { message, conversationId } = req.body;

    if (!message) return res.status(400).json({ error: "message is required" });

    const result = await chatService.chat(mindId, message, conversationId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error in chat:");
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: "Chat failed" });
  }
}

export async function chatStream(req: Request, res: Response): Promise<any> {
  const { mindId } = req.params;
  const { message, conversationId } = req.body;

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Nginx hint
  res.flushHeaders();

  try {
    await chatService.chatStream(
      mindId,
      message,
      (chunk: string) => {
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      },
      (convId: string) => {
        res.write(`data: ${JSON.stringify({ conversationId: convId })}\n\n`);
      },
      conversationId
    );

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error in streaming chat:");
    res.write(`data: ${JSON.stringify({ error: error.message || "Chat failed" })}\n\n`);
    res.end();
  }
}

export async function getConversation(req: Request, res: Response): Promise<any> {
  try {
    const { mindId, conversationId } = req.params;
    const messages = await chatService.getConversationMessages(mindId, conversationId);
    return res.json({ success: true, data: messages });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error getting conversation:");
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to get conversation" });
  }
}

export async function listConversations(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    const conversations = await chatService.listConversations(mindId);
    return res.json({ success: true, data: conversations });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error listing conversations:");
    return res.status(500).json({ error: "Failed to list conversations" });
  }
}

export async function renameConversation(req: Request, res: Response): Promise<any> {
  try {
    const { mindId, conversationId } = req.params;
    const { title } = req.body;

    if (!title || typeof title !== "string") {
      return res.status(400).json({ error: "title is required" });
    }

    await chatService.renameConversation(mindId, conversationId, title.trim());
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error renaming conversation:");
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to rename conversation" });
  }
}

export async function deleteConversation(req: Request, res: Response): Promise<any> {
  try {
    const { mindId, conversationId } = req.params;
    await chatService.deleteConversation(mindId, conversationId);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error deleting conversation:");
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to delete conversation" });
  }
}
