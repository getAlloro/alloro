import { Request, Response } from "express";
import { getMindsQueue } from "../../workers/queues";
import { GbpPublishedReplyService } from "./feature-services/GbpPublishedReplyService";
import { handleGbpError, ok } from "./feature-utils/controllerResponses";
import { clientContext } from "./GbpAutomationController";

export class GbpReviewManagementController {
  static async syncReviews(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const queue = getMindsQueue("review-sync");
      const job = await queue.add("manual-review-sync", {
        organizationId: ctx.organizationId,
        locationId: ctx.locationId,
        syncSource: "manual",
      });
      return ok(
        res,
        { jobId: job.id || null, organizationId: ctx.organizationId, locationId: ctx.locationId },
        202
      );
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async updatePublishedReply(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const review = await GbpPublishedReplyService.updateReply({
        organizationId: ctx.organizationId,
        locationId: ctx.locationId,
        reviewId: req.params.reviewId,
        replyContent: String(req.body?.replyContent || ""),
        accessibleLocationIds: ctx.accessibleLocationIds,
      });
      return ok(res, review);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async deletePublishedReply(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const review = await GbpPublishedReplyService.deleteReply({
        organizationId: ctx.organizationId,
        locationId: ctx.locationId,
        reviewId: req.params.reviewId,
        accessibleLocationIds: ctx.accessibleLocationIds,
      });
      return ok(res, review);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }
}
