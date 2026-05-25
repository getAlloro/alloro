import {
  GbpReviewEscalationModel,
  GbpReviewEscalationStatus,
  IGbpReviewEscalation,
} from "../../../models/GbpReviewEscalationModel";
import { ReviewModel } from "../../../models/website-builder/ReviewModel";
import { GbpAutomationError } from "../feature-utils/GbpAutomationError";

export class GbpReviewEscalationService {
  static async update(params: {
    organizationId: number;
    locationId: number;
    reviewId: string;
    status: GbpReviewEscalationStatus;
    reason: string;
    note?: string | null;
    actorUserId: number | null;
    accessibleLocationIds?: number[];
  }): Promise<IGbpReviewEscalation> {
    if (
      params.accessibleLocationIds &&
      !params.accessibleLocationIds.includes(params.locationId)
    ) {
      throw new GbpAutomationError("LOCATION_ACCESS_DENIED", "No access to this location.");
    }

    const review = await ReviewModel.findById(params.reviewId);
    if (!review || review.location_id !== params.locationId) {
      throw new GbpAutomationError("REVIEW_NOT_FOUND", "Review not found for this location.");
    }

    return GbpReviewEscalationModel.upsertForReview({
      reviewId: params.reviewId,
      organizationId: params.organizationId,
      locationId: params.locationId,
      status: params.status,
      reason: params.reason,
      note: params.note || null,
      actorUserId: params.actorUserId,
    });
  }
}
