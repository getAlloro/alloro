import logger from "../../../lib/logger";
import type { GoogleOAuthClient } from "../../../auth/oauth2Helper";
import {
  GbpDeploymentAttemptModel,
  IGbpDeploymentAttempt,
} from "../../../models/GbpDeploymentAttemptModel";
import { GooglePropertyModel, IGoogleProperty } from "../../../models/GooglePropertyModel";
import { GbpWorkEventModel } from "../../../models/GbpWorkEventModel";
import { GbpWorkItemModel, IGbpWorkItem } from "../../../models/GbpWorkItemModel";
import { getLocationProfileForRanking } from "../../gbp/gbp-services/location-handler.service";
import { GbpAutomationError } from "../feature-utils/GbpAutomationError";
import {
  BusinessInfoPatch,
  BusinessInfoPayload,
  businessInfoLocationName,
  liveMatchesDesired,
} from "../feature-utils/gbpBusinessInfo";
import { GbpNotificationService } from "./GbpNotificationService";

/**
 * A6 — reconciling a write-back whose outcome at Google is unknown or only partly
 * recorded. This is the silent-divergence guard: the state where Google has already
 * changed the customer's real profile but Alloro's record does not say so.
 *
 * Logging a suspected divergence is not reconciliation. Everything here either reads
 * Google to establish what actually happened, or acts on a provider response we
 * already recorded — it never assumes, and it never writes on a guess.
 */
export class GbpBusinessInfoReconcileService {
  /**
   * Determine what Google ACTUALLY did on an attempt whose worker died mid-flight,
   * and reconcile to it. Returns the finalized work item when the abandoned attempt's
   * write is found to have landed, or null when it did not (the caller then writes).
   *
   * If the live read fails we cannot know, so we do NOT write: the attempt fails and
   * the queue retries. Writing blind here is the one move that could double-apply a
   * change to a customer's live profile.
   */
  static async reconcileAbandonedAttempt(params: {
    item: IGbpWorkItem;
    attempt: IGbpDeploymentAttempt;
    userId: number | null;
    payload: BusinessInfoPayload;
    auth: GoogleOAuthClient;
    property: IGoogleProperty;
    effectivePatch: BusinessInfoPatch;
  }): Promise<IGbpWorkItem | null> {
    const { item, attempt, userId, payload, effectivePatch } = params;

    const profile = await getLocationProfileForRanking(
      params.auth,
      params.property.account_id || "",
      params.property.external_id || ""
    );
    if (!profile) {
      throw new GbpAutomationError(
        "RECONCILE_READ_FAILED",
        "Could not read the live profile to check whether an interrupted update had already been applied; the update was not sent."
      );
    }

    const landed = liveMatchesDesired(
      profile as Record<string, unknown>,
      effectivePatch,
      payload.updateMask
    );
    if (!landed) {
      logger.warn(
        { workItemId: item.id, attemptId: attempt.id, updateMask: payload.updateMask },
        "[GBP] business-info reconcile: interrupted attempt did not reach Google; sending the update"
      );
      return null;
    }

    logger.warn(
      { workItemId: item.id, attemptId: attempt.id, updateMask: payload.updateMask },
      "[GBP] business-info reconcile: interrupted attempt had already been applied on Google; finalizing local state without re-sending"
    );
    return this.finalizeProviderSuccess({
      item,
      attempt,
      userId,
      payload,
      googleResult: { reconciledFromLiveProfile: true },
      googleResourceName: businessInfoLocationName(params.property),
      reason: "reconciled_live_match",
    });
  }

  /**
   * Finish the LOCAL half of a write Google has already accepted. Never sends a PATCH:
   * by the time this runs the customer's profile already carries the owner's values,
   * and the only thing missing is Alloro's record of it.
   *
   * Deliberately does not re-check the write-back master switch. The switch gates
   * SENDING changes to Google; this sends nothing. Refusing to record a change that is
   * already live on the customer's profile — because the switch flipped off after the
   * write — would leave our record permanently wrong about their real profile, which is
   * the divergence this path exists to close.
   */
  static async finalizeProviderSuccess(params: {
    item: IGbpWorkItem;
    attempt: IGbpDeploymentAttempt;
    userId: number | null;
    payload: BusinessInfoPayload;
    googleResult: Record<string, unknown>;
    googleResourceName?: string | null;
    reason: string;
  }): Promise<IGbpWorkItem> {
    const { item, attempt, userId, payload, googleResult } = params;

    // The resource name is a DB-derived label, not a Google call. Tolerate its absence
    // rather than stranding an item whose write already landed.
    let googleResourceName = params.googleResourceName ?? null;
    if (googleResourceName === null) {
      const property = await GooglePropertyModel.findById(item.google_property_id);
      googleResourceName = property?.external_id ? `locations/${property.external_id}` : null;
    }

    let alreadyFinalized = false;
    await GbpWorkItemModel.transaction(async (trx) => {
      if (attempt.status !== "succeeded") {
        const markedAttempt = await GbpDeploymentAttemptModel.markSucceeded(
          attempt.id,
          googleResult,
          trx
        );
        if (markedAttempt === 0) {
          throw new GbpAutomationError(
            "ATTEMPT_FINALIZATION_FAILED",
            "The provider accepted this update, but its deployment receipt could not be finalized."
          );
        }
      }

      const markedPublished = await GbpWorkItemModel.markPublished(
        item.id,
        {
          publishedContent: item.approved_content || item.draft_content,
          googleResourceName,
          googleResponse: googleResult,
        },
        trx
      );
      if (markedPublished === 0) {
        const current = await GbpWorkItemModel.findById(item.id, trx);
        if (current?.status === "published") {
          alreadyFinalized = true;
          return;
        }
        throw new GbpAutomationError(
          "WORK_ITEM_FINALIZATION_FAILED",
          "The provider accepted this update, but the work item could not be finalized."
        );
      }

      await GbpWorkEventModel.create(
        {
          work_item_id: item.id,
          actor_user_id: userId,
          event_type: "business_info_published",
          metadata: { updateMask: payload.updateMask, reconciled: params.reason },
        },
        trx
      );
    });

    if (alreadyFinalized) {
      logger.warn(
        { workItemId: item.id, attemptId: attempt.id, reason: params.reason },
        "[GBP] business-info reconcile: work item was already finalized by another worker"
      );
      return (await GbpWorkItemModel.findById(item.id))!;
    }

    const publishedNotification = "gbp_business_info_published";
    await GbpNotificationService.create({
      organizationId: item.organization_id,
      locationId: item.location_id,
      workItemId: item.id,
      kind: publishedNotification,
      title: "Alloro updated your Google profile",
      message:
        "You approved it and Alloro updated your Business Profile information on Google. You can revert it any time.",
    }).catch((notifyError) => {
      // §3.2 — best-effort, never silent: a dropped notice means the owner is never
      // told their live profile changed.
      logger.error(
        { err: notifyError, workItemId: item.id, kind: publishedNotification },
        "[GBP] business-info reconcile notification write failed"
      );
    });

    return (await GbpWorkItemModel.findById(item.id))!;
  }
}
