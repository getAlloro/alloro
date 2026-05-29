import { getValidOAuth2ClientByConnection } from "../../../auth/oauth2Helper";
import { GooglePropertyModel } from "../../../models/GooglePropertyModel";
import { LocationModel } from "../../../models/LocationModel";
import { IReview, ReviewModel } from "../../../models/website-builder/ReviewModel";
import {
  deleteGbpReviewReply,
  replyToGbpReview,
} from "../../gbp/gbp-services/gbp-write.service";
import { GbpAutomationError } from "../feature-utils/GbpAutomationError";
import { GbpContentSafetyService } from "./GbpContentSafetyService";

async function getEditableReview(
  organizationId: number,
  locationId: number,
  reviewId: string,
  accessibleLocationIds?: number[]
): Promise<IReview> {
  if (accessibleLocationIds && !accessibleLocationIds.includes(locationId)) {
    throw new GbpAutomationError("LOCATION_ACCESS_DENIED", "No access to this location.");
  }

  const location = await LocationModel.findById(locationId);
  if (!location || location.organization_id !== organizationId) {
    throw new GbpAutomationError("LOCATION_NOT_FOUND", "Location not found for this organization.");
  }

  const review = await ReviewModel.findById(reviewId);
  if (!review || review.location_id !== locationId) {
    throw new GbpAutomationError("REVIEW_NOT_FOUND", "Review not found for this location.");
  }
  if (review.source !== "oauth" || !review.google_review_name || !review.has_reply) {
    throw new GbpAutomationError(
      "REVIEW_REPLY_NOT_EDITABLE",
      "Only replied OAuth GBP reviews can be edited."
    );
  }

  const property = await GooglePropertyModel.findSelectedGbpByLocationId(locationId);
  if (!property) {
    throw new GbpAutomationError("GBP_PROPERTY_MISSING", "Selected GBP property missing.");
  }

  const googleConnection = property.google_connection_id;
  if (!googleConnection) {
    throw new GbpAutomationError("GBP_CONNECTION_MISSING", "GBP connection missing.");
  }

  return review;
}

async function getAuthForLocation(locationId: number) {
  const property = await GooglePropertyModel.findSelectedGbpByLocationId(locationId);
  if (!property) {
    throw new GbpAutomationError("GBP_PROPERTY_MISSING", "Selected GBP property missing.");
  }
  return getValidOAuth2ClientByConnection(property.google_connection_id);
}

export class GbpPublishedReplyService {
  static async updateReply(params: {
    organizationId: number;
    locationId: number;
    reviewId: string;
    replyContent: string;
    accessibleLocationIds?: number[];
  }): Promise<IReview> {
    const content = params.replyContent.trim();
    const safety = GbpContentSafetyService.validateReviewReply(content);
    if (!safety.isSafe) {
      throw new GbpAutomationError("UNSAFE_REPLY_CONTENT", "Reply content failed safety checks.", {
        reasons: safety.reasons,
      });
    }

    const review = await getEditableReview(
      params.organizationId,
      params.locationId,
      params.reviewId,
      params.accessibleLocationIds
    );
    const auth = await getAuthForLocation(params.locationId);
    await replyToGbpReview(auth, review.google_review_name!, content);
    await ReviewModel.updateReplyFields(review.id, content, new Date());

    return (await ReviewModel.findById(review.id))!;
  }

  static async deleteReply(params: {
    organizationId: number;
    locationId: number;
    reviewId: string;
    accessibleLocationIds?: number[];
  }): Promise<IReview> {
    const review = await getEditableReview(
      params.organizationId,
      params.locationId,
      params.reviewId,
      params.accessibleLocationIds
    );
    const auth = await getAuthForLocation(params.locationId);
    await deleteGbpReviewReply(auth, review.google_review_name!);
    await ReviewModel.clearReplyFields(review.id);

    return (await ReviewModel.findById(review.id))!;
  }
}
