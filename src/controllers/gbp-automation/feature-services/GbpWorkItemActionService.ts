import { IGbpWorkItem, GbpWorkItemModel } from "../../../models/GbpWorkItemModel";
import { GbpAutomationError } from "../feature-utils/GbpAutomationError";
import { GbpBusinessInfoDeploymentService } from "./GbpBusinessInfoDeploymentService";
import { GbpLocalPostDeploymentService } from "./GbpLocalPostDeploymentService";
import { GbpLocalPostDraftService } from "./GbpLocalPostDraftService";
import { GbpReviewReplyService } from "./GbpReviewReplyService";

type BaseActionParams = {
  organizationId: number;
  workItemId: string;
  userId: number | null;
  actorEmail?: string | null;
  accessibleLocationIds?: number[];
};

async function findScopedWorkItem(
  params: Pick<BaseActionParams, "organizationId" | "workItemId" | "accessibleLocationIds">
): Promise<IGbpWorkItem> {
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
  return item;
}

export class GbpWorkItemActionService {
  static async updateDraft(
    params: BaseActionParams & {
      draftContent: string;
      featuredImageUrl?: string | null;
    }
  ): Promise<IGbpWorkItem> {
    const item = await findScopedWorkItem(params);
    if (item.content_type === "business_info") {
      throw new GbpAutomationError(
        "UNSUPPORTED_ACTION",
        "Editing a profile update draft is not supported yet; create a new one."
      );
    }
    if (item.content_type === "local_post") {
      return GbpLocalPostDraftService.updateDraft(params);
    }
    return GbpReviewReplyService.updateDraft(params);
  }

  static async approve(
    params: BaseActionParams & {
      approvedContent?: string;
    }
  ): Promise<IGbpWorkItem> {
    const item = await findScopedWorkItem(params);
    if (item.content_type === "business_info") {
      return GbpBusinessInfoDeploymentService.approve(params);
    }
    if (item.content_type === "local_post") {
      return GbpLocalPostDeploymentService.approve(params);
    }
    return GbpReviewReplyService.approve(params);
  }

  static async reject(
    params: BaseActionParams & {
      reason?: string;
    }
  ): Promise<IGbpWorkItem> {
    const item = await findScopedWorkItem(params);
    if (item.content_type === "local_post") {
      return GbpReviewReplyService.reject(params);
    }
    return GbpReviewReplyService.reject(params);
  }

  static async enqueueDeployment(
    params: BaseActionParams & {
      confirmedSafetyStatus?: string | null;
    }
  ): Promise<IGbpWorkItem> {
    const item = await findScopedWorkItem(params);
    if (item.content_type === "business_info") {
      return GbpBusinessInfoDeploymentService.enqueueDeployment(params);
    }
    if (item.content_type === "local_post") {
      return GbpLocalPostDeploymentService.enqueueDeployment(params);
    }
    return GbpReviewReplyService.enqueueDeployment(params);
  }

  static async retryDeployment(params: BaseActionParams): Promise<IGbpWorkItem> {
    const item = await findScopedWorkItem(params);
    if (item.content_type === "business_info") {
      return GbpBusinessInfoDeploymentService.retryDeployment(params);
    }
    if (item.content_type === "local_post") {
      return GbpLocalPostDeploymentService.retryDeployment(params);
    }
    return GbpReviewReplyService.retryDeployment(params);
  }

  static async revertBusinessInfo(params: BaseActionParams): Promise<IGbpWorkItem> {
    const item = await findScopedWorkItem(params);
    if (item.content_type !== "business_info") {
      throw new GbpAutomationError(
        "INVALID_CONTENT_TYPE",
        "Only a profile update can be reverted."
      );
    }
    return GbpBusinessInfoDeploymentService.enqueueRevert(params);
  }
}
