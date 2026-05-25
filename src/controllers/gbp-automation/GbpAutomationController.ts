import { Request, Response } from "express";
import { LocationScopedRequest } from "../../middleware/rbac";
import { GbpCustomizationService } from "./feature-services/GbpCustomizationService";
import { GbpReadinessService } from "./feature-services/GbpReadinessService";
import { GbpReviewDraftSlotService } from "./feature-services/GbpReviewDraftSlotService";
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
      });
      return ok(res, item, 201);
    } catch (error) {
      return handleGbpError(res, error);
    }
  }

  static async updateDraft(req: Request, res: Response): Promise<Response> {
    try {
      const ctx = clientContext(req);
      const item = await GbpReviewReplyService.updateDraft({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        actorEmail: ctx.actorEmail,
        accessibleLocationIds: ctx.accessibleLocationIds,
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
      const ctx = clientContext(req);
      const item = await GbpReviewReplyService.approve({
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
      const item = await GbpReviewReplyService.reject({
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
      const item = await GbpReviewReplyService.enqueueDeployment({
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
      const item = await GbpReviewReplyService.retryDeployment({
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
