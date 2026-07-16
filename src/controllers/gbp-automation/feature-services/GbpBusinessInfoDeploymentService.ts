import { getValidOAuth2ClientByConnection } from "../../../auth/oauth2Helper";
import { db } from "../../../database/connection";
import logger from "../../../lib/logger";
import { GooglePropertyModel, IGoogleProperty } from "../../../models/GooglePropertyModel";
import { GbpAutomationSettingsModel } from "../../../models/GbpAutomationSettingsModel";
import { GbpDeploymentAttemptModel } from "../../../models/GbpDeploymentAttemptModel";
import { GbpWorkEventModel } from "../../../models/GbpWorkEventModel";
import { GbpWorkItemModel, IGbpWorkItem } from "../../../models/GbpWorkItemModel";
import { getGbpAutomationQueue } from "../../../workers/queues";
import { getLocationProfileForRanking } from "../../gbp/gbp-services/location-handler.service";
import { patchGbpBusinessInformation } from "../../gbp/gbp-services/gbp-write.service";
import { GbpAutomationError } from "../feature-utils/GbpAutomationError";
import { isTransientGoogleError } from "../feature-utils/googleApiErrors";
import {
  BusinessInfoPatch,
  BusinessInfoPayload,
  extractMaskedFields,
  mergePatchOverSnapshot,
} from "../feature-utils/gbpBusinessInfo";
import { GbpNotificationService } from "./GbpNotificationService";
import { GbpReadinessService } from "./GbpReadinessService";
import {
  OrganizationArchivedError,
  OrganizationLifecycleService,
} from "../../../services/OrganizationLifecycleService";

type ScopedParams = {
  organizationId: number;
  workItemId: string;
  userId: number | null;
  actorEmail?: string | null;
  accessibleLocationIds?: number[];
};

/** The Business Information API v1 addresses the location as `locations/{locationId}`. */
function businessInfoLocationName(property: IGoogleProperty): string {
  if (!property.external_id) {
    throw new GbpAutomationError(
      "GBP_PROPERTY_MISSING",
      "GBP property is missing its Google location id."
    );
  }
  return `locations/${property.external_id}`;
}

function readPayload(item: IGbpWorkItem): BusinessInfoPayload {
  const payload = item.business_info_payload as BusinessInfoPayload | null;
  if (!payload || !payload.patch || !Array.isArray(payload.updateMask)) {
    throw new GbpAutomationError(
      "BUSINESS_INFO_PAYLOAD_MISSING",
      "This profile update is missing its field payload."
    );
  }
  return payload;
}

/** The Google-write readiness subset — identical to the local-post deploy gate. */
export function assertGoogleReady(readiness: {
  googleProperty: unknown;
  checks: {
    hasGoogleConnection: boolean;
    hasRefreshToken: boolean;
    hasBusinessManageScope: boolean;
    hasAccountId: boolean;
    hasExternalId: boolean;
  };
}): void {
  const isGoogleReady =
    readiness.googleProperty &&
    readiness.checks.hasGoogleConnection &&
    readiness.checks.hasRefreshToken &&
    readiness.checks.hasBusinessManageScope &&
    readiness.checks.hasAccountId &&
    readiness.checks.hasExternalId;
  if (!isGoogleReady) {
    throw new GbpAutomationError("GBP_NOT_READY", "GBP write-back is not ready.", {
      readiness,
    });
  }
}

/** Master switch — re-enforced server-side on every gate (§5.4). Seeded DISABLED. */
export async function assertWritebackEnabled(
  organizationId: number,
  locationId: number
): Promise<void> {
  const settings = await GbpAutomationSettingsModel.findEffectiveForLocation(
    organizationId,
    locationId
  );
  if (!settings?.business_info_writeback_enabled) {
    throw new GbpAutomationError(
      "BUSINESS_INFO_WRITEBACK_DISABLED",
      "Google profile write-back is turned off for this location."
    );
  }
}

export class GbpBusinessInfoDeploymentService {
  static async approve(params: ScopedParams): Promise<IGbpWorkItem> {
    const item = await this.getScopedItem(params);
    await assertWritebackEnabled(item.organization_id, item.location_id);
    const content = item.draft_content;

    await db.transaction(async (trx) => {
      const approved = await GbpWorkItemModel.approve(item.id, params.userId, content, undefined, trx);
      if (approved === 0) {
        throw new GbpAutomationError("INVALID_STATUS", "This profile update cannot be approved now.");
      }
      await GbpWorkEventModel.create(
        {
          work_item_id: item.id,
          actor_user_id: params.userId,
          event_type: "business_info_approved",
          metadata: { actorEmail: params.actorEmail || null },
        },
        trx
      );
    });
    return (await GbpWorkItemModel.findById(item.id))!;
  }

  static async reject(params: ScopedParams & { reason?: string }): Promise<IGbpWorkItem> {
    const item = await this.getScopedItem(params);
    // §10.5 — status flip + audit event are two tables and one fact; the guarded
    // reject also throws INSIDE the transaction, so a lost race rolls back
    // cleanly instead of recording a rejection event that never happened.
    await db.transaction(async (trx) => {
      const rejected = await GbpWorkItemModel.rejectBusinessInfoIfPending(
        item.id,
        params.userId,
        params.reason || null,
        trx
      );
      if (rejected === 0) {
        throw new GbpAutomationError(
          "REJECT_NOT_AVAILABLE",
          "A published or deploying profile update cannot be rejected; revert it instead."
        );
      }
      await GbpWorkEventModel.create(
        {
          work_item_id: item.id,
          actor_user_id: params.userId,
          event_type: "business_info_rejected",
          metadata: { reason: params.reason || null, actorEmail: params.actorEmail || null },
        },
        trx
      );
    });
    return (await GbpWorkItemModel.findById(item.id))!;
  }

  static async enqueueDeployment(params: ScopedParams): Promise<IGbpWorkItem> {
    const item = await this.getScopedItem(params);
    if (item.status !== "approved") {
      throw new GbpAutomationError(
        "APPROVAL_REQUIRED",
        "Approve the profile update before deployment."
      );
    }
    await assertWritebackEnabled(item.organization_id, item.location_id);

    await db.transaction(async (trx) => {
      const marked = await GbpWorkItemModel.markDeploying(item.id, params.userId, trx);
      if (marked === 0) {
        throw new GbpAutomationError("INVALID_STATUS", "This profile update is already deploying.");
      }
      await GbpWorkEventModel.create(
        {
          work_item_id: item.id,
          actor_user_id: params.userId,
          event_type: "business_info_deployment_queued",
          metadata: { actorEmail: params.actorEmail || null },
        },
        trx
      );
    });
    try {
      await getGbpAutomationQueue("deployment").add(
        "deploy-business-info",
        { workItemId: item.id, userId: params.userId, actorEmail: params.actorEmail || null },
        {
          jobId: `gbp-business-info-${item.id}-${Date.now()}`,
          attempts: 3,
          backoff: { type: "exponential", delay: 30000 },
          removeOnComplete: { age: 86400, count: 1000 },
          removeOnFail: { age: 604800, count: 5000 },
        }
      );
    } catch (enqueueError) {
      // Compensate: the item was marked `deploying` but no job exists, so nothing
      // would ever pick it up. Restore the retryable failed-draft state (status
      // `draft` + last_error_code, the exact gate retryDeployment checks) so the
      // item is never stranded. Compensation is best-effort — the caller always
      // sees the failure either way.
      logger.error(
        { err: enqueueError, workItemId: item.id },
        "[GBP] business-info deployment enqueue failed; returning item to draft"
      );
      await GbpWorkItemModel.markFailedToDraft(
        item.id,
        "DEPLOY_ENQUEUE_FAILED",
        "The deployment could not be queued."
      ).catch((compensationError) => {
        logger.error(
          { err: compensationError, workItemId: item.id },
          "[GBP] business-info enqueue compensation failed"
        );
      });
      // §3.2 — the audit event is best-effort (the typed queue error below is
      // what the caller must see), but a failure here is never silent: losing the
      // compensation trail is exactly what an operator needs to know about.
      const deployEnqueueFailedEvent = "business_info_deploy_enqueue_failed";
      await GbpWorkEventModel.create({
        work_item_id: item.id,
        actor_user_id: params.userId,
        event_type: deployEnqueueFailedEvent,
        metadata: { actorEmail: params.actorEmail || null },
      }).catch((eventError) => {
        logger.error(
          { err: eventError, workItemId: item.id, eventType: deployEnqueueFailedEvent },
          "[GBP] business-info compensation event write failed"
        );
      });
      throw new GbpAutomationError(
        "DEPLOY_QUEUE_TRANSIENT_FAILURE",
        "The deployment could not be queued; the update was returned to draft. Retry in a moment."
      );
    }
    return (await GbpWorkItemModel.findById(item.id))!;
  }

  static async retryDeployment(params: ScopedParams): Promise<IGbpWorkItem> {
    const item = await this.getScopedItem(params);
    if (item.status !== "draft" || !item.last_error_code) {
      throw new GbpAutomationError("RETRY_NOT_AVAILABLE", "This profile update is not ready for retry.");
    }
    await this.approve(params);
    return this.enqueueDeployment(params);
  }

  static async enqueueRevert(params: ScopedParams): Promise<IGbpWorkItem> {
    const item = await this.getScopedItem(params);
    if (item.status !== "published") {
      throw new GbpAutomationError(
        "REVERT_NOT_AVAILABLE",
        "Only a published profile update can be reverted."
      );
    }
    const payload = readPayload(item);
    if (!payload.previousValues) {
      throw new GbpAutomationError(
        "NO_ROLLBACK_SNAPSHOT",
        "No rollback snapshot exists for this profile update."
      );
    }
    await assertWritebackEnabled(item.organization_id, item.location_id);

    // Single-flight: atomically claim the revert so N clicks/retries enqueue ONE job.
    const claimed = await GbpWorkItemModel.claimBusinessInfoRevert(item.id);
    if (claimed === 0) {
      throw new GbpAutomationError(
        "REVERT_IN_PROGRESS",
        "A revert for this profile update is already in progress or was already applied."
      );
    }
    try {
      await getGbpAutomationQueue("deployment").add(
        "revert-business-info",
        { workItemId: item.id, userId: params.userId, actorEmail: params.actorEmail || null },
        {
          jobId: `gbp-business-info-revert-${item.id}-${Date.now()}`,
          attempts: 3,
          backoff: { type: "exponential", delay: 30000 },
          removeOnComplete: { age: 86400, count: 1000 },
          removeOnFail: { age: 604800, count: 5000 },
        }
      );
    } catch (enqueueError) {
      // Compensate: the single-flight claim was taken but no job exists, so no
      // future revert attempt could ever win the claim. Release it so the owner
      // can retry. Best-effort — the caller always sees the failure either way.
      logger.error(
        { err: enqueueError, workItemId: item.id },
        "[GBP] business-info revert enqueue failed; releasing revert claim"
      );
      await GbpWorkItemModel.releaseBusinessInfoRevertClaim(item.id).catch(
        (compensationError) => {
          logger.error(
            { err: compensationError, workItemId: item.id },
            "[GBP] business-info revert-claim release failed"
          );
        }
      );
      // §3.2 — best-effort, but never silent (see the deploy path above).
      const revertEnqueueFailedEvent = "business_info_revert_enqueue_failed";
      await GbpWorkEventModel.create({
        work_item_id: item.id,
        actor_user_id: params.userId,
        event_type: revertEnqueueFailedEvent,
        metadata: { actorEmail: params.actorEmail || null },
      }).catch((eventError) => {
        logger.error(
          { err: eventError, workItemId: item.id, eventType: revertEnqueueFailedEvent },
          "[GBP] business-info compensation event write failed"
        );
      });
      throw new GbpAutomationError(
        "REVERT_QUEUE_TRANSIENT_FAILURE",
        "The revert could not be queued. Try again in a moment."
      );
    }
    return (await GbpWorkItemModel.findById(item.id))!;
  }

  static async deployNow(
    workItemId: string,
    userId: number | null,
    options?: { isFinalAttempt?: boolean }
  ): Promise<IGbpWorkItem> {
    const item = await GbpWorkItemModel.findById(workItemId);
    if (!item) throw new GbpAutomationError("WORK_ITEM_NOT_FOUND", "Work item not found.");
    if (item.content_type !== "business_info") {
      throw new GbpAutomationError("INVALID_CONTENT_TYPE", "This work item is not a profile update.");
    }
    if (item.status !== "deploying") {
      throw new GbpAutomationError("INVALID_STATUS", "This profile update is not queued for deployment.");
    }
    await this.assertOrganizationActive(item.organization_id);

    const payload = readPayload(item);
    const attempt = await GbpDeploymentAttemptModel.createRunningNext({
      work_item_id: item.id,
      requested_by_user_id: userId,
      request_payload: { updateMask: payload.updateMask },
    });
    if (!attempt) return item;

    let googleResult: Record<string, unknown> | null = null;

    try {
      // Re-enforce the gates server-side at write time.
      const readiness = await GbpReadinessService.getLocationReadiness(
        item.organization_id,
        item.location_id
      );
      assertGoogleReady(readiness);
      await assertWritebackEnabled(item.organization_id, item.location_id);

      const property = await GooglePropertyModel.findById(item.google_property_id);
      if (!property) throw new GbpAutomationError("GBP_PROPERTY_MISSING", "GBP property missing.");

      const auth = await getValidOAuth2ClientByConnection(property.google_connection_id);

      // Capture-before-write (capture-ONCE): read the live values as the rollback
      // snapshot only if a prior attempt has not already captured them. On a retry
      // after an ambiguous write (patch applied on Google but the response was lost),
      // re-reading would capture Google's ALREADY-changed state and clobber the true
      // original — so we never recapture. If the read fails there is no rollback point,
      // so the write does NOT proceed.
      let previousValues = (payload.previousValues ?? null) as BusinessInfoPatch | null;
      if (!previousValues) {
        const profile = await getLocationProfileForRanking(
          auth,
          property.account_id || "",
          property.external_id || ""
        );
        if (!profile) {
          throw new GbpAutomationError(
            "SNAPSHOT_FAILED",
            "Could not read the current profile to make a rollback point; the update was not sent."
          );
        }
        previousValues = extractMaskedFields(profile as Record<string, unknown>, payload.updateMask);
        await GbpWorkItemModel.updateById(item.id, {
          business_info_payload: { ...payload, previousValues },
        });
      }

      // Merge the owner's change over the snapshot so a partial structured edit never
      // clears sibling subfields that Google's top-level updateMask would replace.
      const effectivePatch = mergePatchOverSnapshot(
        payload.patch,
        previousValues,
        payload.updateMask
      );
      googleResult = await patchGbpBusinessInformation(
        auth,
        businessInfoLocationName(property),
        effectivePatch,
        payload.updateMask
      );

      const markedPublished = await GbpWorkItemModel.markPublished(item.id, {
        publishedContent: item.approved_content || item.draft_content,
        googleResourceName: businessInfoLocationName(property),
        googleResponse: googleResult,
      });
      if (markedPublished === 0) {
        throw new GbpAutomationError("INVALID_STATUS", "This profile update was already finalized.");
      }
      await GbpDeploymentAttemptModel.markSucceeded(attempt.id, googleResult);
      await GbpWorkEventModel.create({
        work_item_id: item.id,
        actor_user_id: userId,
        event_type: "business_info_published",
        metadata: { updateMask: payload.updateMask },
      });
      await GbpNotificationService.create({
        organizationId: item.organization_id,
        locationId: item.location_id,
        workItemId: item.id,
        kind: "gbp_business_info_published",
        title: "Alloro updated your Google profile",
        message:
          "You approved it and Alloro updated your Business Profile information on Google. You can revert it any time.",
      });
      return (await GbpWorkItemModel.findById(item.id))!;
    } catch (error) {
      const err = error as { code?: string; message?: string; details?: unknown };
      if (googleResult) {
        await GbpDeploymentAttemptModel.markSucceeded(attempt.id, googleResult);
        await GbpWorkItemModel.updateById(item.id, {
          status: "published",
          published_content: item.approved_content || item.draft_content,
          google_response: googleResult,
          published_at: new Date(),
          last_error_code: err.code || "BUSINESS_INFO_PUBLISH_SYNC_FAILED",
          last_error_message:
            "Google accepted this profile update, but Alloro could not finish local sync.",
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
        kind: "gbp_business_info_deploy_failed",
        title: "Google profile update failed",
        message: err.message || "A Google profile update failed to publish and returned to draft.",
      }).catch(() => undefined);
      return (await GbpWorkItemModel.findById(item.id))!;
    }
  }

  static async revertNow(workItemId: string, userId: number | null): Promise<IGbpWorkItem> {
    const item = await GbpWorkItemModel.findById(workItemId);
    if (!item) throw new GbpAutomationError("WORK_ITEM_NOT_FOUND", "Work item not found.");
    if (item.content_type !== "business_info") {
      throw new GbpAutomationError("INVALID_CONTENT_TYPE", "This work item is not a profile update.");
    }
    if (item.status !== "published") {
      throw new GbpAutomationError("REVERT_NOT_AVAILABLE", "Only a published profile update can be reverted.");
    }
    await this.assertOrganizationActive(item.organization_id);

    // Idempotency: if a prior run already reverted this item, do NOT patch again.
    if (item.metadata?.reverted === true) {
      return item;
    }

    const payload = readPayload(item);
    if (!payload.previousValues) {
      throw new GbpAutomationError("NO_ROLLBACK_SNAPSHOT", "No rollback snapshot exists for this profile update.");
    }
    await assertWritebackEnabled(item.organization_id, item.location_id);

    const property = await GooglePropertyModel.findById(item.google_property_id);
    if (!property) throw new GbpAutomationError("GBP_PROPERTY_MISSING", "GBP property missing.");

    const auth = await getValidOAuth2ClientByConnection(property.google_connection_id);
    const googleResult = await patchGbpBusinessInformation(
      auth,
      businessInfoLocationName(property),
      payload.previousValues,
      payload.updateMask
    );

    // Mark reverted + release the single-flight claim first, so a bookkeeping failure
    // below cannot cause the job to retry and re-PATCH Google.
    await GbpWorkItemModel.updateById(item.id, {
      metadata: {
        ...item.metadata,
        reverted: true,
        revertPending: false,
        revertedAt: new Date().toISOString(),
      },
      google_response: googleResult,
    });
    await GbpWorkEventModel.create({
      work_item_id: item.id,
      actor_user_id: userId,
      event_type: "business_info_reverted",
      metadata: { updateMask: payload.updateMask },
    }).catch(() => undefined);
    await GbpNotificationService.create({
      organizationId: item.organization_id,
      locationId: item.location_id,
      workItemId: item.id,
      kind: "gbp_business_info_reverted",
      title: "Alloro reverted your Google profile update",
      message: "Your Business Profile information was restored to its previous values on Google.",
    }).catch(() => undefined);
    return (await GbpWorkItemModel.findById(item.id))!;
  }

  private static async assertOrganizationActive(organizationId: number): Promise<void> {
    try {
      await OrganizationLifecycleService.assertActive(organizationId);
    } catch (error) {
      if (!(error instanceof OrganizationArchivedError)) throw error;
      throw new GbpAutomationError(
        "ORGANIZATION_ARCHIVED",
        "Archived organizations cannot write back to Google."
      );
    }
  }

  private static async getScopedItem(params: ScopedParams): Promise<IGbpWorkItem> {
    const item = await GbpWorkItemModel.findByIdForScope(params.workItemId, params.organizationId);
    if (!item) throw new GbpAutomationError("WORK_ITEM_NOT_FOUND", "Work item not found.");
    await this.assertOrganizationActive(params.organizationId);
    if (params.accessibleLocationIds && !params.accessibleLocationIds.includes(item.location_id)) {
      throw new GbpAutomationError("LOCATION_ACCESS_DENIED", "No access to this location.");
    }
    if (item.content_type !== "business_info") {
      throw new GbpAutomationError("INVALID_CONTENT_TYPE", "This work item is not a profile update.");
    }
    return item;
  }
}
