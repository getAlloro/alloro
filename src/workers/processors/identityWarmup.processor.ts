/**
 * Identity Warmup Processor
 *
 * Handles `wb-identity-warmup` BullMQ jobs. Wraps `runIdentityWarmup` with
 * cancel polling + AbortController (same pattern as websiteGeneration.processor.ts).
 */

import { Job } from "bullmq";
import {
  runIdentityWarmup,
  type WarmupInputs,
} from "../../controllers/admin-websites/feature-services/service.identity-warmup";
import { isCancelled } from "../../controllers/admin-websites/feature-services/service.generation-pipeline";
import { db } from "../../database/connection";
import logger from "../../lib/logger";

const PROJECTS_TABLE = "website_builder.projects";
const LOG_PREFIX = "[WB-IDENTITY]";

export interface IdentityWarmupJobData {
  projectId: string;
  inputs: WarmupInputs;
}

export async function processIdentityWarmup(
  job: Job<IdentityWarmupJobData>,
): Promise<void> {
  const { projectId, inputs } = job.data;
  const log = (msg: string) =>
    logger.info(`${LOG_PREFIX} [${job.id}] ${msg}`);

  log(`Starting identity warmup for project ${projectId}`);

  if (await isCancelled(projectId)) {
    log("Cancelled before start, skipping");
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
    await runIdentityWarmup(projectId, inputs, controller.signal);
    log("Warmup complete");
  } catch (err: any) {
    if (err?.message === "Warmup cancelled" || controller.signal.aborted) {
      log("Cancelled during warmup");
      return;
    }

    log(`Warmup failed: ${err.message}`);
    // Identity warmup service already marks warmup_status='failed' on error
    // Re-throw so BullMQ records the failure
    throw err;
  } finally {
    clearInterval(cancelPollInterval);
  }
}
