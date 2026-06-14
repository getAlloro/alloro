import { Request, Response } from "express";
import * as parentingService from "./feature-services/service.minds-parenting";
import * as parentingChat from "./feature-services/service.minds-parenting-chat";
import { MindSyncProposalModel } from "../../models/MindSyncProposalModel";
import { MindParentingSessionModel } from "../../models/MindParentingSessionModel";
import * as syncService from "./feature-services/service.minds-sync";
import logger from "../../lib/logger";

export async function createSession(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    const adminId = (req as any).user?.id;

    const { session, greeting } = await parentingService.startSession(mindId, adminId);

    return res.status(201).json({
      success: true,
      data: { session, greeting },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error creating parenting session:");
    return res.status(500).json({ error: "Failed to create parenting session" });
  }
}

export async function listSessions(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    const sessions = await parentingService.listSessions(mindId);
    return res.json({ success: true, data: sessions });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error listing parenting sessions:");
    return res.status(500).json({ error: "Failed to list parenting sessions" });
  }
}

export async function getSession(req: Request, res: Response): Promise<any> {
  try {
    const { sessionId } = req.params;
    const details = await parentingService.getSessionDetails(sessionId);
    return res.json({ success: true, data: details });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error getting parenting session:");
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: "Session not found" });
    }
    return res.status(500).json({ error: "Failed to get parenting session" });
  }
}

export async function chatStream(req: Request, res: Response): Promise<any> {
  try {
    const { mindId, sessionId } = req.params;
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    if (message.length > 50000) {
      return res.status(400).json({ error: "Message exceeds 50,000 character limit" });
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    await parentingChat.chatStream(
      mindId,
      sessionId,
      message,
      (chunk: string) => {
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
    );

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error in parenting chat stream:");
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message || "Chat failed" });
    }
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
}

export async function triggerReadingStream(req: Request, res: Response): Promise<any> {
  try {
    const { mindId, sessionId } = req.params;

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    await parentingService.triggerReadingStream(
      mindId,
      sessionId,
      (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    );

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error in reading stream:");
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message || "Reading failed" });
    }
    res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  }
}

export async function updateSession(req: Request, res: Response): Promise<any> {
  try {
    const { sessionId } = req.params;
    const { title } = req.body;

    if (typeof title !== "string" || title.trim().length === 0) {
      return res.status(400).json({ error: "Title is required" });
    }

    if (title.length > 100) {
      return res.status(400).json({ error: "Title must be under 100 characters" });
    }

    await MindParentingSessionModel.updateTitle(sessionId, title.trim());
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error updating session:");
    return res.status(500).json({ error: "Failed to update session" });
  }
}

export async function getProposals(req: Request, res: Response): Promise<any> {
  try {
    const { sessionId } = req.params;
    const session = await MindParentingSessionModel.findById(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (!session.sync_run_id) return res.json({ success: true, data: [] });

    const proposals = await MindSyncProposalModel.listByRun(session.sync_run_id);
    return res.json({ success: true, data: proposals });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error getting parenting proposals:");
    return res.status(500).json({ error: "Failed to get proposals" });
  }
}

export async function updateProposal(req: Request, res: Response): Promise<any> {
  try {
    const { mindId, proposalId } = req.params;
    const { status } = req.body;

    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    await MindSyncProposalModel.updateStatus(proposalId, status);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error updating parenting proposal:");
    return res.status(500).json({ error: "Failed to update proposal" });
  }
}

export async function startCompile(req: Request, res: Response): Promise<any> {
  try {
    const { mindId, sessionId } = req.params;
    const result = await parentingService.startCompile(mindId, sessionId);

    if (!result.runId) {
      // All rejected — session already completed
      return res.json({ success: true, data: { runId: null, autoCompleted: true } });
    }

    return res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error starting parenting compile:");
    return res.status(500).json({ error: error.message || "Failed to start compile" });
  }
}

export async function getCompileStatus(req: Request, res: Response): Promise<any> {
  try {
    const { mindId, sessionId } = req.params;
    const session = await MindParentingSessionModel.findById(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (!session.sync_run_id) {
      return res.json({ success: true, data: { status: session.status } });
    }

    const details = await syncService.getRunDetails(session.sync_run_id);

    // Auto-complete session when compile finishes
    if (details.run.status === "completed" && session.status === "compiling") {
      await parentingService.completeSession(sessionId);
    }

    return res.json({ success: true, data: { ...details, sessionStatus: session.status } });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error getting compile status:");
    return res.status(500).json({ error: "Failed to get compile status" });
  }
}

export async function deleteSession(req: Request, res: Response): Promise<any> {
  try {
    const { sessionId } = req.params;
    const session = await MindParentingSessionModel.findById(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    // Messages cascade-delete via FK
    await MindParentingSessionModel.deleteById(sessionId);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error deleting parenting session:");
    return res.status(500).json({ error: "Failed to delete session" });
  }
}

export async function abandonSession(req: Request, res: Response): Promise<any> {
  try {
    const { sessionId } = req.params;
    await parentingService.abandonSession(sessionId);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error abandoning session:");
    return res.status(500).json({ error: "Failed to abandon session" });
  }
}
