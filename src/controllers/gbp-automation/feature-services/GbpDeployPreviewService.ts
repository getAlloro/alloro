import { GbpWorkItemModel, IGbpWorkItem } from "../../../models/GbpWorkItemModel";
import { ReviewModel, IReview } from "../../../models/website-builder/ReviewModel";
import { GbpAutomationError } from "../feature-utils/GbpAutomationError";
import { GbpContentSafetyResult, GbpContentSafetyService } from "./GbpContentSafetyService";
import { GbpReadinessResult, GbpReadinessService } from "./GbpReadinessService";

export interface GbpDeployPreview {
  workItem: Pick<IGbpWorkItem, "id" | "status" | "content_type" | "google_property_id">;
  review: Pick<IReview, "id" | "google_review_name" | "reviewer_name" | "stars" | "review_created_at"> | null;
  content: string;
  safety: GbpContentSafetyResult;
  googleProperty: GbpReadinessResult["googleProperty"];
  canDeploy: boolean;
  warnings: string[];
}

export class GbpDeployPreviewService {
  static async build(params: {
    organizationId: number;
    workItemId: string;
    accessibleLocationIds?: number[];
  }): Promise<GbpDeployPreview> {
    const item = await GbpWorkItemModel.findByIdForScope(
      params.workItemId,
      params.organizationId
    );
    if (!item) throw new GbpAutomationError("WORK_ITEM_NOT_FOUND", "Work item not found.");
    if (
      params.accessibleLocationIds &&
      !params.accessibleLocationIds.includes(item.location_id)
    ) {
      throw new GbpAutomationError("LOCATION_ACCESS_DENIED", "No access to this location.");
    }

    const readiness = await GbpReadinessService.getLocationReadiness(
      params.organizationId,
      item.location_id
    );
    const review = item.source_review_id
      ? await ReviewModel.findById(item.source_review_id)
      : null;
    const content = (item.approved_content || item.draft_content || "").trim();
    const safety = GbpContentSafetyService.validateReviewReply(content);
    const warnings: string[] = [];

    if (item.status !== "approved") warnings.push("Draft must be saved and approved before deploy.");
    if (!readiness.ready || !readiness.googleProperty) warnings.push("GBP readiness is not complete.");
    if (!safety.isSafe) warnings.push("Reply content is blocked by safety checks.");
    if (safety.status === "needs_review") warnings.push("Safety review required before deploy.");

    const preview: GbpDeployPreview = {
      workItem: {
        id: item.id,
        status: item.status,
        content_type: item.content_type,
        google_property_id: item.google_property_id,
      },
      review: review
        ? {
            id: review.id,
            google_review_name: review.google_review_name,
            reviewer_name: review.reviewer_name,
            stars: review.stars,
            review_created_at: review.review_created_at,
          }
        : null,
      content,
      safety,
      googleProperty: readiness.googleProperty,
      canDeploy: warnings.every((warning) => warning === "Safety review required before deploy."),
      warnings,
    };

    await GbpWorkItemModel.updateDeployPreview(item.id, preview as unknown as Record<string, unknown>);
    return preview;
  }
}
