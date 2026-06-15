/**
 * Admin Websites — Post Import Controller
 *
 * Start/poll post import from project identity.
 *
 * Behavior-preserving split from the former monolithic AdminWebsitesController.
 * Handlers and helpers are moved verbatim; logic is unchanged. Bound by the
 * matching resource sub-router under src/routes/admin/websites/.
 */

import { Request, Response } from "express";
import { getWbQueue } from "../../workers/wb-queues";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import logger from "../../lib/logger";

/**
 * POST /:projectId/posts/import — enqueue an import-from-identity job.
 * Body: { postType, entries: Array<string | { source_url, name }>, overwrite?: boolean }
 */
export async function startPostImport(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { projectId } = req.params;
    const { postType, entries, overwrite } = req.body || {};

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "projectId is required",
      });
    }
    if (!postType || !["doctor", "service", "location"].includes(postType)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "postType must be 'doctor' | 'service' | 'location'",
      });
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "entries must be a non-empty array",
      });
    }
    const project = await ProjectModel.findRawById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Project not found",
      });
    }

    const queue = getWbQueue("post-import");
    const job = await queue.add(
      "import-from-identity",
      {
        projectId,
        postType,
        entries,
        overwrite: !!overwrite,
      },
      {
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 25 },
      },
    );

    return res.status(202).json({
      success: true,
      data: { jobId: job.id, total: entries.length },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error starting post import:");
    return res.status(500).json({
      success: false,
      error: "ENQUEUE_ERROR",
      message: error?.message || "Failed to start import",
    });
  }
}

/**
 * GET /:projectId/posts/import/:jobId — return live progress + final results.
 *
 * Response shape:
 *   { state: "waiting"|"active"|"completed"|"failed"|"unknown",
 *     progress: { total, completed, results }, summary?: ImportResultSummary }
 */

/**
 * GET /:projectId/posts/import/:jobId — return live progress + final results.
 *
 * Response shape:
 *   { state: "waiting"|"active"|"completed"|"failed"|"unknown",
 *     progress: { total, completed, results }, summary?: ImportResultSummary }
 */
export async function getPostImportStatus(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { jobId } = req.params;
    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "jobId is required",
      });
    }
    const queue = getWbQueue("post-import");
    const job = await queue.getJob(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Job not found (it may have been pruned).",
      });
    }
    const state = await job.getState();
    const progress = (job.progress as unknown) || {
      total: 0,
      completed: 0,
      results: [],
    };
    const summary = job.returnvalue ?? null;
    const failedReason = (job as any).failedReason || null;

    return res.json({
      success: true,
      data: {
        jobId: job.id,
        state,
        progress,
        summary,
        failedReason,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching post import status:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch import status",
    });
  }
}

// =====================================================================
// LOCATIONS — F3 manage `identity.locations[]` + `selected_place_ids`
// =====================================================================
//
// All four handlers below are appended for plan
// `plans/04182026-no-ticket-identity-enrichments-and-post-imports/spec.md`
// task F3. They share a small set of helpers kept local to this section so
// existing handlers above are not modified.
//
// Reference implementation: `service.identity-warmup.ts:475` (`buildLocationEntryFromGbp`)
// and `:433` (`buildBusinessFromGbp`). Those helpers are not exported so we
// inline-construct the same shape here. `scrapeGbp` is the canonical Apify
// caller, reused.
