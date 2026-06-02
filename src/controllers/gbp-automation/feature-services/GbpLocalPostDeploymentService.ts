import { getValidOAuth2ClientByConnection } from "../../../auth/oauth2Helper";
import { db } from "../../../database/connection";
import { GooglePropertyModel } from "../../../models/GooglePropertyModel";
import { GbpDeploymentAttemptModel } from "../../../models/GbpDeploymentAttemptModel";
import { GbpWorkEventModel } from "../../../models/GbpWorkEventModel";
import { GbpWorkItemModel, IGbpWorkItem } from "../../../models/GbpWorkItemModel";
import { getGbpAutomationQueue } from "../../../workers/queues";
import {
  createGbpLocalPost,
  GbpLocalPostPayload,
} from "../../gbp/gbp-services/gbp-write.service";
import { GbpAutomationError } from "../feature-utils/GbpAutomationError";
import { isTransientGoogleError } from "../feature-utils/googleApiErrors";
import { GbpLocalPostSafetyService } from "./GbpLocalPostSafetyService";
import { GbpNotificationService } from "./GbpNotificationService";
import { GbpReadinessService } from "./GbpReadinessService";
import {
  OrganizationArchivedError,
  OrganizationLifecycleService,
} from "../../../services/OrganizationLifecycleService";

function deploymentContent(item: IGbpWorkItem): string {
  return (item.approved_content || item.draft_content || "").trim();
}

function googleLocationParent(property: {
  account_id: string | null;
  external_id: string | null;
}): string {
  if (!property.account_id || !property.external_id) {
    throw new GbpAutomationError(
      "GBP_PROPERTY_MISSING",
      "GBP property is missing its Google account or location id."
    );
  }
  return `accounts/${property.account_id}/locations/${property.external_id}`;
}

function buildPayload(item: IGbpWorkItem, content: string): GbpLocalPostPayload {
  if (!item.featured_image_url) {
    throw new GbpAutomationError(
      "GBP_POST_IMAGE_REQUIRED",
      "Upload a post image before publishing a GBP post."
    );
  }
  return {
    topicType: "STANDARD",
    summary: content,
    media: [
      {
        mediaFormat: "PHOTO",
        sourceUrl: item.featured_image_url,
      },
    ],
  };
}

function responseResourceName(response: Record<string, unknown>): string | null {
  return typeof response.name === "string" ? response.name : null;
}

export class GbpLocalPostDeploymentService {
  static async approve(params: {
    organizationId: number;
    workItemId: string;
    userId: number | null;
    actorEmail?: string | null;
    approvedContent?: string;
    accessibleLocationIds?: number[];
  }): Promise<IGbpWorkItem> {
    const item = await this.getScopedLocalPost(params);
    const content = (params.approvedContent || item.draft_content).trim();
    const safety = GbpLocalPostSafetyService.validateLocalPost(
      content,
      item.featured_image_url
    );
    if (!safety.isSafe) {
      throw new GbpAutomationError("UNSAFE_POST_CONTENT", "Post content failed safety checks.", {
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
        throw new GbpAutomationError("INVALID_STATUS", "This post cannot be approved now.");
      }
      await GbpWorkEventModel.create({
        work_item_id: item.id,
        actor_user_id: params.userId,
        event_type: "local_post_approved",
        metadata: {
          byteLength: safety.byteLength,
          safetyStatus: safety.status,
          safetyReasonCodes: safety.reasonCodes,
          actorEmail: params.actorEmail || null,
        },
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
    const item = await this.getScopedLocalPost(params);
    if (item.status !== "approved") {
      throw new GbpAutomationError("APPROVAL_REQUIRED", "Approve the post before deployment.");
    }
    const content = item.approved_content || item.draft_content;
    const safety = GbpLocalPostSafetyService.validateLocalPost(
      content,
      item.featured_image_url
    );
    if (!safety.isSafe) {
      throw new GbpAutomationError("UNSAFE_POST_CONTENT", "Post content failed safety checks.", {
        reasons: safety.reasons,
        reasonCodes: safety.reasonCodes,
      });
    }
    if (safety.status === "needs_review" && params.confirmedSafetyStatus !== "needs_review") {
      throw new GbpAutomationError(
        "DEPLOY_PREVIEW_REQUIRED",
        "Review the deploy preview before publishing this post.",
        { safety }
      );
    }

    await db.transaction(async (trx) => {
      const marked = await GbpWorkItemModel.markDeploying(item.id, params.userId, trx);
      if (marked === 0) {
        throw new GbpAutomationError("INVALID_STATUS", "This post is already deploying.");
      }
      await GbpWorkEventModel.create({
        work_item_id: item.id,
        actor_user_id: params.userId,
        event_type: "local_post_deployment_queued",
        metadata: {
          safetyStatus: safety.status,
          safetyReasonCodes: safety.reasonCodes,
          actorEmail: params.actorEmail || null,
        },
      }, trx);
    });
    await getGbpAutomationQueue("deployment").add(
      "deploy-local-post",
      { workItemId: item.id, userId: params.userId, actorEmail: params.actorEmail || null },
      {
        jobId: `gbp-local-post-${item.id}-${Date.now()}`,
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
    const item = await this.getScopedLocalPost(params);
    if (item.status !== "draft" || !item.last_error_code) {
      throw new GbpAutomationError("RETRY_NOT_AVAILABLE", "This post is not ready for retry.");
    }
    const approvedContent = item.approved_content || item.draft_content;
    const safety = GbpLocalPostSafetyService.validateLocalPost(
      approvedContent,
      item.featured_image_url
    );
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
    const item = await GbpWorkItemModel.findById(workItemId);
    if (!item) throw new GbpAutomationError("WORK_ITEM_NOT_FOUND", "Work item not found.");
    if (item.content_type !== "local_post") {
      throw new GbpAutomationError("INVALID_CONTENT_TYPE", "This work item is not a GBP post.");
    }
    if (item.status !== "deploying") {
      throw new GbpAutomationError("INVALID_STATUS", "This post is not queued for deployment.");
    }
    try {
      await OrganizationLifecycleService.assertActive(item.organization_id);
    } catch (error) {
      if (!(error instanceof OrganizationArchivedError)) throw error;
      throw new GbpAutomationError(
        "ORGANIZATION_ARCHIVED",
        "Archived organizations cannot deploy GBP posts."
      );
    }

    const content = deploymentContent(item);
    const payload = buildPayload(item, content);
    const attempt = await GbpDeploymentAttemptModel.createRunningNext({
      work_item_id: item.id,
      requested_by_user_id: userId,
      request_payload: {
        content,
        featuredImageUrl: item.featured_image_url,
        sourceReviewId: item.source_review_id,
      },
    });
    if (!attempt) return item;

    let googleResult: Record<string, unknown> | null = null;

    try {
      const readiness = await GbpReadinessService.getLocationReadiness(
        item.organization_id,
        item.location_id
      );
      const isGoogleReady =
        readiness.googleProperty &&
        readiness.checks.hasGoogleConnection &&
        readiness.checks.hasRefreshToken &&
        readiness.checks.hasBusinessManageScope &&
        readiness.checks.hasAccountId &&
        readiness.checks.hasExternalId;
      if (!isGoogleReady) {
        throw new GbpAutomationError("GBP_NOT_READY", "GBP posting is not ready.", {
          readiness,
        });
      }

      const safety = GbpLocalPostSafetyService.validateLocalPost(
        content,
        item.featured_image_url
      );
      if (!safety.isSafe) {
        throw new GbpAutomationError("UNSAFE_POST_CONTENT", "Post content failed safety checks.", {
          reasons: safety.reasons,
        });
      }

      const property = await GooglePropertyModel.findById(item.google_property_id);
      if (!property) throw new GbpAutomationError("GBP_PROPERTY_MISSING", "GBP property missing.");

      const auth = await getValidOAuth2ClientByConnection(property.google_connection_id);
      googleResult = await createGbpLocalPost(auth, googleLocationParent(property), payload);

      const markedPublished = await GbpWorkItemModel.markPublished(item.id, {
        publishedContent: content,
        googleResourceName: responseResourceName(googleResult),
        googleResponse: googleResult,
      });
      if (markedPublished === 0) {
        throw new GbpAutomationError("INVALID_STATUS", "This post deployment was already finalized.");
      }
      await GbpDeploymentAttemptModel.markSucceeded(attempt.id, googleResult);
      await GbpWorkEventModel.create({
        work_item_id: item.id,
        actor_user_id: userId,
        event_type: "local_post_published",
        metadata: { googleResourceName: responseResourceName(googleResult) },
      });
      await GbpNotificationService.create({
        organizationId: item.organization_id,
        locationId: item.location_id,
        workItemId: item.id,
        kind: "gbp_post_published",
        title: "GBP post published",
        message: "A Google Business Profile post was published from Alloro.",
      });
      return (await GbpWorkItemModel.findById(item.id))!;
    } catch (error) {
      const err = error as { code?: string; message?: string; details?: unknown };
      if (googleResult) {
        await GbpDeploymentAttemptModel.markSucceeded(attempt.id, googleResult);
        await GbpWorkItemModel.updateById(item.id, {
          status: "published",
          published_content: content,
          google_resource_name: responseResourceName(googleResult),
          google_response: googleResult,
          published_at: new Date(),
          last_error_code: err.code || "LOCAL_PUBLISH_SYNC_FAILED",
          last_error_message:
            "Google published this post, but Alloro could not finish local sync.",
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
        kind: "gbp_post_deploy_failed",
        title: "GBP post deployment failed",
        message: err.message || "A GBP post failed to publish and returned to draft.",
      }).catch(() => undefined);
      return (await GbpWorkItemModel.findById(item.id))!;
    }
  }

  private static async getScopedLocalPost(params: {
    organizationId: number;
    workItemId: string;
    accessibleLocationIds?: number[];
  }): Promise<IGbpWorkItem> {
    const item = await GbpWorkItemModel.findByIdForScope(
      params.workItemId,
      params.organizationId
    );
    if (!item) throw new GbpAutomationError("WORK_ITEM_NOT_FOUND", "Work item not found.");
    try {
      await OrganizationLifecycleService.assertActive(params.organizationId);
    } catch (error) {
      if (!(error instanceof OrganizationArchivedError)) throw error;
      throw new GbpAutomationError(
        "ORGANIZATION_ARCHIVED",
        "Archived organizations cannot manage GBP posts."
      );
    }
    if (
      params.accessibleLocationIds &&
      !params.accessibleLocationIds.includes(item.location_id)
    ) {
      throw new GbpAutomationError("LOCATION_ACCESS_DENIED", "No access to this location.");
    }
    if (item.content_type !== "local_post") {
      throw new GbpAutomationError("INVALID_CONTENT_TYPE", "This work item is not a GBP post.");
    }
    return item;
  }
}
