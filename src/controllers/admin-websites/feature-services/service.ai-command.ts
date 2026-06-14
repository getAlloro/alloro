/**
 * AI Command Service
 *
 * Orchestrates batch analysis of website content (layouts, pages, posts)
 * against a user prompt/checklist. Produces structured recommendations
 * stored in the database for review and later execution.
 *
 * This module is the public entry point. Behavior-preserving decomposition
 * splits the heavy lifting into sibling modules (import surface unchanged —
 * `analyzeBatch` / `executeBatch` are re-exported here):
 *   - service.ai-command-analysis     analyze phase (ai_editor + ui/link checker)
 *   - service.ai-command-execute      execute phase + per-type handlers
 *   - feature-utils/util.ai-command-shared     shared resolve/context helpers
 *   - feature-utils/util.ai-command-templates  shortcode-template prompt context
 *   - feature-utils/util.ai-command-summary    post-run execution summary
 */

import { AiCommandBatchModel } from "../../../models/website-builder/AiCommandBatchModel";
import { AiCommandRecommendationModel } from "../../../models/website-builder/AiCommandRecommendationModel";
import logger from "../../../lib/logger";
import {
  type AiCommandTargets,
  type BatchType,
  refreshStats,
} from "../feature-utils/util.ai-command-shared";

// Re-export the phase entry points so consumers continue importing them from
// this path (`import * as aiCommand from "./feature-services/service.ai-command"`).
export { analyzeBatch } from "./service.ai-command-analysis";
export { executeBatch } from "./service.ai-command-execute";
export type { BatchType };

// ---------------------------------------------------------------------------
// Create batch
// ---------------------------------------------------------------------------

export async function createBatch(
  projectId: string,
  prompt: string,
  targets: AiCommandTargets,
  createdBy?: string,
  batchType: BatchType = "ai_editor"
): Promise<any> {
  const batch = await AiCommandBatchModel.insertReturning({
    project_id: projectId,
    prompt: prompt || "",
    targets: JSON.stringify({ ...targets, type: batchType }),
    status: "analyzing",
    created_by: createdBy || null,
  });

  logger.info(`[AiCommand] Created batch ${batch.id} for project ${projectId}`);
  return batch;
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export async function getBatch(batchId: string): Promise<any> {
  return AiCommandBatchModel.findRawById(batchId);
}

export async function listBatches(projectId: string): Promise<any[]> {
  return AiCommandBatchModel.listByProjectId(projectId);
}

export async function deleteBatch(batchId: string): Promise<void> {
  await AiCommandBatchModel.deleteById(batchId);
}

export async function updateBatchSummary(batchId: string, summary: string): Promise<any> {
  return AiCommandBatchModel.updateSummaryReturning(batchId, summary);
}

export async function getBatchRecommendations(
  batchId: string,
  filters?: { status?: string; target_type?: string }
): Promise<any[]> {
  return AiCommandRecommendationModel.findByBatchId(batchId, filters);
}

// ---------------------------------------------------------------------------
// Update operations
// ---------------------------------------------------------------------------

export async function updateRecommendationStatus(
  recommendationId: string,
  status: "approved" | "rejected",
  metaUpdates?: { reference_url?: string; reference_content?: string }
): Promise<any> {
  const updatePayload: Record<string, unknown> = { status };

  // Merge reference data into target_meta for create_page/create_post
  if (metaUpdates && (metaUpdates.reference_url || metaUpdates.reference_content)) {
    const existing = await AiCommandRecommendationModel.findRawById(recommendationId);
    if (existing) {
      const meta = typeof existing.target_meta === "string"
        ? JSON.parse(existing.target_meta)
        : existing.target_meta || {};
      if (metaUpdates.reference_url) meta.reference_url = metaUpdates.reference_url;
      if (metaUpdates.reference_content) meta.reference_content = metaUpdates.reference_content;
      updatePayload.target_meta = JSON.stringify(meta);
    }
  }

  const rec = await AiCommandRecommendationModel.updateByIdReturning(
    recommendationId,
    updatePayload
  );

  if (rec) {
    await refreshStats(rec.batch_id);
  }

  return rec;
}

export async function bulkUpdateStatus(
  batchId: string,
  status: "approved" | "rejected",
  filters?: { target_type?: string }
): Promise<number> {
  const updated = await AiCommandRecommendationModel.bulkUpdatePendingStatus(
    batchId,
    status,
    filters
  );
  await refreshStats(batchId);
  return updated;
}
