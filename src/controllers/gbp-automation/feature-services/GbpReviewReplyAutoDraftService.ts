/**
 * Auto-draft a Google review reply when a NEW replyable review is ingested.
 *
 * Owner-approved outbound (canon): this NEVER sends. It stages a reply DRAFT and
 * fires the same "reply draft ready" notification the manual path does; the owner
 * still reviews, edits, approves, and only then does anything reach Google.
 *
 * OFF BY DEFAULT. `review_reply_autodraft_enabled` is auto-draft's own per-scope
 * switch, seeded false, so merging this changes nothing until it is turned on for
 * one account at a time. It is deliberately NOT the manual path's readiness gate:
 * reusing that would have started auto-drafting on the next nightly sync for every
 * location already replying manually, which is a different decision than the one
 * an operator makes when they enable a feature.
 *
 * Two seams:
 *   enqueueForIngestedReviews — called from the OAuth review-sync processor after
 *     it upserts a location's reviews. Gated on the activation switch AND on the
 *     same readiness the manual path uses (feature enabled + Google connection +
 *     business.manage scope + selected GBP property), deduped against work items
 *     that already exist, then it queues one autodraft job per replyable review —
 *     at most AUTO_DRAFT_MAX_PER_SYNC per run, so a catch-up burst can never sit
 *     in front of an owner's publish on the shared queue. It never throws — a
 *     draft failure must not break review ingestion.
 *   autoDraftForReview — the queued worker body. Re-checks dedup and replyability,
 *     then reuses GbpReviewReplyService.generateDraft (userId null = system) to
 *     create the held draft. "No longer applicable" outcomes (feature turned off,
 *     already replied, already drafted, review gone) are clean skips, not retries;
 *     unexpected failures rethrow so BullMQ retries.
 *
 * Only OAuth reviews with a google_review_name are ever replyable; Apify/Maps-only
 * scraped reviews have no google_review_name and are never candidates. Nothing here
 * fabricates a reply — if generation fails, no draft is staged.
 */

import { getGbpAutomationQueue } from "../../../workers/queues";
import logger from "../../../lib/logger";
import { IReview } from "../../../models/website-builder/ReviewModel";
import { GbpWorkItemModel } from "../../../models/GbpWorkItemModel";
import { GbpAutomationError } from "../feature-utils/GbpAutomationError";
import { GbpCustomizationService } from "./GbpCustomizationService";
import { GbpReadinessService } from "./GbpReadinessService";
import { GbpReviewReplyService } from "./GbpReviewReplyService";

const AUTO_DRAFT_JOB_NAME = "autodraft-review-reply";
const AUTO_DRAFT_TRIGGER = "auto_ingest";

/**
 * Most auto-draft jobs one sync run may queue for one location.
 *
 * The bound exists because "replyable with no existing work item" is not the
 * same as "arrived since the last sync": the first run after the switch is
 * turned on sees EVERY currently-unreplied review at once. Each job is one LLM
 * call on a concurrency-1 queue that also carries owner-initiated publishes, so
 * an uncapped run on a location with hundreds of unreplied reviews would sit in
 * front of an owner's publish for as long as it takes to drain. Capping turns
 * that into several nightly runs of at most this many drafts. The remainder is
 * not lost — it is picked up by the next sync, and logged so the drain is
 * visible while it lasts.
 */
const AUTO_DRAFT_MAX_PER_SYNC = 10;

/**
 * How long a FAILED auto-draft job is retained. Deliberately shorter than the
 * daily sync interval: BullMQ ignores `add` for a jobId that still exists in any
 * state, including `failed`, so a longer retention would make a permanently
 * failed review un-retryable until the record aged out — while each night's log
 * still reported it as queued. Under one day, the next sync always gets a clean
 * shot at it.
 */
const AUTO_DRAFT_FAILED_JOB_RETENTION_SECONDS = 72000; // 20h < 24h sync interval

/**
 * GbpAutomationError codes that mean "this review no longer needs an auto-draft"
 * — a clean skip, not a failure to retry. The feature may have been turned off
 * between enqueue and processing, the owner may have replied on Google directly,
 * a manual draft may already exist, or the review may have been removed.
 */
const NON_RETRYABLE_SKIP_CODES = new Set([
  "GBP_NOT_READY",
  "REVIEW_NOT_REPLYABLE",
  "REVIEW_NOT_FOUND",
  "LOCATION_ACCESS_DENIED",
  "ORGANIZATION_ARCHIVED",
  "GBP_CONTEXT_MISSING",
]);

export interface AutoDraftEnqueueResult {
  candidates: number;
  enqueued: number;
  skippedExisting: number;
  skippedNotReady: boolean;
  /** The per-scope activation switch is off — nothing was queued. */
  skippedDisabled: boolean;
  /** Replyable, un-drafted reviews left for the next sync by the per-run cap. */
  deferredOverCap: number;
}

function isReplyableReview(review: IReview, locationId: number): boolean {
  return (
    review.location_id === locationId &&
    review.source === "oauth" &&
    Boolean(review.google_review_name) &&
    !review.has_reply &&
    !review.hidden
  );
}

/**
 * The two gates auto-draft must clear, in order.
 *
 * 1. `review_reply_autodraft_enabled` — auto-draft's OWN per-scope switch,
 *    default false, so the feature is dark until an operator turns it on for one
 *    account at a time. Checked first: when it is off nothing else is even read.
 *    A missing settings row is treated as off — absence is not consent.
 * 2. Readiness — the gate the MANUAL reply path already uses. Auto-draft can
 *    never be more permissive than the manual path.
 */
async function checkAutoDraftGates(
  organizationId: number,
  locationId: number
): Promise<"allowed" | "disabled" | "not_ready"> {
  const settings = await GbpCustomizationService.getEffectiveSettings(
    organizationId,
    locationId
  );
  if (!settings?.review_reply_autodraft_enabled) return "disabled";

  // Reviews are already persisted at this point, so readiness reflects the new
  // replyable rows.
  const readiness = await GbpReadinessService.getLocationReadiness(
    organizationId,
    locationId
  );
  if (!readiness.ready) {
    logger.info(
      `[GBP-AUTODRAFT] Skipping location ${locationId}: readiness=${readiness.status}`
    );
    return "not_ready";
  }
  return "allowed";
}

/**
 * Queue one auto-draft job. The jobId is derived from the review so a re-run
 * while the job is waiting/active is a no-op; generation-time dedup covers
 * re-runs after the job has been removed.
 */
async function queueAutoDraftJob(
  queue: ReturnType<typeof getGbpAutomationQueue>,
  params: { organizationId: number; locationId: number; reviewId: string }
): Promise<void> {
  await queue.add(
    AUTO_DRAFT_JOB_NAME,
    {
      organizationId: params.organizationId,
      locationId: params.locationId,
      reviewId: params.reviewId,
    },
    {
      jobId: `gbp-autodraft-${params.reviewId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 30000 },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: {
        age: AUTO_DRAFT_FAILED_JOB_RETENTION_SECONDS,
        count: 5000,
      },
    }
  );
}

export class GbpReviewReplyAutoDraftService {
  /**
   * Queue auto-draft jobs for the replyable reviews just ingested for one
   * location. Safe to call on every sync: dedup + idempotent jobId mean a review
   * is drafted at most once. Never throws.
   *
   * TWO gates, in this order:
   *   1. `review_reply_autodraft_enabled` — auto-draft's OWN per-scope switch,
   *      default FALSE. Merging this feature therefore changes nothing anywhere
   *      until it is turned on for one account at a time. Without it the only
   *      gate would be the readiness the MANUAL reply path already uses, so
   *      auto-draft would start on the next nightly sync for every location
   *      already using manual replies — which is not the same decision.
   *   2. Readiness — the manual path's gate (feature on, Google connected,
   *      business.manage scope, GBP property selected). Auto-draft can never be
   *      more permissive than the manual path.
   *
   * "New" here means "replyable with no existing review-reply work item", not
   * "arrived since the last sync" — the OAuth sync re-upserts every review each
   * run. So the first runs after the switch is turned on back-fill the location's
   * currently-unreplied reviews, AUTO_DRAFT_MAX_PER_SYNC at a time, until it
   * catches up. To make it strictly-new-only instead, detect insert-vs-update in
   * ReviewModel.upsertByGoogleName (e.g. RETURNING xmax=0) and pass only true
   * inserts here.
   */
  static async enqueueForIngestedReviews(params: {
    organizationId: number;
    locationId: number;
    reviews: IReview[];
  }): Promise<AutoDraftEnqueueResult> {
    const result: AutoDraftEnqueueResult = {
      candidates: 0,
      enqueued: 0,
      skippedExisting: 0,
      skippedNotReady: false,
      skippedDisabled: false,
      deferredOverCap: 0,
    };

    try {
      const candidates = params.reviews.filter((review) =>
        isReplyableReview(review, params.locationId)
      );
      result.candidates = candidates.length;
      if (candidates.length === 0) return result;

      const gate = await checkAutoDraftGates(
        params.organizationId,
        params.locationId
      );
      if (gate !== "allowed") {
        if (gate === "disabled") result.skippedDisabled = true;
        else result.skippedNotReady = true;
        return result;
      }

      const reviewIds = candidates.map((review) => review.id);
      const alreadyDrafted = await GbpWorkItemModel.findReviewIdsWithReviewReply(
        params.organizationId,
        params.locationId,
        reviewIds
      );

      const queue = getGbpAutomationQueue("deployment");
      for (const review of candidates) {
        if (alreadyDrafted.has(review.id)) {
          result.skippedExisting += 1;
          continue;
        }
        if (result.enqueued >= AUTO_DRAFT_MAX_PER_SYNC) {
          // Not dropped — the next sync re-evaluates the same candidates and
          // picks these up, because dedup is by existing work item, not by a
          // "seen" marker.
          result.deferredOverCap += 1;
          continue;
        }
        await queueAutoDraftJob(queue, {
          organizationId: params.organizationId,
          locationId: params.locationId,
          reviewId: review.id,
        });
        result.enqueued += 1;
      }

      if (result.enqueued > 0) {
        logger.info(
          `[GBP-AUTODRAFT] Location ${params.locationId}: queued ${result.enqueued} review-reply auto-draft(s)` +
            (result.skippedExisting > 0 ? `, skipped ${result.skippedExisting} already-drafted` : "")
        );
      }
      if (result.deferredOverCap > 0) {
        logger.warn(
          `[GBP-AUTODRAFT] Location ${params.locationId}: per-sync cap ${AUTO_DRAFT_MAX_PER_SYNC} reached — ` +
            `${result.deferredOverCap} replyable review(s) deferred to the next sync.`
        );
      }
    } catch (err: unknown) {
      // Auto-draft is best-effort. A queue/readiness failure must never break
      // review ingestion.
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        `[GBP-AUTODRAFT] Failed to enqueue auto-drafts for location ${params.locationId}:`
      );
    }

    return result;
  }

  /**
   * Queued worker body: create the held draft for one review, once. Reuses the
   * manual generateDraft path (readiness/replyability gates, notification) with
   * userId null to mark a system-created draft. Returns whether a draft was made.
   */
  static async autoDraftForReview(params: {
    organizationId: number;
    locationId: number;
    reviewId: string;
  }): Promise<{ drafted: boolean; reason?: string }> {
    // Draft at most once, ever — respects a prior rejected/published draft.
    const existing = await GbpWorkItemModel.findReviewIdsWithReviewReply(
      params.organizationId,
      params.locationId,
      [params.reviewId]
    );
    if (existing.has(params.reviewId)) {
      logger.info(
        `[GBP-AUTODRAFT] Review ${params.reviewId} already has a review-reply work item; skipping.`
      );
      return { drafted: false, reason: "already_drafted" };
    }

    try {
      await GbpReviewReplyService.generateDraft({
        organizationId: params.organizationId,
        locationId: params.locationId,
        reviewId: params.reviewId,
        userId: null,
        metadata: { trigger: AUTO_DRAFT_TRIGGER },
      });
      logger.info(
        `[GBP-AUTODRAFT] Staged review-reply draft for review ${params.reviewId} (owner approval pending).`
      );
      return { drafted: true };
    } catch (err: unknown) {
      if (err instanceof GbpAutomationError && NON_RETRYABLE_SKIP_CODES.has(err.code)) {
        logger.info(
          `[GBP-AUTODRAFT] Review ${params.reviewId} no longer needs an auto-draft (${err.code}); skipping.`
        );
        return { drafted: false, reason: err.code };
      }
      // Unexpected (e.g. LLM generation failure) — let BullMQ retry.
      throw err;
    }
  }
}
