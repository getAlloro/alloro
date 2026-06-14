import { Request, Response } from "express";
import { MindDiscoveryBatchModel } from "../../models/MindDiscoveryBatchModel";
import { MindDiscoveredPostModel } from "../../models/MindDiscoveredPostModel";
import * as discoveryService from "./feature-services/service.minds-discovery";
import logger from "../../lib/logger";

export async function getDiscoveryBatch(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    const batch = await MindDiscoveryBatchModel.findOpenByMind(mindId);

    if (!batch) {
      return res.json({ success: true, data: { batch: null, posts: [] } });
    }

    const posts = await MindDiscoveredPostModel.listByBatch(batch.id);
    return res.json({ success: true, data: { batch, posts } });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error getting discovery batch:");
    return res.status(500).json({ error: "Failed to get discovery batch" });
  }
}

export async function updatePostStatus(req: Request, res: Response): Promise<any> {
  try {
    const { postId } = req.params;
    const { status } = req.body;

    const allowed = ["pending", "approved", "ignored"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${allowed.join(", ")}` });
    }

    const updated = await MindDiscoveredPostModel.updateStatus(
      postId,
      status as "pending" | "approved" | "ignored"
    );
    if (!updated) return res.status(404).json({ error: "Post not found" });

    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error updating post status:");
    return res.status(500).json({ error: "Failed to update post status" });
  }
}

export async function deleteBatch(req: Request, res: Response): Promise<any> {
  try {
    const { mindId, batchId } = req.params;
    const batch = await MindDiscoveryBatchModel.findById(batchId);
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    if (batch.mind_id !== mindId) return res.status(404).json({ error: "Batch not found" });

    await MindDiscoveryBatchModel.deleteById(batchId);
    logger.info(`[MINDS] Deleted batch ${batchId} for mind ${mindId} (cascade deletes posts)`);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error deleting batch:");
    return res.status(500).json({ error: "Failed to delete batch" });
  }
}

export async function triggerDiscovery(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    const result = await discoveryService.runDiscoveryForMind(mindId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error running discovery:");
    if (error.message?.includes("not found") || error.message?.includes("No active sources")) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Discovery failed" });
  }
}
