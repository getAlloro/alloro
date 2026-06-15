import { Request, Response } from "express";
import { MindSyncRunModel } from "../../models/MindSyncRunModel";
import { MindSyncProposalModel } from "../../models/MindSyncProposalModel";
import { MindDiscoveryBatchModel } from "../../models/MindDiscoveryBatchModel";
import * as gating from "./feature-services/service.minds-gating";
import * as syncService from "./feature-services/service.minds-sync";
import { getMindsQueue } from "../../workers/queues";
import logger from "../../lib/logger";

export async function startScrapeCompare(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;

    const check = await gating.canStartScrapeCompare(mindId);
    if (!check.allowed) {
      return res.status(400).json({
        error: "Cannot start scrape & compare",
        reasons: check.reasons,
      });
    }

    // Resolve open batch for batch-scoping
    const batch = await MindDiscoveryBatchModel.findOpenByMind(mindId);
    const { runId } = await syncService.createSyncRun(
      mindId,
      "scrape_compare",
      undefined,
      batch?.id
    );

    // Enqueue BullMQ job
    const queue = getMindsQueue("scrape-compare");
    await queue.add("scrape-compare", { mindId, runId }, { jobId: runId });

    return res.status(201).json({ success: true, data: { runId } });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error starting scrape-compare:");
    return res.status(500).json({ error: "Failed to start scrape & compare" });
  }
}

export async function startCompile(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;

    const check = await gating.canStartCompilePublish(mindId);
    if (!check.allowed) {
      return res.status(400).json({
        error: "Cannot start compile & publish",
        reasons: check.reasons,
      });
    }

    // Resolve open batch for batch-scoping
    const batch = await MindDiscoveryBatchModel.findOpenByMind(mindId);
    const { runId } = await syncService.createSyncRun(
      mindId,
      "compile_publish",
      undefined,
      batch?.id
    );

    // Enqueue BullMQ job
    const queue = getMindsQueue("compile-publish");
    await queue.add("compile-publish", { mindId, runId }, { jobId: runId });

    return res.status(201).json({ success: true, data: { runId } });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error starting compile:");
    return res.status(500).json({ error: "Failed to start compile & publish" });
  }
}

export async function listSyncRuns(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    const runs = await MindSyncRunModel.listByMind(mindId);
    return res.json({ success: true, data: runs });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error listing sync runs:");
    return res.status(500).json({ error: "Failed to list sync runs" });
  }
}

export async function listSyncRunsByBatch(req: Request, res: Response): Promise<any> {
  try {
    const { batchId } = req.params;
    const runs = await MindSyncRunModel.listByBatch(batchId);
    return res.json({ success: true, data: runs });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error listing sync runs by batch:");
    return res.status(500).json({ error: "Failed to list sync runs" });
  }
}

export async function getSyncRun(req: Request, res: Response): Promise<any> {
  try {
    const { runId } = req.params;
    const details = await syncService.getRunDetails(runId);
    return res.json({ success: true, data: details });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error getting sync run:");
    if (error.message?.includes("not found")) {
      return res.status(404).json({ error: "Sync run not found" });
    }
    return res.status(500).json({ error: "Failed to get sync run" });
  }
}

export async function getRunProposals(req: Request, res: Response): Promise<any> {
  try {
    const { runId } = req.params;
    const proposals = await MindSyncProposalModel.listByRun(runId);
    return res.json({ success: true, data: proposals });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error getting proposals:");
    return res.status(500).json({ error: "Failed to get proposals" });
  }
}

export async function getMindStatus(req: Request, res: Response): Promise<any> {
  try {
    const { mindId } = req.params;
    const status = await gating.getMindStatus(mindId);
    return res.json({ success: true, data: status });
  } catch (error: any) {
    logger.error({ err: error }, "[MINDS] Error getting mind status:");
    return res.status(500).json({ error: "Failed to get mind status" });
  }
}
