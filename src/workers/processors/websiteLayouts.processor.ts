/**
 * Website Layouts Processor
 *
 * Handles `wb-layout-generate` BullMQ jobs. Wraps generateLayouts() with
 * cancel polling + AbortController (same pattern as websiteGeneration.processor).
 */

import { Job } from "bullmq";
import { generateLayouts } from "../../controllers/admin-websites/feature-services/service.layouts-pipeline";
import { isCancelled } from "../../controllers/admin-websites/feature-services/service.generation-pipeline";
import { db } from "../../database/connection";
import logger from "../../lib/logger";

const PROJECTS_TABLE = "website_builder.projects";
const LOG_PREFIX = "[WB-LAYOUTS]";

export interface LayoutGenerateJobData {
  projectId: string;
  slotValues: Record<string, string>;
}

export async function processLayoutGenerate(
  job: Job<LayoutGenerateJobData>,
): Promise<void> {
  const { projectId, slotValues } = job.data;
  const log = (msg: string) =>
    logger.info(`${LOG_PREFIX} [${job.id}] ${msg}`);

  log(`Starting layout generation for project ${projectId}`);

  if (await isCancelled(projectId)) {
    log("Cancelled before start");
    return;
  }

  const controller = new AbortController();

  const cancelPollInterval = setInterval(async () => {
    try {
      if (await isCancelled(projectId)) {
        controller.abort();
      }
    } catch {
      /* ignore */
    }
  }, 10000);

  try {
    await generateLayouts(projectId, slotValues || {}, controller.signal);
    log("Layout generation complete");
  } catch (err: any) {
    if (err?.message === "Generation cancelled" || controller.signal.aborted) {
      log("Cancelled during generation");
      await db(PROJECTS_TABLE).where("id", projectId).update({
        layouts_generation_status: "cancelled",
        layouts_generation_progress: null,
        updated_at: db.fn.now(),
      });
      return;
    }
    log(`Layout generation failed: ${err.message}`);
    throw err;
  } finally {
    clearInterval(cancelPollInterval);
  }
}
