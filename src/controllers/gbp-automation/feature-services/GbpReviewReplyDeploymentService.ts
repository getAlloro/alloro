import { getValidOAuth2ClientByConnection } from "../../../auth/oauth2Helper";
import { GooglePropertyModel } from "../../../models/GooglePropertyModel";
import { GbpDeploymentAttemptModel } from "../../../models/GbpDeploymentAttemptModel";
import { GbpWorkItemModel, IGbpWorkItem } from "../../../models/GbpWorkItemModel";
import { ReviewModel } from "../../../models/website-builder/ReviewModel";
import { replyToGbpReview } from "../../gbp/gbp-services/gbp-write.service";
import { GbpAutomationError } from "../feature-utils/GbpAutomationError";
import { isTransientGoogleError } from "../feature-utils/googleApiErrors";
import { GbpContentSafetyService } from "./GbpContentSafetyService";
import { GbpNotificationService } from "./GbpNotificationService";
import { GbpReadinessService } from "./GbpReadinessService";
import {
  OrganizationArchivedError,
  OrganizationLifecycleService,
} from "../../../services/OrganizationLifecycleService";

function deploymentContent(item: IGbpWorkItem): string {
  return (item.approved_content || item.draft_content || "").trim();
}

export class GbpReviewReplyDeploymentService {
  static async deployNow(
    workItemId: string,
    userId: number | null,
    options?: { isFinalAttempt?: boolean }
  ): Promise<IGbpWorkItem> {
    const item = await GbpWorkItemModel.findById(workItemId);
    if (!item) throw new GbpAutomationError("WORK_ITEM_NOT_FOUND", "Work item not found.");
    if (item.status !== "deploying") {
      throw new GbpAutomationError("INVALID_STATUS", "This reply is not queued for deployment.");
    }
    try {
      await OrganizationLifecycleService.assertActive(item.organization_id);
    } catch (error) {
      if (!(error instanceof OrganizationArchivedError)) throw error;
      throw new GbpAutomationError(
        "ORGANIZATION_ARCHIVED",
        "Archived organizations cannot deploy GBP review replies."
      );
    }

    const content = deploymentContent(item);
    const attempt = await GbpDeploymentAttemptModel.createRunningNext({
      work_item_id: item.id,
      requested_by_user_id: userId,
      request_payload: { content, sourceReviewId: item.source_review_id },
    });
    if (!attempt) return item;

    let googleResult: { resourceName: string | null; response: Record<string, unknown> } | null =
      null;

    try {
      const readiness = await GbpReadinessService.getLocationReadiness(
        item.organization_id,
        item.location_id
      );
      if (!readiness.ready || !readiness.googleProperty) {
        throw new GbpAutomationError("GBP_NOT_READY", "GBP review replies are not ready.", {
          readiness,
        });
      }

      const review = item.source_review_id
        ? await ReviewModel.findById(item.source_review_id)
        : undefined;
      if (!review?.google_review_name) {
        throw new GbpAutomationError("REVIEW_NOT_REPLYABLE", "Review is not replyable.");
      }

      const safety = GbpContentSafetyService.validateReviewReply(content);
      if (!safety.isSafe) {
        throw new GbpAutomationError("UNSAFE_REPLY_CONTENT", "Reply content failed safety checks.", {
          reasons: safety.reasons,
        });
      }

      const property = await GooglePropertyModel.findById(item.google_property_id);
      if (!property) throw new GbpAutomationError("GBP_PROPERTY_MISSING", "GBP property missing.");

      const auth = await getValidOAuth2ClientByConnection(property.google_connection_id);
      googleResult = await replyToGbpReview(auth, review.google_review_name, content);
      const markedPublished = await GbpWorkItemModel.markPublished(item.id, {
        publishedContent: content,
        googleResourceName: googleResult.resourceName,
        googleResponse: googleResult.response,
      });
      if (markedPublished === 0) {
        throw new GbpAutomationError("INVALID_STATUS", "This reply deployment was already finalized.");
      }
      await GbpDeploymentAttemptModel.markSucceeded(attempt.id, googleResult.response);
      await ReviewModel.updateReplyFields(review.id, content, new Date());
      await GbpNotificationService.create({
        organizationId: item.organization_id,
        locationId: item.location_id,
        workItemId: item.id,
        kind: "gbp_reply_published",
        title: "GBP reply published",
        message: "A Google review reply was published from Alloro.",
      });
      return (await GbpWorkItemModel.findById(item.id))!;
    } catch (error) {
      const err = error as { code?: string; message?: string; details?: unknown };
      if (googleResult) {
        await GbpDeploymentAttemptModel.markSucceeded(attempt.id, googleResult.response);
        await GbpWorkItemModel.updateById(item.id, {
          status: "published",
          published_content: content,
          google_resource_name: googleResult.resourceName,
          google_response: googleResult.response,
          published_at: new Date(),
          last_error_code: err.code || "LOCAL_PUBLISH_SYNC_FAILED",
          last_error_message:
            "Google published this reply, but Alloro could not finish local sync.",
        });
        return (await GbpWorkItemModel.findById(item.id))!;
      }

      await GbpDeploymentAttemptModel.markFailed(
        attempt.id,
        err.code || "DEPLOY_FAILED",
        err.message || "Deployment failed.",
        err.details ? { details: err.details as Record<string, unknown> } : null
      );
      if (isTransientGoogleError(error) && options?.isFinalAttempt === false) {
        throw error;
      }

      await GbpWorkItemModel.markFailedToDraft(
        item.id,
        err.code || "DEPLOY_FAILED",
        err.message || "Deployment failed."
      );
      await GbpNotificationService.create({
        organizationId: item.organization_id,
        locationId: item.location_id,
        workItemId: item.id,
        kind: "gbp_reply_deploy_failed",
        title: "GBP reply deployment failed",
        message: err.message || "A Google review reply failed to publish and returned to draft.",
      }).catch(() => undefined);
      return (await GbpWorkItemModel.findById(item.id))!;
    }
  }
}
