/**
 * Admin Websites — AI Command Controller
 *
 * AI command batches (list/create/get/rename/delete/execute) and their
 * recommendations (list, bulk update, single update).
 *
 * Behavior-preserving split from the former monolithic AdminWebsitesController.
 * Handlers and helpers are moved verbatim; logic is unchanged. Bound by the
 * matching resource sub-router under src/routes/admin/websites/.
 */

import { Request, Response } from "express";
import * as aiCommand from "./feature-services/service.ai-command";
import logger from "../../lib/logger";

/** POST /:id/ai-command — Create a new AI command batch and start analysis */
export async function createAiCommandBatch(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId } = req.params;
    const { prompt, targets, batch_type } = req.body;

    // Prompt is optional for ui_checker and link_checker
    const bType = batch_type || "ai_editor";
    if (bType === "ai_editor" && (!prompt || typeof prompt !== "string" || prompt.trim().length === 0)) {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "prompt is required for AI Editor" });
    }

    const batch = await aiCommand.createBatch(
      projectId,
      (prompt || "").trim(),
      targets || { pages: "all", posts: "all", layouts: "all" },
      (req as any).userId,
      bType
    );

    // Fire-and-forget analysis — don't await
    aiCommand.analyzeBatch(batch.id).catch((err) => {
      logger.error({ err: err }, `[Admin Websites] Background analysis failed for batch ${batch.id}:`);
    });

    return res.status(201).json({ success: true, data: batch });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error creating AI command batch:");
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** GET /:id/ai-command/:batchId — Get batch status and stats */

/** GET /:id/ai-command/:batchId — Get batch status and stats */
export async function getAiCommandBatch(req: Request, res: Response): Promise<Response> {
  try {
    const { batchId } = req.params;
    const batch = await aiCommand.getBatch(batchId);

    if (!batch) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Batch not found" });
    }

    return res.json({ success: true, data: batch });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching AI command batch:");
    return res.status(500).json({ success: false, error: "FETCH_ERROR", message: error?.message });
  }
}

/** GET /:id/ai-command/:batchId/recommendations — List recommendations */

/** GET /:id/ai-command/:batchId/recommendations — List recommendations */
export async function getAiCommandRecommendations(req: Request, res: Response): Promise<Response> {
  try {
    const { batchId } = req.params;
    const { status, target_type } = req.query;

    const recommendations = await aiCommand.getBatchRecommendations(batchId, {
      status: status as string | undefined,
      target_type: target_type as string | undefined,
    });

    return res.json({ success: true, data: recommendations });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching recommendations:");
    return res.status(500).json({ success: false, error: "FETCH_ERROR", message: error?.message });
  }
}

/** PATCH /:id/ai-command/:batchId/recommendations/:recId — Update recommendation status */

/** PATCH /:id/ai-command/:batchId/recommendations/:recId — Update recommendation status */
export async function updateAiCommandRecommendation(req: Request, res: Response): Promise<Response> {
  try {
    const { recId } = req.params;
    const { status } = req.body;

    if (!status || !["approved", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "status must be 'approved' or 'rejected'" });
    }

    const { reference_url, reference_content } = req.body;
    const rec = await aiCommand.updateRecommendationStatus(recId, status, {
      reference_url,
      reference_content,
    });
    if (!rec) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Recommendation not found" });
    }

    return res.json({ success: true, data: rec });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error updating recommendation:");
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** PATCH /:id/ai-command/:batchId/recommendations/bulk — Bulk approve/reject */

/** PATCH /:id/ai-command/:batchId/recommendations/bulk — Bulk approve/reject */
export async function bulkUpdateAiCommandRecommendations(req: Request, res: Response): Promise<Response> {
  try {
    const { batchId } = req.params;
    const { status, target_type } = req.body;

    if (!status || !["approved", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "status must be 'approved' or 'rejected'" });
    }

    const updated = await aiCommand.bulkUpdateStatus(batchId, status, {
      target_type,
    });

    return res.json({ success: true, data: { updated } });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error bulk updating recommendations:");
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** POST /:id/ai-command/:batchId/execute — Execute approved recommendations */

/** POST /:id/ai-command/:batchId/execute — Execute approved recommendations */
export async function executeAiCommandBatch(req: Request, res: Response): Promise<Response> {
  try {
    const { batchId } = req.params;

    const batch = await aiCommand.getBatch(batchId);
    if (!batch) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Batch not found" });
    }

    if (batch.status !== "ready") {
      return res.status(400).json({ success: false, error: "INVALID_STATUS", message: `Batch status is "${batch.status}", expected "ready"` });
    }

    const stats = typeof batch.stats === "string" ? JSON.parse(batch.stats) : batch.stats;
    if (!stats.approved || stats.approved === 0) {
      return res.status(400).json({ success: false, error: "NO_APPROVED", message: "No approved recommendations to execute" });
    }

    // Fire-and-forget execution — don't await
    aiCommand.executeBatch(batchId).catch((err) => {
      logger.error({ err: err }, `[Admin Websites] Background execution failed for batch ${batchId}:`);
    });

    return res.json({ success: true, data: { status: "executing" } });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error executing AI command batch:");
    return res.status(500).json({ success: false, error: "EXECUTE_ERROR", message: error?.message });
  }
}

/** GET /:id/ai-command — List all batches for a project */

/** GET /:id/ai-command — List all batches for a project */
export async function listAiCommandBatches(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId } = req.params;
    const batches = await aiCommand.listBatches(projectId);
    return res.json({ success: true, data: batches });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error listing AI command batches:");
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** PATCH /:id/ai-command/:batchId — Rename a batch */

/** PATCH /:id/ai-command/:batchId — Rename a batch */
export async function renameAiCommandBatch(req: Request, res: Response): Promise<Response> {
  try {
    const { batchId } = req.params;
    const { summary } = req.body;
    if (!summary || typeof summary !== "string") {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "summary is required" });
    }
    const batch = await aiCommand.updateBatchSummary(batchId, summary.trim());
    return res.json({ success: true, data: batch });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error renaming batch:");
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /:id/ai-command/:batchId — Delete a batch */

/** DELETE /:id/ai-command/:batchId — Delete a batch */
export async function deleteAiCommandBatch(req: Request, res: Response): Promise<Response> {
  try {
    const { batchId } = req.params;
    await aiCommand.deleteBatch(batchId);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error deleting AI command batch:");
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

// =====================================================================
// REDIRECTS
// =====================================================================

/** GET /:id/redirects — List redirects for a project */
