import { Request, Response } from "express";
import {
  SkillWorkRunModel,
  WorkRunStatus,
} from "../../models/SkillWorkRunModel";
import { MindSkillModel } from "../../models/MindSkillModel";
import { evaluateAutoPipeline } from "./feature-services/service.minds-work-pipeline";
import logger from "../../lib/logger";

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

/**
 * Middleware: validate x-internal-key header
 */
export function validateInternalKey(
  req: Request,
  res: Response,
  next: () => void
): any {
  const key = req.headers["x-internal-key"] as string;
  if (!INTERNAL_API_KEY) {
    return res.status(500).json({ error: "INTERNAL_API_KEY not configured" });
  }
  if (!key || key !== INTERNAL_API_KEY) {
    return res.status(401).json({ error: "Invalid internal key" });
  }
  next();
}

/**
 * PATCH /api/internal/skill-work-runs/:workRunId
 * n8n calls this to update work run status + artifact data.
 */
export async function updateWorkRunStatus(
  req: Request,
  res: Response
): Promise<any> {
  const { workRunId } = req.params;
  const {
    status,
    title,
    description,
    artifact_url,
    artifact_content,
    artifact_type,
    artifact_attachment_type,
    artifact_attachment_url,
    n8n_run_id,
    error,
  } = req.body;

  if (!status) {
    return res.status(400).json({ error: "status is required" });
  }

  const workRun = await SkillWorkRunModel.findById(workRunId);
  if (!workRun) {
    return res.status(404).json({ error: "Work run not found" });
  }

  // Validate status transition
  if (!SkillWorkRunModel.isValidTransition(workRun.status, status as WorkRunStatus)) {
    return res.status(400).json({
      error: `Invalid status transition: ${workRun.status} → ${status}`,
    });
  }

  // Load skill config to default artifact_type when n8n doesn't provide it
  const skill = await MindSkillModel.findById(workRun.skill_id);

  const updateData: Record<string, unknown> = {};
  if (title !== undefined) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (artifact_url !== undefined) updateData.artifact_url = artifact_url;
  if (artifact_content !== undefined) updateData.artifact_content = artifact_content;
  if (artifact_type !== undefined) {
    updateData.artifact_type = artifact_type;
  } else if ((artifact_url || artifact_content) && !workRun.artifact_type && skill?.work_creation_type) {
    updateData.artifact_type = skill.work_creation_type;
  }
  if (artifact_attachment_type !== undefined) {
    updateData.artifact_attachment_type = artifact_attachment_type;
  } else if (artifact_attachment_url && !workRun.artifact_attachment_type && skill?.artifact_attachment_type) {
    updateData.artifact_attachment_type = skill.artifact_attachment_type;
  }
  if (artifact_attachment_url !== undefined) updateData.artifact_attachment_url = artifact_attachment_url;
  if (n8n_run_id !== undefined) updateData.n8n_run_id = n8n_run_id;
  if (error !== undefined) updateData.error = error;

  // Reconcile missing types from skill config using merged state (DB + incoming)
  // Handles multi-call scenarios where data arrives across separate PATCH requests
  if (skill) {
    const mergedArtifactType = updateData.artifact_type ?? workRun.artifact_type;
    const mergedContent = updateData.artifact_content ?? workRun.artifact_content;
    const mergedUrl = updateData.artifact_url ?? workRun.artifact_url;
    if (!mergedArtifactType && (mergedContent || mergedUrl) && skill.work_creation_type) {
      updateData.artifact_type = skill.work_creation_type;
    }

    const mergedAttachmentType = updateData.artifact_attachment_type ?? workRun.artifact_attachment_type;
    const mergedAttachmentUrl = updateData.artifact_attachment_url ?? workRun.artifact_attachment_url;
    if (!mergedAttachmentType && mergedAttachmentUrl && skill.artifact_attachment_type) {
      updateData.artifact_attachment_type = skill.artifact_attachment_type;
    }
  }

  await SkillWorkRunModel.updateStatus(
    workRunId,
    status as WorkRunStatus,
    updateData
  );

  logger.info(
    `[INTERNAL] Work run ${workRunId} status updated: ${workRun.status} → ${status}`
  );

  // If status is now awaiting_review, evaluate auto-pipeline (async, non-blocking)
  if (status === "awaiting_review") {
    evaluateAutoPipeline(workRunId).catch((err) => {
      logger.error({ err: err }, `[INTERNAL] Auto-pipeline evaluation failed for ${workRunId}:`);
    });
  }

  return res.json({ success: true, status });
}
