import { Request, Response } from "express";
import { MindSourceModel } from "../../models/MindSourceModel";
import logger from "../../lib/logger";

export async function listSources(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    const sources = await MindSourceModel.listByMind(mindId);
    return res.json({ success: true, data: sources });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error listing sources:");
    return res.status(500).json({ error: "Failed to list sources" });
  }
}

export async function createSource(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    const { name, url } = req.body;

    if (!url) return res.status(400).json({ error: "url is required" });

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    const source = await MindSourceModel.create({
      mind_id: mindId,
      name: name || null,
      url,
      is_active: true,
    });
    return res.status(201).json({ success: true, data: source });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error creating source:");
    if (error.code === "23505") {
      return res.status(409).json({ error: "This URL is already configured for this mind" });
    }
    return res.status(500).json({ error: "Failed to create source" });
  }
}

export async function deleteSource(req: Request, res: Response): Promise<any> {
  try {
    const { sourceId } = req.params;
    const deleted = await MindSourceModel.deleteById(sourceId);
    if (!deleted) return res.status(404).json({ error: "Source not found" });
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error deleting source:");
    return res.status(500).json({ error: "Failed to delete source" });
  }
}

export async function toggleSource(req: Request, res: Response): Promise<any> {
  try {
    const { sourceId } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== "boolean") {
      return res.status(400).json({ error: "is_active must be a boolean" });
    }

    const updated = await MindSourceModel.toggleActive(sourceId, is_active);
    if (!updated) return res.status(404).json({ error: "Source not found" });
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error toggling source:");
    return res.status(500).json({ error: "Failed to toggle source" });
  }
}
