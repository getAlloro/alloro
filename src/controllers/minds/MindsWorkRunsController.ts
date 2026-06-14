import { Request, Response } from "express";
import { MindSkillModel } from "../../models/MindSkillModel";
import {
  SkillWorkRunModel,
  ISkillWorkRun,
} from "../../models/SkillWorkRunModel";
import { fireWorkCreationWebhook } from "./feature-services/service.minds-work-pipeline";
import { generateEmbedding } from "./feature-services/service.minds-embedding";
import { PublishChannelModel } from "../../models/PublishChannelModel";
import logger from "../../lib/logger";

/**
 * POST /:mindId/skills/:skillId/run — manually trigger a skill work run
 */
export async function triggerManualRun(
  req: Request,
  res: Response
): Promise<any> {
  const { mindId, skillId } = req.params;

  const skill = await MindSkillModel.findById(skillId);
  if (!skill || skill.mind_id !== mindId) {
    return res.status(404).json({ error: "Skill not found" });
  }

  if (!skill.work_creation_type) {
    return res
      .status(400)
      .json({ error: "Skill has no work_creation_type configured" });
  }

  try {
    const workRun = await SkillWorkRunModel.create({
      skill_id: skillId,
      triggered_by: "manual",
      status: "pending",
      artifact_type: skill.work_creation_type,
      artifact_attachment_type: skill.artifact_attachment_type || null,
    });

    // Fire webhook to n8n asynchronously
    fireWorkCreationWebhook(workRun.id, skill).catch((err) => {
      logger.error({ err: err }, "[WORK-RUNS] Failed to fire webhook:");
      SkillWorkRunModel.updateStatus(workRun.id, "failed", {
        error: `Webhook failed: ${err.message}`,
      });
    });

    return res.status(201).json(workRun);
  } catch (error: any) {
    logger.error({ err: error }, "[WORK-RUNS] Error triggering manual run:");
    return res.status(500).json({ error: "Failed to trigger run" });
  }
}

/**
 * GET /:mindId/skills/:skillId/work-runs — list work runs for a skill
 */
export async function listWorkRuns(
  req: Request,
  res: Response
): Promise<any> {
  const { mindId, skillId } = req.params;
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;

  const skill = await MindSkillModel.findById(skillId);
  if (!skill || skill.mind_id !== mindId) {
    return res.status(404).json({ error: "Skill not found" });
  }

  const runs = await SkillWorkRunModel.listBySkill(skillId, limit, offset);
  return res.json(runs);
}

/**
 * GET /:mindId/skills/:skillId/work-runs/:workRunId — get a single work run
 */
export async function getWorkRun(
  req: Request,
  res: Response
): Promise<any> {
  const { workRunId } = req.params;

  const run = await SkillWorkRunModel.findById(workRunId);
  if (!run) return res.status(404).json({ error: "Work run not found" });

  return res.json(run);
}

/**
 * POST /:mindId/skills/:skillId/work-runs/:workRunId/approve
 */
export async function approveWorkRun(
  req: Request,
  res: Response
): Promise<any> {
  const { workRunId } = req.params;
  const adminId = (req as any).user?.id;

  const run = await SkillWorkRunModel.findById(workRunId);
  if (!run) return res.status(404).json({ error: "Work run not found" });

  if (run.status !== "awaiting_review") {
    return res
      .status(400)
      .json({ error: `Cannot approve a work run with status "${run.status}"` });
  }

  await SkillWorkRunModel.updateStatus(workRunId, "approved", {
    approved_by_admin_id: adminId,
    approved_at: new Date(),
  });

  // Check if publication should be triggered via publish channel
  const skill = await MindSkillModel.findById(run.skill_id);
  if (
    skill &&
    (skill.pipeline_mode === "review_then_publish" ||
      skill.pipeline_mode === "auto_pipeline") &&
    skill.publish_channel_id
  ) {
    const channel = await PublishChannelModel.findById(skill.publish_channel_id);
    if (channel && channel.status === "active") {
      const { fireWorkPublicationWebhook } = await import(
        "./feature-services/service.minds-work-pipeline"
      );
      fireWorkPublicationWebhook(workRunId, skill, run, channel.webhook_url).catch((err) => {
        logger.error({ err: err }, "[WORK-RUNS] Failed to fire publication webhook:");
      });
    }
  }

  // Generate embedding for dedup (async, non-blocking)
  const embedText = [run.title, run.description].filter(Boolean).join(" — ");
  if (embedText.trim()) {
    generateEmbedding(embedText)
      .then((emb) => SkillWorkRunModel.setEmbedding(workRunId, emb))
      .catch((err) => logger.error({ err: err }, "[WORK-RUNS] Embedding generation failed:"));
  }

  return res.json({ success: true, status: "approved" });
}

/**
 * POST /:mindId/skills/:skillId/work-runs/:workRunId/reject
 */
export async function rejectWorkRun(
  req: Request,
  res: Response
): Promise<any> {
  const { workRunId } = req.params;
  const { rejection_category, rejection_reason } = req.body;
  const adminId = (req as any).user?.id;

  const run = await SkillWorkRunModel.findById(workRunId);
  if (!run) return res.status(404).json({ error: "Work run not found" });

  if (run.status !== "awaiting_review") {
    return res
      .status(400)
      .json({ error: `Cannot reject a work run with status "${run.status}"` });
  }

  await SkillWorkRunModel.updateStatus(workRunId, "rejected", {
    rejection_category: rejection_category || null,
    rejection_reason: rejection_reason || null,
    rejected_by_admin_id: adminId,
    rejected_at: new Date(),
  });

  return res.json({ success: true, status: "rejected" });
}

/**
 * DELETE /:mindId/skills/:skillId/work-runs/:workRunId — delete a work run
 */
export async function deleteWorkRun(
  req: Request,
  res: Response
): Promise<any> {
  const { mindId, skillId, workRunId } = req.params;

  const skill = await MindSkillModel.findById(skillId);
  if (!skill || skill.mind_id !== mindId) {
    return res.status(404).json({ error: "Skill not found" });
  }

  const run = await SkillWorkRunModel.findById(workRunId);
  if (!run || run.skill_id !== skillId) {
    return res.status(404).json({ error: "Work run not found" });
  }

  await SkillWorkRunModel.deleteById(workRunId);
  return res.json({ success: true });
}
