import { Request, Response } from "express";
import { LocationScopedRequest } from "../../middleware/rbac";
import { GbpCustomizationService } from "./feature-services/GbpCustomizationService";
import { GbpReadinessService } from "./feature-services/GbpReadinessService";
import { GbpReviewDraftSlotService } from "./feature-services/GbpReviewDraftSlotService";
import { GbpDeployPreviewService } from "./feature-services/GbpDeployPreviewService";
import { GbpBusinessInfoDraftService } from "./feature-services/GbpBusinessInfoDraftService";
import { GbpCompletenessDraftService } from "./feature-services/GbpCompletenessDraftService";
import { GbpLocalPostDraftService } from "./feature-services/GbpLocalPostDraftService";
import { GbpLocalPostScheduleService } from "./feature-services/GbpLocalPostScheduleService";
import { GbpPostMediaService } from "./feature-services/GbpPostMediaService";
import { GbpPublishedLocalPostService } from "./feature-services/GbpPublishedLocalPostService";
import { GbpReviewEscalationService } from "./feature-services/GbpReviewEscalationService";
import { GbpReviewReplyService } from "./feature-services/GbpReviewReplyService";
import { GbpWorkItemActionService } from "./feature-services/GbpWorkItemActionService";
import { GbpWorkItemService } from "./feature-services/GbpWorkItemService";
import { GbpAutomationError } from "./feature-utils/GbpAutomationError";
import {
  handleGbpError,
  ok,
  parseOptionalMonth,
  parseOptionalNumber,
  settingsPayload,
} from "./feature-utils/controllerResponses";
import { parseBusinessInfoDraftInput } from "./feature-utils/gbpBusinessInfo";

type HandlerRequest = Request | LocationScopedRequest;

function scoped(req: HandlerRequest): LocationScopedRequest {
  return req as LocationScopedRequest;
}

export function clientContext(req: HandlerRequest): {
  organizationId: number;
  userId: number;
  actorEmail: string | null;
  locationId: number;
  accessibleLocationIds?: number[];
} {
  const request = scoped(req);
  const requestedLocationId =
    parseOptionalNumber(req.query.locationId) ??
    parseOptionalNumber(req.body?.locationId);
  const accessibleLocationIds = request.accessibleLocationIds;

  if (!accessibleLocationIds) {
    throw new GbpAutomationError(
      "LOCATION_SCOPE_UNAVAILABLE",
      "Location access could not be verified."
    );
  }

  const locationId =
    typeof request.locationId === "number" ? request.locationId : (accessibleLocationIds[0] ?? null);

  if (requestedLocationId !== null && request.locationId !== requestedLocationId) {
    throw new GbpAutomationError(
      "LOCATION_ACCESS_DENIED",
      "No access to this location."
    );
  }

  if (!request.organizationId || !request.userId || !locationId) {
    throw new GbpAutomationError(
      "MISSING_CONTEXT",
      "Organization, user, and location context are required."
    );
  }

  return {
    organizationId: request.organizationId,
    userId: request.userId,
    actorEmail: request.user?.email || null,
    locationId,
    accessibleLocationIds,
  };
}

export class GbpAutomationController {
  static async getReadiness(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const readiness = await GbpReadinessService.getLocationReadiness(
        ctx.organizationId,
        ctx.locationId
      );
      return ok(res, readiness);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async listWorkItems(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const result = await GbpWorkItemService.listForLocation(
        ctx.organizationId,
        ctx.locationId,
        {
          needsReplyMonth: parseOptionalMonth(req.query.needsReplyMonth),
          repliedMonth: parseOptionalMonth(req.query.repliedMonth),
        }
      );
      return ok(res, result);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async createBusinessInfoDraft(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const input = parseBusinessInfoDraftInput(req.body);
      const item = await GbpBusinessInfoDraftService.createDraft({
        organizationId: ctx.organizationId,
        locationId: ctx.locationId,
        userId: ctx.userId,
        actorEmail: ctx.actorEmail,
        accessibleLocationIds: ctx.accessibleLocationIds,
        patch: input.patch,
        updateMask: input.updateMask,
        summary: input.summary,
      });
      return ok(res, item, 201);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  /**
   * MANUAL detect → fix trigger: grade the caller's location for GBP completeness and
   * stage an owner-approval fill draft for the gaps Alloro can fill on its own. Thin
   * by design (mirrors createBusinessInfoDraft, §6.1) — all logic is in the service.
   * Nothing auto-publishes: the draft is owner-approved downstream and the write-back
   * master switch is re-enforced in createDraft. 201 when a draft was staged, 200 when
   * nothing was fillable (honest empty, never a fabricated draft).
   */
  static async createCompletenessFillDraft(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const result = await GbpCompletenessDraftService.stageFillForLocation({
        organizationId: ctx.organizationId,
        locationId: ctx.locationId,
        userId: ctx.userId,
        actorEmail: ctx.actorEmail,
        accessibleLocationIds: ctx.accessibleLocationIds,
      });
      return ok(res, result, result.workItem ? 201 : 200);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async revertBusinessInfo(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const item = await GbpWorkItemActionService.revertBusinessInfo({
        organizationId: ctx.organizationId,
        workItemId: req.params.id,
        userId: ctx.userId,
        actorEmail: ctx.actorEmail,
        accessibleLocationIds: ctx.accessibleLocationIds,
      });
      return ok(res, item);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async getSettings(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const settings = await GbpCustomizationService.getOrCreateSettings(
        ctx.organizationId,
        ctx.locationId
      );
      return ok(res, settings);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async updateSettings(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
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

  static async generateDraft(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
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
      const ctx = clientContext(req);
      const item = await GbpReviewDraftSlotService.saveDraftForReview({
        ...ctx,
        reviewId: req.params.reviewId,
        draftContent: String(req.body?.draftContent || ""),
        source: "client_review_slot",
      });
      return ok(res, item);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async updateReviewEscalation(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
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
        accessibleLocationIds: ctx.accessibleLocationIds,
      });
      return ok(res, escalation);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async createPostDraftFromReview(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const item = await GbpLocalPostDraftService.createFromReview({
        ...ctx,
        reviewId: req.params.reviewId,
        featuredImageUrl: String(req.body?.featuredImageUrl || ""),
      });
      return ok(res, item, 201);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async generatePostDraftNow(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const item = await GbpLocalPostScheduleService.generateNow({
        ...ctx,
        featuredImageUrl: String(req.body?.featuredImageUrl || ""),
      });
      return ok(res, item, 201);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async uploadPostMedia(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const result = await GbpPostMediaService.upload({
        organizationId: ctx.organizationId,
        locationId: ctx.locationId,
        accessibleLocationIds: ctx.accessibleLocationIds,
        file: req.file,
      });
      return ok(res, result, 201);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async listPublishedPosts(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const result = await GbpPublishedLocalPostService.list({
        organizationId: ctx.organizationId,
        locationId: ctx.locationId,
        accessibleLocationIds: ctx.accessibleLocationIds,
        page: parseOptionalNumber(req.query.page) || 1,
        limit: parseOptionalNumber(req.query.limit) || 10,
      });
      return ok(res, result);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async syncPublishedPosts(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const result = await GbpPublishedLocalPostService.sync({
        organizationId: ctx.organizationId,
        locationId: ctx.locationId,
        accessibleLocationIds: ctx.accessibleLocationIds,
        syncSource: "manual",
      });
      return ok(res, result, 202);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async updatePublishedPost(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const post = await GbpPublishedLocalPostService.update({
        organizationId: ctx.organizationId,
        locationId: ctx.locationId,
        accessibleLocationIds: ctx.accessibleLocationIds,
        actorUserId: ctx.userId,
        actorEmail: ctx.actorEmail,
        postName: String(req.body?.name || ""),
        summary: String(req.body?.summary || ""),
        featuredImageUrl: String(req.body?.featuredImageUrl || ""),
      });
      return ok(res, post);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async deletePublishedPost(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const result = await GbpPublishedLocalPostService.delete({
        organizationId: ctx.organizationId,
        locationId: ctx.locationId,
        accessibleLocationIds: ctx.accessibleLocationIds,
        actorUserId: ctx.userId,
        actorEmail: ctx.actorEmail,
        postName: String(req.query.name || ""),
      });
      return ok(res, result);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async regeneratePostDraft(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const item = await GbpLocalPostDraftService.regenerateDraft({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        actorEmail: ctx.actorEmail,
        accessibleLocationIds: ctx.accessibleLocationIds,
        workItemId: req.params.id,
      });
      return ok(res, item);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async updateDraft(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const item = await GbpWorkItemActionService.updateDraft({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        actorEmail: ctx.actorEmail,
        accessibleLocationIds: ctx.accessibleLocationIds,
        workItemId: req.params.id,
        draftContent: String(req.body?.draftContent || ""),
        featuredImageUrl:
          typeof req.body?.featuredImageUrl === "string" ? req.body.featuredImageUrl : undefined,
      });
      return ok(res, item);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async approve(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const item = await GbpWorkItemActionService.approve({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        actorEmail: ctx.actorEmail,
        accessibleLocationIds: ctx.accessibleLocationIds,
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
      const ctx = clientContext(req);
      const item = await GbpWorkItemActionService.reject({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        actorEmail: ctx.actorEmail,
        accessibleLocationIds: ctx.accessibleLocationIds,
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
      const ctx = clientContext(req);
      const item = await GbpWorkItemActionService.enqueueDeployment({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        actorEmail: ctx.actorEmail,
        accessibleLocationIds: ctx.accessibleLocationIds,
        workItemId: req.params.id,
        confirmedSafetyStatus:
          req.body?.confirmNeedsReview === true ? "needs_review" : null,
      });
      return ok(res, item);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async deployPreview(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const preview = await GbpDeployPreviewService.build({
        organizationId: ctx.organizationId,
        workItemId: req.params.id,
        accessibleLocationIds: ctx.accessibleLocationIds,
      });
      return ok(res, preview);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async retry(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const item = await GbpWorkItemActionService.retryDeployment({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        actorEmail: ctx.actorEmail,
        accessibleLocationIds: ctx.accessibleLocationIds,
        workItemId: req.params.id,
      });
      return ok(res, item);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async getAttempts(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const attempts = await GbpWorkItemService.getAttempts({
        organizationId: ctx.organizationId,
        workItemId: req.params.id,
        accessibleLocationIds: ctx.accessibleLocationIds,
      });
      return ok(res, attempts);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }
}
