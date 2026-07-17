import { getValidOAuth2ClientByConnection } from "../../../auth/oauth2Helper";
import type { GoogleOAuthClient } from "../../../auth/oauth2Helper";
import logger from "../../../lib/logger";
import { GooglePropertyModel, IGoogleProperty } from "../../../models/GooglePropertyModel";
import { GbpAutomationSettingsModel } from "../../../models/GbpAutomationSettingsModel";
import { GbpDeploymentAttemptModel } from "../../../models/GbpDeploymentAttemptModel";
import type { GbpAttemptClaim, IGbpDeploymentAttempt } from "../../../models/GbpDeploymentAttemptModel";
import { GbpWorkEventModel } from "../../../models/GbpWorkEventModel";
import { GbpWorkItemModel, IGbpWorkItem } from "../../../models/GbpWorkItemModel";
import { getLocationProfileForRanking } from "../../gbp/gbp-services/location-handler.service";
import { patchGbpBusinessInformation } from "../../gbp/gbp-services/gbp-write.service";
import { GbpAutomationError } from "../feature-utils/GbpAutomationError";
import { isTransientGoogleError } from "../feature-utils/googleApiErrors";
import {
  BusinessInfoPatch,
  BusinessInfoPayload,
  businessInfoLocationName,
  extractMaskedFields,
  mergePatchOverSnapshot,
} from "../feature-utils/gbpBusinessInfo";
import { GbpBusinessInfoReconcileService } from "./GbpBusinessInfoReconcileService";
import { GbpBusinessInfoQueueService } from "./GbpBusinessInfoQueueService";
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

type PreparedBusinessInfoWrite = {
  auth: GoogleOAuthClient;
  property: IGoogleProperty;
  effectivePatch: BusinessInfoPatch;
  reconciled: IGbpWorkItem | null;
};
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

    // §7.4 — transaction opened through the model layer, which owns the DB handle.
    await GbpWorkItemModel.transaction(async (trx) => {
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
    // §7.4 — transaction opened through the model layer, which owns the DB handle.
    await GbpWorkItemModel.transaction(async (trx) => {
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

    // §7.4 — transaction opened through the model layer, which owns the DB handle.
    await GbpWorkItemModel.transaction(async (trx) => {
      const marked = await GbpWorkItemModel.markBusinessInfoDeploying(
        item.id,
        params.userId,
        trx
      );
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
      await GbpBusinessInfoQueueService.ensureDeploymentScheduled(item, params);
    } catch (enqueueError) {
      await this.handleDeploymentEnqueueFailure(item, params, enqueueError);
    }
    await this.recordDeployQueued(item.id);
    return (await GbpWorkItemModel.findById(item.id))!;
  }

  static async retryDeployment(params: ScopedParams): Promise<IGbpWorkItem> {
    const item = await this.getScopedItem(params);
    if (
      item.status === "deploying" &&
      (item.metadata?.deployQueueState === "pending" ||
        item.metadata?.deployQueueState === "queued" ||
        item.metadata?.providerStateUnknown === true)
    ) {
      await assertWritebackEnabled(item.organization_id, item.location_id);
      try {
        await GbpBusinessInfoQueueService.ensureDeploymentScheduled(item, params);
      } catch (enqueueError) {
        logger.error(
          { err: enqueueError, workItemId: item.id },
          "[GBP] pending business-info deployment could not be re-enqueued"
        );
        throw new GbpAutomationError(
          "DEPLOY_QUEUE_RECOVERY_REQUIRED",
          "The deployment is waiting for its queue job. Retry again; the stable job ID makes this safe."
        );
      }
      await this.recordDeployQueued(item.id);
      return (await GbpWorkItemModel.findById(item.id))!;
    }
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
    // The claim reports WHY it was refused — "a revert is running" and "the revert
    // already happened" are different facts and the owner is told which one is true.
    const claim = await GbpWorkItemModel.claimBusinessInfoRevert(item.id);
    if (claim === "revert_in_progress") {
      const current = (await GbpWorkItemModel.findById(item.id)) || item;
      if (
        current.metadata?.revertQueueState === "pending" ||
        current.metadata?.revertQueueState === "queued"
      ) {
        try {
          await GbpBusinessInfoQueueService.ensureRevertScheduled(current, params);
        } catch (enqueueError) {
          logger.error(
            { err: enqueueError, workItemId: item.id },
            "[GBP] pending business-info revert could not be re-enqueued"
          );
          throw new GbpAutomationError(
            "REVERT_QUEUE_RECOVERY_REQUIRED",
            "The revert is waiting for its queue job. Retry again; the stable job ID makes this safe."
          );
        }
        await this.recordRevertQueued(item.id);
        return (await GbpWorkItemModel.findById(item.id))!;
      }
      throw new GbpAutomationError(
        "REVERT_IN_PROGRESS",
        "A revert for this profile update is already in progress. It will finish shortly."
      );
    }
    if (claim === "already_reverted") {
      throw new GbpAutomationError(
        "ALREADY_REVERTED",
        "This profile update was already reverted on Google; there is nothing left to undo."
      );
    }
    if (claim === "not_revertable") {
      throw new GbpAutomationError(
        "REVERT_NOT_AVAILABLE",
        "Only a published profile update can be reverted."
      );
    }
    try {
      await GbpBusinessInfoQueueService.ensureRevertScheduled(item, params);
    } catch (enqueueError) {
      await this.handleRevertEnqueueFailure(item, params, enqueueError);
    }
    await this.recordRevertQueued(item.id);
    return (await GbpWorkItemModel.findById(item.id))!;
  }

  static async deployNow(
    workItemId: string,
    userId: number | null,
    options?: { isFinalAttempt?: boolean; isRetryAttempt?: boolean }
  ): Promise<IGbpWorkItem> {
    const item = await this.getDeployableItem(workItemId);
    const payload = readPayload(item);
    const claim = await GbpDeploymentAttemptModel.claimRunningAttempt(
      {
        work_item_id: item.id,
        requested_by_user_id: userId,
        request_payload: { updateMask: payload.updateMask },
      },
      options?.isRetryAttempt ? { leaseMs: 0 } : undefined
    );
    const earlyResult = await this.resolveClaimState(item, payload, userId, claim);
    if (earlyResult) return earlyResult;

    let googleResult: Record<string, unknown> | null = null;
    try {
      const prepared = await this.prepareProviderWrite(item, payload, userId, claim);
      if (prepared.reconciled) return prepared.reconciled;
      googleResult = await patchGbpBusinessInformation(
        prepared.auth,
        businessInfoLocationName(prepared.property),
        prepared.effectivePatch,
        payload.updateMask
      );
      return await GbpBusinessInfoReconcileService.finalizeProviderSuccess({
        item,
        attempt: claim.attempt,
        userId,
        payload,
        googleResult,
        googleResourceName: businessInfoLocationName(prepared.property),
        reason: "provider_response",
      });
    } catch (error) {
      return this.handleProviderWriteError({
        error,
        googleResult,
        item,
        attempt: claim.attempt,
        payload,
        isFinalAttempt: options?.isFinalAttempt,
      });
    }
  }

  private static async getDeployableItem(workItemId: string): Promise<IGbpWorkItem> {
    const item = await GbpWorkItemModel.findById(workItemId);
    if (!item) throw new GbpAutomationError("WORK_ITEM_NOT_FOUND", "Work item not found.");
    if (item.content_type !== "business_info") {
      throw new GbpAutomationError("INVALID_CONTENT_TYPE", "This work item is not a profile update.");
    }
    if (item.status !== "deploying") {
      throw new GbpAutomationError("INVALID_STATUS", "This profile update is not queued for deployment.");
    }
    await this.assertOrganizationActive(item.organization_id);
    return item;
  }

  private static async resolveClaimState(
    item: IGbpWorkItem,
    payload: BusinessInfoPayload,
    userId: number | null,
    claim: GbpAttemptClaim
  ): Promise<IGbpWorkItem | null> {
    if (claim.state === "concurrent_attempt_running") {
      logger.warn(
        { workItemId: item.id, attemptId: claim.attempt.id, claimState: claim.state },
        "[GBP] business-info deploy skipped; another worker holds a live attempt lease"
      );
      return item;
    }
    if (claim.state !== "already_succeeded") return null;

    logger.warn(
      { workItemId: item.id, attemptId: claim.attempt.id, claimState: claim.state },
      "[GBP] business-info retry found a succeeded attempt with an unfinalized work item; reconciling local state without re-sending to Google"
    );
    return GbpBusinessInfoReconcileService.finalizeProviderSuccess({
      item,
      attempt: claim.attempt,
      userId,
      payload,
      googleResult: (claim.attempt.response_payload || {}) as Record<string, unknown>,
      reason: "already_succeeded",
    });
  }

  private static async prepareProviderWrite(
    item: IGbpWorkItem,
    payload: BusinessInfoPayload,
    userId: number | null,
    claim: GbpAttemptClaim
  ): Promise<PreparedBusinessInfoWrite> {
    const readiness = await GbpReadinessService.getLocationReadiness(
      item.organization_id,
      item.location_id
    );
    assertGoogleReady(readiness);
    await assertWritebackEnabled(item.organization_id, item.location_id);

    const property = await GooglePropertyModel.findById(item.google_property_id);
    if (!property) throw new GbpAutomationError("GBP_PROPERTY_MISSING", "GBP property missing.");
    const auth = await getValidOAuth2ClientByConnection(property.google_connection_id);
    const hadSnapshot = Boolean(payload.previousValues);
    const previousValues = await this.ensureRollbackSnapshot(item, payload, auth, property);
    const effectivePatch = mergePatchOverSnapshot(
      payload.patch,
      previousValues,
      payload.updateMask
    );
    const mustReconcileProvider =
      hadSnapshot &&
      (claim.state === "stale_attempt_running" ||
        item.metadata?.providerStateUnknown === true);
    const reconciled =
      mustReconcileProvider
        ? await GbpBusinessInfoReconcileService.reconcileAbandonedAttempt({
            item,
            attempt: claim.attempt,
            userId,
            payload,
            auth,
            property,
            effectivePatch,
          })
        : null;
    return { auth, property, effectivePatch, reconciled };
  }

  private static async ensureRollbackSnapshot(
    item: IGbpWorkItem,
    payload: BusinessInfoPayload,
    auth: GoogleOAuthClient,
    property: IGoogleProperty
  ): Promise<BusinessInfoPatch> {
    if (payload.previousValues) return payload.previousValues;
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
    const previousValues = extractMaskedFields(
      profile as Record<string, unknown>,
      payload.updateMask
    );
    await GbpWorkItemModel.updateById(item.id, {
      business_info_payload: { ...payload, previousValues },
    });
    return previousValues;
  }

  private static async handleProviderWriteError(params: {
    error: unknown;
    googleResult: Record<string, unknown> | null;
    item: IGbpWorkItem;
    attempt: IGbpDeploymentAttempt;
    payload: BusinessInfoPayload;
    isFinalAttempt?: boolean;
  }): Promise<IGbpWorkItem> {
    const { googleResult } = params;
    if (googleResult) {
      return this.recordProviderReceiptAndThrow({ ...params, googleResult });
    }
    return this.handlePreProviderFailure(params);
  }

  private static async recordProviderReceiptAndThrow(params: {
    error: unknown;
    googleResult: Record<string, unknown>;
    item: IGbpWorkItem;
    attempt: IGbpDeploymentAttempt;
    payload: BusinessInfoPayload;
  }): Promise<never> {
    const err = params.error as { code?: string };
    logger.error(
      {
        err: params.error,
        workItemId: params.item.id,
        attemptId: params.attempt.id,
        updateMask: params.payload.updateMask,
      },
      "[GBP] business-info patch applied on Google but atomic local finalization failed"
    );
    await GbpDeploymentAttemptModel.markSucceeded(params.attempt.id, params.googleResult);
    throw new GbpAutomationError(
      "BUSINESS_INFO_FINALIZATION_RETRY_REQUIRED",
      "Google accepted this profile update, but Alloro could not finish its local transaction. Retry will reconcile without writing Google again.",
      { causeCode: err.code || null }
    );
  }

  private static async handlePreProviderFailure(params: {
    error: unknown;
    item: IGbpWorkItem;
    attempt: IGbpDeploymentAttempt;
    isFinalAttempt?: boolean;
  }): Promise<IGbpWorkItem> {
    const err = params.error as { code?: string; message?: string; details?: unknown };
    if (err.code === "RECONCILE_READ_FAILED") {
      await GbpWorkItemModel.transaction(async (trx) => {
        await GbpDeploymentAttemptModel.markFailed(
          params.attempt.id,
          err.code || "RECONCILE_READ_FAILED",
          err.message || "Provider state could not be established.",
          err.details ? { details: err.details as Record<string, unknown> } : null,
          trx
        );
        const markedUnknown = await GbpWorkItemModel.markBusinessInfoProviderStateUnknown(
          params.item.id,
          params.attempt.id,
          trx
        );
        if (markedUnknown === 0) {
          throw new GbpAutomationError(
            "PROVIDER_STATE_UNKNOWN_PERSIST_FAILED",
            "The live provider state is unknown and Alloro could not preserve the recovery gate."
          );
        }
      });
      logger.error(
        { err: params.error, workItemId: params.item.id, attemptId: params.attempt.id },
        "[GBP] reconciliation read failed; provider state remains unknown and future writes stay gated"
      );
      throw params.error;
    }

    await GbpDeploymentAttemptModel.markFailed(
      params.attempt.id,
      err.code || "DEPLOY_FAILED",
      err.message || "Deployment failed.",
      err.details ? { details: err.details as Record<string, unknown> } : null
    );
    if (isTransientGoogleError(params.error) && params.isFinalAttempt === false) {
      throw params.error;
    }
    logger.error(
      { err: params.error, workItemId: params.item.id, attemptId: params.attempt.id },
      "[GBP] business-info deployment failed; returning item to draft"
    );
    await GbpWorkItemModel.markFailedToDraft(
      params.item.id,
      err.code || "DEPLOY_FAILED",
      err.message || "Deployment failed."
    );
    await this.notifyDeployFailure(params.item, err.message);
    return (await GbpWorkItemModel.findById(params.item.id))!;
  }

  private static async notifyDeployFailure(
    item: IGbpWorkItem,
    errorMessage?: string
  ): Promise<void> {
    const kind = "gbp_business_info_deploy_failed";
    await GbpNotificationService.create({
      organizationId: item.organization_id,
      locationId: item.location_id,
      workItemId: item.id,
      kind,
      title: "Google profile update failed",
      message: errorMessage || "A Google profile update failed to publish and returned to draft.",
    }).catch((notifyError) => {
      logger.error(
        { err: notifyError, workItemId: item.id, kind },
        "[GBP] business-info deploy-failed notification write failed"
      );
    });
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

    await GbpWorkItemModel.updateById(item.id, {
      metadata: {
        ...item.metadata,
        reverted: true,
        revertPending: false,
        revertedAt: new Date().toISOString(),
      },
      google_response: googleResult,
    });
    const revertedEvent = "business_info_reverted";
    await GbpWorkEventModel.create({
      work_item_id: item.id,
      actor_user_id: userId,
      event_type: revertedEvent,
      metadata: { updateMask: payload.updateMask },
    }).catch((eventError) => {
      logger.error(
        { err: eventError, workItemId: item.id, eventType: revertedEvent },
        "[GBP] business-info revert event write failed"
      );
    });
    const revertedNotification = "gbp_business_info_reverted";
    await GbpNotificationService.create({
      organizationId: item.organization_id,
      locationId: item.location_id,
      workItemId: item.id,
      kind: revertedNotification,
      title: "Alloro reverted your Google profile update",
      message: "Your Business Profile information was restored to its previous values on Google.",
    }).catch((notifyError) => {
      logger.error(
        { err: notifyError, workItemId: item.id, kind: revertedNotification },
        "[GBP] business-info revert notification write failed"
      );
    });
    return (await GbpWorkItemModel.findById(item.id))!;
  }

  private static async recordDeployQueued(workItemId: string): Promise<void> {
    await GbpWorkItemModel.markBusinessInfoDeployQueued(workItemId).catch((error) => {
      logger.error(
        { err: error, workItemId },
        "[GBP] deployment job exists but its queue-state marker could not be updated"
      );
    });
  }

  private static async recordRevertQueued(workItemId: string): Promise<void> {
    await GbpWorkItemModel.markBusinessInfoRevertQueued(workItemId).catch((error) => {
      logger.error(
        { err: error, workItemId },
        "[GBP] revert job exists but its queue-state marker could not be updated"
      );
    });
  }

  private static async handleDeploymentEnqueueFailure(
    item: IGbpWorkItem,
    params: ScopedParams,
    enqueueError: unknown
  ): Promise<never> {
    logger.error(
      { err: enqueueError, workItemId: item.id },
      "[GBP] business-info deployment enqueue failed; compensating to draft"
    );

    let compensated = false;
    try {
      compensated =
        (await GbpWorkItemModel.markFailedToDraft(
          item.id,
          "DEPLOY_ENQUEUE_FAILED",
          "The deployment could not be queued."
        )) === 1;
      if (!compensated) {
        logger.error(
          { workItemId: item.id, affectedRows: 0 },
          "[GBP] business-info enqueue compensation affected no rows"
        );
      }
    } catch (compensationError) {
      logger.error(
        { err: compensationError, workItemId: item.id },
        "[GBP] business-info enqueue compensation failed"
      );
    }

    await this.recordQueueFailureEvent(
      item.id,
      params,
      "business_info_deploy_enqueue_failed"
    );

    if (compensated) {
      throw new GbpAutomationError(
        "DEPLOY_QUEUE_TRANSIENT_FAILURE",
        "The deployment could not be queued; the update was returned to draft. Retry in a moment."
      );
    }
    throw new GbpAutomationError(
      "DEPLOY_QUEUE_RECOVERY_REQUIRED",
      "The deployment queue failed and the item could not be returned to draft. Retry the deployment; Alloro will safely re-enqueue the pending item."
    );
  }

  private static async handleRevertEnqueueFailure(
    item: IGbpWorkItem,
    params: ScopedParams,
    enqueueError: unknown
  ): Promise<never> {
    logger.error(
      { err: enqueueError, workItemId: item.id },
      "[GBP] business-info revert enqueue failed; releasing revert claim"
    );

    let compensated = false;
    try {
      compensated =
        (await GbpWorkItemModel.releaseBusinessInfoRevertClaim(item.id)) === 1;
      if (!compensated) {
        logger.error(
          { workItemId: item.id, affectedRows: 0 },
          "[GBP] business-info revert-claim release affected no rows"
        );
      }
    } catch (compensationError) {
      logger.error(
        { err: compensationError, workItemId: item.id },
        "[GBP] business-info revert-claim release failed"
      );
    }

    await this.recordQueueFailureEvent(
      item.id,
      params,
      "business_info_revert_enqueue_failed"
    );

    if (compensated) {
      throw new GbpAutomationError(
        "REVERT_QUEUE_TRANSIENT_FAILURE",
        "The revert could not be queued. Try again in a moment."
      );
    }
    throw new GbpAutomationError(
      "REVERT_QUEUE_RECOVERY_REQUIRED",
      "The revert queue failed and its claim could not be released. Retry the revert; Alloro will safely re-enqueue the pending job."
    );
  }

  private static async recordQueueFailureEvent(
    workItemId: string,
    params: ScopedParams,
    eventType: string
  ): Promise<void> {
    await GbpWorkEventModel.create({
      work_item_id: workItemId,
      actor_user_id: params.userId,
      event_type: eventType,
      metadata: { actorEmail: params.actorEmail || null },
    }).catch((eventError) => {
      logger.error(
        { err: eventError, workItemId, eventType },
        "[GBP] business-info compensation event write failed"
      );
    });
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
