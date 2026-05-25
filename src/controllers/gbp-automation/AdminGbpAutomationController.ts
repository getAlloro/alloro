import { Request, Response } from "express";
import { LocationScopedRequest } from "../../middleware/rbac";
import { GbpActorService } from "./feature-services/GbpActorService";
import { GbpCustomizationService } from "./feature-services/GbpCustomizationService";
import { GbpReadinessService } from "./feature-services/GbpReadinessService";
import { GbpReviewDraftSlotService } from "./feature-services/GbpReviewDraftSlotService";
import { GbpPublishedReplyService } from "./feature-services/GbpPublishedReplyService";
import { GbpDeployPreviewService } from "./feature-services/GbpDeployPreviewService";
import { GbpLocalPostDraftService } from "./feature-services/GbpLocalPostDraftService";
import { GbpReviewEscalationService } from "./feature-services/GbpReviewEscalationService";
import { GbpReviewReplyService } from "./feature-services/GbpReviewReplyService";
import { GbpWorkItemService } from "./feature-services/GbpWorkItemService";
import { GbpAutomationError } from "./feature-utils/GbpAutomationError";
import {
  handleGbpError,
  ok,
  parseOptionalMonth,
  parseOptionalNumber,
  settingsPayload,
} from "./feature-utils/controllerResponses";

function adminContext(req: Request): {
  organizationId: number;
  userId: number | null;
  actorEmail: string | null;
  locationId: number;
} {
  const organizationId = parseOptionalNumber(req.params.organizationId);
  const locationId =
    parseOptionalNumber(req.query.locationId) ??
    parseOptionalNumber(req.body?.locationId);

  if (!organizationId || !locationId) {
    throw new GbpAutomationError(
      "MISSING_CONTEXT",
      "Organization and location context are required."
    );
  }

  return { organizationId, userId: null, actorEmail: null, locationId };
}

async function adminActionContext(req: Request): Promise<{
  organizationId: number;
  userId: number | null;
  actorEmail: string | null;
  locationId: number;
}> {
  const ctx = adminContext(req);
  const actor = await GbpActorService.resolveUserActor((req as LocationScopedRequest).user);
  return { ...ctx, userId: actor.userId, actorEmail: actor.email };
}

export class AdminGbpAutomationController {
  static async list(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = adminContext(req);
      return ok(
        res,
        await GbpWorkItemService.listForLocation(ctx.organizationId, ctx.locationId, {
          needsReplyMonth: parseOptionalMonth(req.query.needsReplyMonth),
          repliedMonth: parseOptionalMonth(req.query.repliedMonth),
        })
      );
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async readiness(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = adminContext(req);
      return ok(
        res,
        await GbpReadinessService.getLocationReadiness(ctx.organizationId, ctx.locationId)
      );
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async updateSettings(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = adminContext(req);
      const settings = await GbpCustomizationService.updateSettings(
        ctx.organizationId,
        ctx.locationId,
        settingsPayload(req.body || {})
      );
      return ok(res, settings);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async syncReviews(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = adminContext(req);
      const { getMindsQueue } = await import("../../workers/queues");
      const queue = getMindsQueue("review-sync");
      const job = await queue.add("manual-review-sync", {
        organizationId: ctx.organizationId,
        locationId: ctx.locationId,
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

  static async generateDraft(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = await adminActionContext(req);
      const item = await GbpReviewReplyService.generateDraft({
        ...ctx,
        reviewId: req.params.reviewId,
      });
      return ok(res, item, 201);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async saveReviewDraftSlot(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = await adminActionContext(req);
      const item = await GbpReviewDraftSlotService.saveDraftForReview({
        ...ctx,
        reviewId: req.params.reviewId,
        draftContent: String(req.body?.draftContent || ""),
      });
      return ok(res, item);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async updateReviewEscalation(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = await adminActionContext(req);
      const escalation = await GbpReviewEscalationService.update({
        organizationId: ctx.organizationId,
        locationId: ctx.locationId,
        reviewId: req.params.reviewId,
        status:
          req.body?.status === "resolved"
            ? "resolved"
            : req.body?.status === "dismissed"
              ? "dismissed"
              : "open",
        reason: String(req.body?.reason || "manual"),
        note: typeof req.body?.note === "string" ? req.body.note : null,
        actorUserId: ctx.userId,
      });
      return ok(res, escalation);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async createPostDraftFromReview(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = await adminActionContext(req);
      const item = await GbpLocalPostDraftService.createFromReview({
        ...ctx,
        reviewId: req.params.reviewId,
      });
      return ok(res, item, 201);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async updatePublishedReply(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = adminContext(req);
      const review = await GbpPublishedReplyService.updateReply({
        organizationId: ctx.organizationId,
        locationId: ctx.locationId,
        reviewId: req.params.reviewId,
        replyContent: String(req.body?.replyContent || ""),
      });
      return ok(res, review);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async deletePublishedReply(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = adminContext(req);
      const review = await GbpPublishedReplyService.deleteReply({
        organizationId: ctx.organizationId,
        locationId: ctx.locationId,
        reviewId: req.params.reviewId,
      });
      return ok(res, review);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async updateDraft(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = await adminActionContext(req);
      const item = await GbpReviewReplyService.updateDraft({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        actorEmail: ctx.actorEmail,
        accessibleLocationIds: [ctx.locationId],
        workItemId: req.params.id,
        draftContent: String(req.body?.draftContent || ""),
      });
      return ok(res, item);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async approve(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = await adminActionContext(req);
      const item = await GbpReviewReplyService.approve({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        actorEmail: ctx.actorEmail,
        accessibleLocationIds: [ctx.locationId],
        workItemId: req.params.id,
        approvedContent: req.body?.approvedContent,
      });
      return ok(res, item);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async reject(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = await adminActionContext(req);
      const item = await GbpReviewReplyService.reject({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        actorEmail: ctx.actorEmail,
        accessibleLocationIds: [ctx.locationId],
        workItemId: req.params.id,
        reason: req.body?.reason,
      });
      return ok(res, item);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async deploy(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = await adminActionContext(req);
      const item = await GbpReviewReplyService.enqueueDeployment({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        actorEmail: ctx.actorEmail,
        accessibleLocationIds: [ctx.locationId],
        workItemId: req.params.id,
        confirmedSafetyStatus:
          req.body?.confirmNeedsReview === true ? "needs_review" : null,
      });
      return ok(res, item);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async retry(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = await adminActionContext(req);
      const item = await GbpReviewReplyService.retryDeployment({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        actorEmail: ctx.actorEmail,
        accessibleLocationIds: [ctx.locationId],
        workItemId: req.params.id,
      });
      return ok(res, item);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async deployPreview(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = adminContext(req);
      const preview = await GbpDeployPreviewService.build({
        organizationId: ctx.organizationId,
        workItemId: req.params.id,
        accessibleLocationIds: [ctx.locationId],
      });
      return ok(res, preview);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async getAttempts(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = adminContext(req);
      const attempts = await GbpWorkItemService.getAttempts({
        organizationId: ctx.organizationId,
        workItemId: req.params.id,
        accessibleLocationIds: [ctx.locationId],
      });
      return ok(res, attempts);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }
}
