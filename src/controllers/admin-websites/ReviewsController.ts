/**
 * Admin Websites — Reviews Controller
 *
 * Project review sync (manual + Apify fetch), stats, list, hide-toggle, delete,
 * and review-job status polling.
 *
 * Behavior-preserving split from the former monolithic AdminWebsitesController.
 * Handlers and helpers are moved verbatim; logic is unchanged. Bound by the
 * matching resource sub-router under src/routes/admin/websites/.
 */

import { Request, Response } from "express";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import { ProjectReviewModel } from "../../models/website-builder/ProjectReviewModel";
import { ReviewModel } from "../../models/website-builder/ReviewModel";
import logger from "../../lib/logger";

/** POST /:id/reviews/sync — Trigger manual review sync for a project's org */
export async function triggerReviewSync(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;

    const project = await ProjectModel.findOrganizationIdById(id);

    if (!project) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Project not found" });
    }

    if (!project.organization_id) {
      return res.status(400).json({ success: false, error: "NO_ORG", message: "Project has no linked organization" });
    }

    const { getMindsQueue } = await import("../../workers/queues");
    const queue = getMindsQueue("review-sync");
    const job = await queue.add("manual-review-sync", { organizationId: project.organization_id });

    logger.info(`[Admin Websites] Triggered manual review sync for project ${id} (org ${project.organization_id}), job ${job.id}`);
    return res.json({ success: true, data: { jobId: job.id } });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error triggering review sync:");
    return res.status(500).json({ success: false, error: "SYNC_ERROR", message: error?.message });
  }
}

/** GET /:id/reviews/stats — Get review stats for a project's org locations */

/** GET /:id/reviews/stats — Get review stats for a project's org locations */
export async function getReviewStats(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;
    const scope = await ProjectReviewModel.getProjectScope(id);

    if (!scope) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Project not found" });
    }

    const stats = await ProjectReviewModel.getStats(scope);

    return res.json({
      success: true,
      data: {
        ...stats,
        hasGbpConnection: scope.hasGbpConnection,
        hasPlaceIds: scope.hasPlaceIds,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching review stats:");
    return res.status(500).json({ success: false, error: "STATS_ERROR", message: error?.message });
  }
}

/** POST /:id/reviews/fetch — Trigger Apify review fetch. Body may include { placeIds } to override project defaults. */

/** POST /:id/reviews/fetch — Trigger Apify review fetch. Body may include { placeIds } to override project defaults. */
export async function triggerApifyReviewFetch(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;
    const bodyPlaceIds: string[] | undefined = req.body?.placeIds;
    const scope = await ProjectReviewModel.getProjectScope(id);

    if (!scope) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Project not found" });
    }

    const placeIds = Array.isArray(bodyPlaceIds) && bodyPlaceIds.length > 0
      ? bodyPlaceIds.filter((pid: string) => scope.placeIds.includes(pid))
      : scope.placeIds;

    if (placeIds.length === 0) {
      return res.status(400).json({ success: false, error: "NO_PLACE_IDS", message: "No valid GBP locations selected" });
    }

    const { getMindsQueue } = await import("../../workers/queues");
    const queue = getMindsQueue("review-sync");
    const job = await queue.add("apify-review-fetch", { projectId: id, placeIds });

    logger.info(`[Admin Websites] Triggered Apify review fetch for project ${id}, ${placeIds.length} place(s), job ${job.id}`);
    return res.json({ success: true, data: { jobId: job.id, placeCount: placeIds.length } });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error triggering Apify review fetch:");
    return res.status(500).json({ success: false, error: "FETCH_ERROR", message: error?.message });
  }
}

/** GET /:id/reviews — List reviews for a project with search/filter */

/** GET /:id/reviews — List reviews for a project with search/filter */
export async function listReviews(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.params;
    const { search, stars, showHidden } = req.query;
    const scope = await ProjectReviewModel.getProjectScope(id);

    if (!scope) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Project not found" });
    }

    const reviews = await ProjectReviewModel.list(scope, {
      search: search as string | undefined,
      stars: stars ? parseInt(stars as string, 10) : undefined,
      showHidden: showHidden === "true",
    });

    return res.json({ success: true, data: reviews });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error listing reviews:");
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** PATCH /:id/reviews/:reviewId — Toggle review hidden status */

/** PATCH /:id/reviews/:reviewId — Toggle review hidden status */
export async function toggleReviewHidden(req: Request, res: Response): Promise<Response> {
  try {
    const { reviewId } = req.params;
    const { hidden } = req.body;

    if (typeof hidden !== "boolean") {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "hidden must be a boolean" });
    }

    const updated = await ReviewModel.toggleHidden(reviewId, hidden);

    if (updated === 0) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Review not found" });
    }

    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error toggling review:");
    return res.status(500).json({ success: false, error: "TOGGLE_ERROR", message: error?.message });
  }
}

/** DELETE /:id/reviews/:reviewId — Delete a review */

/** DELETE /:id/reviews/:reviewId — Delete a review */
export async function deleteReview(req: Request, res: Response): Promise<Response> {
  try {
    const { reviewId } = req.params;

    const deleted = await ReviewModel.deleteReview(reviewId);

    if (deleted === 0) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Review not found" });
    }

    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error deleting review:");
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

/** GET /:id/reviews/jobs/:jobId/status — Poll review sync/fetch job status */

/** GET /:id/reviews/jobs/:jobId/status — Poll review sync/fetch job status */
export async function getReviewJobStatus(req: Request, res: Response): Promise<Response> {
  try {
    const { jobId } = req.params;

    const { getMindsQueue } = await import("../../workers/queues");
    const queue = getMindsQueue("review-sync");
    const job = await queue.getJob(jobId);

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

    if (!job) {
      return res.json({ success: true, data: { jobId, state: "unknown" } });
    }

    const state = await job.getState();
    const failedReason = (job as any).failedReason || null;

    return res.json({
      success: true,
      data: { jobId: job.id, state, failedReason },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching review job status:");
    return res.status(500).json({ success: false, error: "STATUS_ERROR", message: error?.message });
  }
}

// =====================================================================
// AI POST GENERATION
// =====================================================================

/** POST /:id/posts/ai-generate — Generate post content with AI */
