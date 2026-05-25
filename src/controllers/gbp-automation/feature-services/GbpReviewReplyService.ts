import { LocationModel } from "../../../models/LocationModel";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { db } from "../../../database/connection";
import { ReviewModel } from "../../../models/website-builder/ReviewModel";
import { GbpWorkEventModel } from "../../../models/GbpWorkEventModel";
import { GbpWorkItemModel, IGbpWorkItem } from "../../../models/GbpWorkItemModel";
import { getGbpAutomationQueue } from "../../../workers/queues";
import { GbpAutomationError } from "../feature-utils/GbpAutomationError";
import { GbpContentSafetyService } from "./GbpContentSafetyService";
import { GbpCustomizationService } from "./GbpCustomizationService";
import { GbpDraftGenerationService } from "./GbpDraftGenerationService";
import { GbpNotificationService } from "./GbpNotificationService";
import { GbpReviewReplyDeploymentService } from "./GbpReviewReplyDeploymentService";
import { GbpReadinessService } from "./GbpReadinessService";

function ensureLocationAccess(
  item: IGbpWorkItem,
  accessibleLocationIds?: number[]
): void {
  if (accessibleLocationIds && !accessibleLocationIds.includes(item.location_id)) {
    throw new GbpAutomationError("LOCATION_ACCESS_DENIED", "No access to this location.");
  }
}

function actorMetadata(actorEmail?: string | null): Record<string, unknown> {
  return actorEmail ? { actorEmail } : {};
}

export class GbpReviewReplyService {
  static async generateDraft(params: {
    organizationId: number;
    locationId: number;
    reviewId: string;
    userId: number | null;
    actorEmail?: string | null;
    accessibleLocationIds?: number[];
  }): Promise<IGbpWorkItem> {
    if (params.accessibleLocationIds && !params.accessibleLocationIds.includes(params.locationId)) {
      throw new GbpAutomationError("LOCATION_ACCESS_DENIED", "No access to this location.");
    }

    const readiness = await GbpReadinessService.getLocationReadiness(
      params.organizationId,
      params.locationId
    );
    if (!readiness.ready) {
      throw new GbpAutomationError("GBP_NOT_READY", "GBP review replies are not ready.", {
        readiness,
      });
    }

    const review = await ReviewModel.findById(params.reviewId);
    if (!review || review.location_id !== params.locationId) {
      throw new GbpAutomationError("REVIEW_NOT_FOUND", "Review not found for this location.");
    }
    if (review.source !== "oauth" || !review.google_review_name || review.has_reply) {
      throw new GbpAutomationError(
        "REVIEW_NOT_REPLYABLE",
        "Only unreplied OAuth GBP reviews can be replied to."
      );
    }

    const existing = await GbpWorkItemModel.findActiveReviewReplyForReview(review.id);
    if (existing?.status === "deploying") {
      throw new GbpAutomationError(
        "INVALID_STATUS",
        "This reply is currently deploying and cannot be regenerated."
      );
    }

    const organization = await OrganizationModel.findById(params.organizationId);
    const location = await LocationModel.findById(params.locationId);
    const settings = await GbpCustomizationService.getEffectiveSettings(
      params.organizationId,
      params.locationId
    );
    if (!organization || !location || !readiness.googleProperty) {
      throw new GbpAutomationError("GBP_CONTEXT_MISSING", "GBP automation context is incomplete.");
    }
    const googleProperty = readiness.googleProperty;

    const draft = await GbpDraftGenerationService.generateReviewReplyDraft({
      organization,
      location,
      review,
      settings,
      previousDraftContent: existing?.draft_content || null,
    });

    if (existing) {
      const safety = GbpContentSafetyService.validateReviewReply(draft.draftContent);
      await db.transaction(async (trx) => {
        await GbpWorkItemModel.replaceGeneratedDraft(existing.id, {
          draftContent: draft.draftContent,
          promptKey: draft.promptKey,
          generationInput: draft.generationInput,
          customizations: draft.customizations,
          safety,
          metadata: {
            ...existing.metadata,
            ...actorMetadata(params.actorEmail),
            regeneratedAt: new Date().toISOString(),
          },
        }, trx);

        await GbpWorkEventModel.create({
          work_item_id: existing.id,
          actor_user_id: params.userId,
          event_type: "draft_regenerated",
          metadata: {
            reviewId: review.id,
            byteLength: safety.byteLength,
            safetyStatus: safety.status,
            safetyReasonCodes: safety.reasonCodes,
            ...actorMetadata(params.actorEmail),
          },
        }, trx);
      });

      return (await GbpWorkItemModel.findById(existing.id))!;
    }

    const item = await db.transaction(async (trx) => {
      const created = await GbpWorkItemModel.create({
        organization_id: params.organizationId,
        location_id: params.locationId,
        google_property_id: googleProperty.id,
        content_type: "review_reply",
        source_review_id: review.id,
        status: "draft",
        draft_content: draft.draftContent,
        generation_prompt_key: draft.promptKey,
        generation_input: draft.generationInput,
        generation_customizations: draft.customizations,
        safety_status: draft.safety.status,
        safety_reason_codes: draft.safety.reasonCodes,
        safety_reasons: draft.safety.reasons,
        safety_confidence: draft.safety.confidence,
        created_by_user_id: params.userId,
        metadata: actorMetadata(params.actorEmail),
      }, trx);

      await GbpWorkEventModel.create({
        work_item_id: created.id,
        actor_user_id: params.userId,
        event_type: "draft_created",
        metadata: { reviewId: review.id, ...actorMetadata(params.actorEmail) },
      }, trx);

      return created;
    });
    await GbpNotificationService.create({
      organizationId: params.organizationId,
      locationId: params.locationId,
      workItemId: item.id,
      kind: "gbp_reply_draft_ready",
      title: "GBP reply draft ready",
      message: "A Google review reply draft is ready for review.",
    }).catch(() => undefined);

    return item;
  }

  static async updateDraft(params: {
    organizationId: number;
    workItemId: string;
    draftContent: string;
    userId: number | null;
    actorEmail?: string | null;
    accessibleLocationIds?: number[];
  }): Promise<IGbpWorkItem> {
    const item = await this.getScopedWorkItem(params);
    if (item.status === "published" || item.status === "deploying") {
      throw new GbpAutomationError("INVALID_STATUS", "This reply cannot be edited now.");
    }

    const safety = GbpContentSafetyService.validateReviewReply(params.draftContent);
    if (!safety.isSafe) {
      throw new GbpAutomationError("UNSAFE_REPLY_CONTENT", "Reply content failed safety checks.", {
        reasons: safety.reasons,
      });
    }

    await db.transaction(async (trx) => {
      await GbpWorkItemModel.updateDraft(item.id, params.draftContent, safety, trx);
      await GbpWorkEventModel.create({
        work_item_id: item.id,
        actor_user_id: params.userId,
        event_type: "draft_updated",
        metadata: {
          byteLength: safety.byteLength,
          safetyStatus: safety.status,
          safetyReasonCodes: safety.reasonCodes,
          ...actorMetadata(params.actorEmail),
        },
      }, trx);
    });
    return (await GbpWorkItemModel.findById(item.id))!;
  }

  static async approve(params: {
    organizationId: number;
    workItemId: string;
    userId: number | null;
    actorEmail?: string | null;
    approvedContent?: string;
    accessibleLocationIds?: number[];
  }): Promise<IGbpWorkItem> {
    const item = await this.getScopedWorkItem(params);
    const content = (params.approvedContent || item.draft_content).trim();
    const safety = GbpContentSafetyService.validateReviewReply(content);
    if (!safety.isSafe) {
      throw new GbpAutomationError("UNSAFE_REPLY_CONTENT", "Reply content failed safety checks.", {
        reasons: safety.reasons,
      });
    }

    await db.transaction(async (trx) => {
      const approved = await GbpWorkItemModel.approve(
        item.id,
        params.userId,
        content,
        safety,
        trx
      );
      if (approved === 0) {
        throw new GbpAutomationError("INVALID_STATUS", "This reply cannot be approved now.");
      }
      await GbpWorkEventModel.create({
        work_item_id: item.id,
        actor_user_id: params.userId,
        event_type: "approved",
        metadata: {
          byteLength: safety.byteLength,
          safetyStatus: safety.status,
          safetyReasonCodes: safety.reasonCodes,
          ...actorMetadata(params.actorEmail),
        },
      }, trx);
    });
    return (await GbpWorkItemModel.findById(item.id))!;
  }

  static async reject(params: {
    organizationId: number;
    workItemId: string;
    userId: number | null;
    actorEmail?: string | null;
    reason?: string;
    accessibleLocationIds?: number[];
  }): Promise<IGbpWorkItem> {
    const item = await this.getScopedWorkItem(params);
    await db.transaction(async (trx) => {
      await GbpWorkItemModel.updateById(item.id, {
        status: "rejected",
        rejected_by_user_id: params.userId,
        rejected_at: new Date(),
        metadata: {
          ...item.metadata,
          rejectionReason: params.reason || null,
          ...actorMetadata(params.actorEmail),
        },
      }, trx);
      await GbpWorkEventModel.create({
        work_item_id: item.id,
        actor_user_id: params.userId,
        event_type: "rejected",
        metadata: { reason: params.reason || null, ...actorMetadata(params.actorEmail) },
      }, trx);
    });
    return (await GbpWorkItemModel.findById(item.id))!;
  }

  static async enqueueDeployment(params: {
    organizationId: number;
    workItemId: string;
    userId: number | null;
    actorEmail?: string | null;
    accessibleLocationIds?: number[];
    confirmedSafetyStatus?: string | null;
  }): Promise<IGbpWorkItem> {
    const item = await this.getScopedWorkItem(params);
    if (item.status !== "approved") {
      throw new GbpAutomationError("APPROVAL_REQUIRED", "Approve the draft before deployment.");
    }
    const content = item.approved_content || item.draft_content;
    const safety = GbpContentSafetyService.validateReviewReply(content);
    if (!safety.isSafe) {
      throw new GbpAutomationError("UNSAFE_REPLY_CONTENT", "Reply content failed safety checks.", {
        reasons: safety.reasons,
        reasonCodes: safety.reasonCodes,
      });
    }
    if (safety.status === "needs_review" && params.confirmedSafetyStatus !== "needs_review") {
      throw new GbpAutomationError(
        "DEPLOY_PREVIEW_REQUIRED",
        "Review the deploy preview before publishing this reply.",
        { safety }
      );
    }

    await db.transaction(async (trx) => {
      const marked = await GbpWorkItemModel.markDeploying(item.id, params.userId, trx);
      if (marked === 0) {
        throw new GbpAutomationError("INVALID_STATUS", "This reply is already deploying.");
      }
      await GbpWorkEventModel.create({
        work_item_id: item.id,
        actor_user_id: params.userId,
        event_type: "deployment_queued",
        metadata: {
          safetyStatus: safety.status,
          safetyReasonCodes: safety.reasonCodes,
          ...actorMetadata(params.actorEmail),
        },
      }, trx);
    });
    await getGbpAutomationQueue("deployment").add(
      "deploy-review-reply",
      { workItemId: item.id, userId: params.userId, actorEmail: params.actorEmail || null },
      {
        jobId: `gbp-review-reply-${item.id}-${Date.now()}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 30000 },
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 604800, count: 5000 },
      }
    );
    return (await GbpWorkItemModel.findById(item.id))!;
  }

  static async retryDeployment(params: {
    organizationId: number;
    workItemId: string;
    userId: number | null;
    actorEmail?: string | null;
    accessibleLocationIds?: number[];
  }): Promise<IGbpWorkItem> {
    const item = await this.getScopedWorkItem(params);
    if (item.status !== "draft" || !item.last_error_code) {
      throw new GbpAutomationError("RETRY_NOT_AVAILABLE", "This reply is not ready for retry.");
    }

    const approvedContent = item.approved_content || item.draft_content;
    const safety = GbpContentSafetyService.validateReviewReply(approvedContent);
    await this.approve({ ...params, approvedContent });
    return this.enqueueDeployment({
      ...params,
      confirmedSafetyStatus: safety.status === "needs_review" ? "needs_review" : null,
    });
  }

  static async deployNow(
    workItemId: string,
    userId: number | null,
    options?: { isFinalAttempt?: boolean }
  ): Promise<IGbpWorkItem> {
    return GbpReviewReplyDeploymentService.deployNow(workItemId, userId, options);
  }

  private static async getScopedWorkItem(params: {
    organizationId: number;
    workItemId: string;
    accessibleLocationIds?: number[];
  }): Promise<IGbpWorkItem> {
    const item = await GbpWorkItemModel.findByIdForScope(
      params.workItemId,
      params.organizationId
    );
    if (!item) throw new GbpAutomationError("WORK_ITEM_NOT_FOUND", "Work item not found.");
    ensureLocationAccess(item, params.accessibleLocationIds);
    return item;
  }
}
