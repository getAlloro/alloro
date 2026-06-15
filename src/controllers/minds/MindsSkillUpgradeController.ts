import { Request, Response } from "express";
import * as upgradeService from "./feature-services/service.skill-upgrade";
import * as upgradeChat from "./feature-services/service.skill-upgrade-chat";
import { MindSyncProposalModel } from "../../models/MindSyncProposalModel";
import { SkillUpgradeSessionModel } from "../../models/SkillUpgradeSessionModel";
import logger from "../../lib/logger";

export async function createSession(req: Request, res: Response): Promise<any> {
  try {
    const { mindId, skillId } = req.params;
    const adminId = (req as any).user?.id;

    const { session, greeting } = await upgradeService.startSession(mindId, skillId, adminId);

    return res.status(201).json({
      success: true,
      data: { session, greeting },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error creating skill upgrade session:");
    return res.status(500).json({ error: "Failed to create skill upgrade session" });
  }
}

export async function listSessions(req: Request, res: Response): Promise<any> {
  try {
    const { skillId } = req.params;
    const sessions = await upgradeService.listSessions(skillId);
    return res.json({ success: true, data: sessions });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error listing skill upgrade sessions:");
    return res.status(500).json({ error: "Failed to list skill upgrade sessions" });
  }
}

export async function getSession(req: Request, res: Response): Promise<any> {
  try {
    const { sessionId } = req.params;
    const details = await upgradeService.getSessionDetails(sessionId);
    return res.json({ success: true, data: details });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error getting skill upgrade session:");
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: "Session not found" });
    }
    return res.status(500).json({ error: "Failed to get skill upgrade session" });
  }
}

export async function chatStream(req: Request, res: Response): Promise<any> {
  try {
    const { mindId, skillId, sessionId } = req.params;
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    if (message.length > 50000) {
      return res.status(400).json({ error: "Message exceeds 50,000 character limit" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    await upgradeChat.chatStream(
      mindId,
      skillId,
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
    logger.error({ err: error }, "[MINDS] Error in skill upgrade chat stream:");
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message || "Chat failed" });
    }
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
}

export async function triggerReadingStream(req: Request, res: Response): Promise<any> {
  try {
    const { mindId, skillId, sessionId } = req.params;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    await upgradeService.triggerReadingStream(
      mindId,
      skillId,
      sessionId,
      (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    );

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error in skill upgrade reading stream:");
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message || "Reading failed" });
    }
    res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  }
}

export async function getProposals(req: Request, res: Response): Promise<any> {
  try {
    const { sessionId } = req.params;
    const session = await SkillUpgradeSessionModel.findById(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (!session.sync_run_id) return res.json({ success: true, data: [] });

    const proposals = await MindSyncProposalModel.listByRun(session.sync_run_id);
    return res.json({ success: true, data: proposals });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error getting skill upgrade proposals:");
    return res.status(500).json({ error: "Failed to get proposals" });
  }
}

export async function updateProposal(req: Request, res: Response): Promise<any> {
  try {
    const { proposalId } = req.params;
    const { status } = req.body;

    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    await MindSyncProposalModel.updateStatus(proposalId, status);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error updating skill upgrade proposal:");
    return res.status(500).json({ error: "Failed to update proposal" });
  }
}

export async function startCompile(req: Request, res: Response): Promise<any> {
  try {
    const { mindId, skillId, sessionId } = req.params;
    const result = await upgradeService.startCompile(mindId, skillId, sessionId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error starting skill upgrade compile:");
    return res.status(500).json({ error: error.message || "Failed to start compile" });
  }
}

export async function getCompileStatus(req: Request, res: Response): Promise<any> {
  try {
    const { sessionId } = req.params;
    const session = await SkillUpgradeSessionModel.findById(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    return res.json({ success: true, data: { status: session.status, result: session.result } });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error getting skill upgrade compile status:");
    return res.status(500).json({ error: "Failed to get compile status" });
  }
}

export async function deleteSession(req: Request, res: Response): Promise<any> {
  try {
    const { sessionId } = req.params;
    const session = await SkillUpgradeSessionModel.findById(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    await SkillUpgradeSessionModel.deleteById(sessionId);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error deleting skill upgrade session:");
    return res.status(500).json({ error: "Failed to delete session" });
  }
}

export async function abandonSession(req: Request, res: Response): Promise<any> {
  try {
    const { sessionId } = req.params;
    await upgradeService.abandonSession(sessionId);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error abandoning skill upgrade session:");
    return res.status(500).json({ error: "Failed to abandon session" });
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

    await SkillUpgradeSessionModel.updateTitle(sessionId, title.trim());
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error updating skill upgrade session:");
    return res.status(500).json({ error: "Failed to update session" });
  }
}
