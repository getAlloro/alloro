import {
  GbpDeploymentAttemptModel,
  IGbpDeploymentAttempt,
} from "../../../models/GbpDeploymentAttemptModel";
import { GbpWorkItemModel, IGbpWorkItem } from "../../../models/GbpWorkItemModel";
import {
  GbpReviewEscalationModel,
  IGbpReviewEscalation,
} from "../../../models/GbpReviewEscalationModel";
import { IGbpReviewInsight } from "../../../models/GbpReviewInsightModel";
import {
  ReviewModel,
  IReview,
  ReviewMonthBucket,
} from "../../../models/website-builder/ReviewModel";
import { GbpCustomizationService } from "./GbpCustomizationService";
import { GbpAutomationError } from "../feature-utils/GbpAutomationError";
import {
  GbpReadinessResult,
  GbpReadinessService,
} from "./GbpReadinessService";
import { GbpReviewInsightService } from "./GbpReviewInsightService";

export interface GbpReviewWithEngagement extends IReview {
  insight: IGbpReviewInsight | null;
  escalation: IGbpReviewEscalation | null;
}

export interface GbpWorkItemWithAttempts extends IGbpWorkItem {
  attempts: IGbpDeploymentAttempt[];
}

export interface GbpAutomationListResult {
  readiness: GbpReadinessResult;
  settings: unknown;
  workItems: GbpWorkItemWithAttempts[];
  eligibleReviews: GbpReviewWithEngagement[];
  repliedReviews: GbpReviewWithEngagement[];
  reviewMonths: {
    needsReply: ReviewMonthBucket[];
    replied: ReviewMonthBucket[];
  };
}

async function withAttempts(items: IGbpWorkItem[]): Promise<GbpWorkItemWithAttempts[]> {
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      attempts: await GbpDeploymentAttemptModel.listByWorkItem(item.id),
    }))
  );
}

async function withEngagement(
  reviews: IReview[],
  escalationByReviewId: Map<string, IGbpReviewEscalation>,
  insightByReviewId: Map<string, IGbpReviewInsight>
): Promise<GbpReviewWithEngagement[]> {
  return reviews.map((review) => ({
    ...review,
    insight: insightByReviewId.get(review.id) || null,
    escalation: escalationByReviewId.get(review.id) || null,
  }));
}

export class GbpWorkItemService {
  static async listForLocation(
    organizationId: number,
    locationId: number,
    options?: {
      needsReplyMonth?: string | null;
      repliedMonth?: string | null;
    }
  ): Promise<GbpAutomationListResult> {
    const readiness = await GbpReadinessService.getLocationReadiness(
      organizationId,
      locationId
    );
    const settings = await GbpCustomizationService.getOrCreateSettings(
      organizationId,
      locationId
    );
    const workItems = await GbpWorkItemModel.list({
      organizationId,
      locationId,
      limit: 500,
    });
    const [eligibleReviews, repliedReviews, needsReplyMonths, repliedMonths] =
      await Promise.all([
        ReviewModel.findReplyableForLocation(locationId, {
          month: options?.needsReplyMonth || null,
        }),
        ReviewModel.findRepliedForLocation(locationId, {
          month: options?.repliedMonth || null,
        }),
        ReviewModel.listReplyReviewMonths(locationId, false),
        ReviewModel.listReplyReviewMonths(locationId, true),
      ]);
    const combinedReviews = [...eligibleReviews, ...repliedReviews];
    const [insightByReviewId, escalations] = await Promise.all([
      GbpReviewInsightService.ensureForReviews(combinedReviews),
      GbpReviewEscalationModel.findByReviewIds(combinedReviews.map((review) => review.id)),
    ]);
    const escalationByReviewId = new Map(
      escalations.map((escalation) => [escalation.review_id, escalation])
    );

    return {
      readiness,
      settings,
      workItems: await withAttempts(workItems),
      eligibleReviews: await withEngagement(
        eligibleReviews,
        escalationByReviewId,
        insightByReviewId
      ),
      repliedReviews: await withEngagement(
        repliedReviews,
        escalationByReviewId,
        insightByReviewId
      ),
      reviewMonths: {
        needsReply: needsReplyMonths,
        replied: repliedMonths,
      },
    };
  }

  static async getAttempts(params: {
    organizationId: number;
    workItemId: string;
    accessibleLocationIds?: number[];
  }): Promise<IGbpDeploymentAttempt[]> {
    const item = await GbpWorkItemModel.findByIdForScope(
      params.workItemId,
      params.organizationId
    );
    if (!item) {
      throw new GbpAutomationError("WORK_ITEM_NOT_FOUND", "Work item not found.");
    }
    if (
      params.accessibleLocationIds &&
      !params.accessibleLocationIds.includes(item.location_id)
    ) {
      throw new GbpAutomationError("LOCATION_ACCESS_DENIED", "No access to this location.");
    }
    return GbpDeploymentAttemptModel.listByWorkItem(item.id);
  }
}
