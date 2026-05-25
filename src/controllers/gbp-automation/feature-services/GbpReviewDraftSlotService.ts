import { ReviewModel } from "../../../models/website-builder/ReviewModel";
import { db } from "../../../database/connection";
import { GbpWorkEventModel } from "../../../models/GbpWorkEventModel";
import { GbpWorkItemModel, IGbpWorkItem } from "../../../models/GbpWorkItemModel";
import { GbpAutomationError } from "../feature-utils/GbpAutomationError";
import { GbpContentSafetyService } from "./GbpContentSafetyService";
import { GbpCustomizationService } from "./GbpCustomizationService";
import { GbpReviewReplyService } from "./GbpReviewReplyService";
import { GbpReadinessService } from "./GbpReadinessService";

function actorMetadata(actorEmail?: string | null): Record<string, unknown> {
  return actorEmail ? { actorEmail } : {};
}

export class GbpReviewDraftSlotService {
  static async saveDraftForReview(params: {
    organizationId: number;
    locationId: number;
    reviewId: string;
    draftContent: string;
    userId: number | null;
    actorEmail?: string | null;
    accessibleLocationIds?: number[];
    source?: "admin_review_slot" | "client_review_slot";
  }): Promise<IGbpWorkItem> {
    if (params.accessibleLocationIds && !params.accessibleLocationIds.includes(params.locationId)) {
      throw new GbpAutomationError("LOCATION_ACCESS_DENIED", "No access to this location.");
    }

    const content = params.draftContent.trim();
    const safety = GbpContentSafetyService.validateReviewReply(content);
    if (!safety.isSafe) {
      throw new GbpAutomationError("UNSAFE_REPLY_CONTENT", "Reply content failed safety checks.", {
        reasons: safety.reasons,
      });
    }

    const readiness = await GbpReadinessService.getLocationReadiness(
      params.organizationId,
      params.locationId
    );
    if (!readiness.ready || !readiness.googleProperty) {
      throw new GbpAutomationError("GBP_NOT_READY", "GBP review replies are not ready.", {
        readiness,
      });
    }
    const googleProperty = readiness.googleProperty;

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
    if (existing) {
      return GbpReviewReplyService.updateDraft({
        organizationId: params.organizationId,
        workItemId: existing.id,
        draftContent: content,
        userId: params.userId,
        actorEmail: params.actorEmail,
        accessibleLocationIds: params.accessibleLocationIds,
      });
    }

    const settings = await GbpCustomizationService.getEffectiveSettings(
      params.organizationId,
      params.locationId
    );
    const source = params.source || "admin_review_slot";
    const item = await db.transaction(async (trx) => {
      const created = await GbpWorkItemModel.create({
        organization_id: params.organizationId,
        location_id: params.locationId,
        google_property_id: googleProperty.id,
        content_type: "review_reply",
        source_review_id: review.id,
        status: "draft",
        draft_content: content,
        safety_status: safety.status,
        safety_reason_codes: safety.reasonCodes,
        safety_reasons: safety.reasons,
        safety_confidence: safety.confidence,
        generation_prompt_key: "manual_review_slot",
        generation_input: { reviewId: review.id, source },
        generation_customizations: settings?.review_reply_customizations || null,
        created_by_user_id: params.userId,
        metadata: actorMetadata(params.actorEmail),
      }, trx);

      await GbpWorkEventModel.create({
        work_item_id: created.id,
        actor_user_id: params.userId,
        event_type: "draft_created",
        metadata: {
          reviewId: review.id,
          source,
          ...actorMetadata(params.actorEmail),
        },
      }, trx);

      return created;
    });

    return item;
  }
}
