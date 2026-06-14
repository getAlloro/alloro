import { Request, Response } from "express";
import * as mindsCrud from "./feature-services/service.minds-crud";
import logger from "../../lib/logger";

export async function listMinds(_req: Request, res: Response): Promise<any> {
  try {
    const minds = await mindsCrud.listMinds();
    return res.json({ success: true, data: minds });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error listing minds:");
    return res.status(500).json({ error: "Failed to list minds" });
  }
}

export async function getMind(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    const mind = await mindsCrud.getMind(mindId);
    return res.json({ success: true, data: mind });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error getting mind:");
    if (error.message === "Mind not found") {
      return res.status(404).json({ error: "Mind not found" });
    }
    return res.status(500).json({ error: "Failed to get mind" });
  }
}

export async function createMind(req: Request, res: Response): Promise<any> {
  try {
    const { name, personality_prompt } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });

    const mind = await mindsCrud.createMind(name, personality_prompt || "");
    return res.status(201).json({ success: true, data: mind });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error creating mind:");
    if (error.message?.includes("already exists")) {
      return res.status(409).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to create mind" });
  }
}

export async function deleteMind(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    await mindsCrud.deleteMind(mindId);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error deleting mind:");
    if (error.message === "Mind not found") {
      return res.status(404).json({ error: "Mind not found" });
    }
    if (error.message?.includes("sync run is in progress")) {
      return res.status(409).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to delete mind" });
  }
}

export async function updateMind(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    const {
      name,
      personality_prompt,
      available_work_types,
      available_publish_targets,
      rejection_categories,
    } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (personality_prompt !== undefined) updates.personality_prompt = personality_prompt;
    if (available_work_types !== undefined) updates.available_work_types = JSON.stringify(available_work_types);
    if (available_publish_targets !== undefined) updates.available_publish_targets = JSON.stringify(available_publish_targets);
    if (rejection_categories !== undefined) updates.rejection_categories = JSON.stringify(rejection_categories);
    const mind = await mindsCrud.updateMind(mindId, updates);
    return res.json({ success: true, data: mind });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error updating mind:");
    if (error.message === "Mind not found") {
      return res.status(404).json({ error: "Mind not found" });
    }
    if (error.message?.includes("already exists")) {
      return res.status(409).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to update mind" });
  }
}

export async function updateBrain(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    const { brain_markdown } = req.body;
    if (!brain_markdown) return res.status(400).json({ error: "brain_markdown is required" });

    const result = await mindsCrud.updateBrain(mindId, brain_markdown);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error updating brain:");
    if (error.message === "Mind not found") {
      return res.status(404).json({ error: "Mind not found" });
    }
    if (error.message?.includes("exceeds maximum")) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to update brain" });
  }
}

export async function listVersions(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    const versions = await mindsCrud.listVersions(mindId);
    return res.json({ success: true, data: versions });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error listing versions:");
    return res.status(500).json({ error: "Failed to list versions" });
  }
}

export async function publishVersion(req: Request, res: Response): Promise<any> {
  try {
    const { mindId, versionId } = req.params;
    await mindsCrud.publishVersion(mindId, versionId);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error publishing version:");
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to publish version" });
  }
}
