/**
 * Auto-draft a Google review reply when a NEW replyable review is ingested.
 *
 * Owner-approved outbound (canon): this NEVER sends. It stages a reply DRAFT and
 * fires the same "reply draft ready" notification the manual path does; the owner
 * still reviews, edits, approves, and only then does anything reach Google.
 *
 * Two seams:
 *   enqueueForIngestedReviews — called from the OAuth review-sync processor after
 *     it upserts a location's reviews. Gated on the SAME readiness the manual path
 *     uses (feature enabled + Google connection + business.manage scope + selected
 *     GBP property), deduped against work items that already exist, then it queues
 *     one autodraft job per genuinely-new replyable review. It never throws — a
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
import { GbpReadinessService } from "./GbpReadinessService";
import { GbpReviewReplyService } from "./GbpReviewReplyService";

const AUTO_DRAFT_JOB_NAME = "autodraft-review-reply";
const AUTO_DRAFT_TRIGGER = "auto_ingest";

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

export class GbpReviewReplyAutoDraftService {
  /**
   * Queue auto-draft jobs for the replyable reviews just ingested for one
   * location. Safe to call on every sync: dedup + idempotent jobId mean a review
   * is drafted at most once. Never throws.
   *
   * OPEN DECISION (documented for owner review): "new" here means "replyable with
   * no existing review-reply work item." Because the OAuth sync re-upserts every
   * review each run, the FIRST run after the feature is enabled backfills a draft
   * for every currently-unreplied review; steady-state, only truly-new reviews
   * qualify. This is owner-gated (nothing sends) and once-only, but it is a burst
   * of drafts + LLM calls on first enable. To restrict to strictly-new rows,
   * detect insert-vs-update in ReviewModel.upsertByGoogleName (e.g. RETURNING
   * xmax=0) and pass only true inserts here.
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
    };

    try {
      const candidates = params.reviews.filter((review) =>
        isReplyableReview(review, params.locationId)
      );
      result.candidates = candidates.length;
      if (candidates.length === 0) return result;

      // Same gate the manual path uses. Reviews are already persisted at this
      // point, so readiness reflects the new replyable rows.
      const readiness = await GbpReadinessService.getLocationReadiness(
        params.organizationId,
        params.locationId
      );
      if (!readiness.ready) {
        result.skippedNotReady = true;
        logger.info(
          `[GBP-AUTODRAFT] Skipping location ${params.locationId}: readiness=${readiness.status}`
        );
        return result;
      }

      const reviewIds = candidates.map((review) => review.id);
      const alreadyDrafted = await GbpWorkItemModel.findReviewIdsWithReviewReply(reviewIds);

      const queue = getGbpAutomationQueue("deployment");
      for (const review of candidates) {
        if (alreadyDrafted.has(review.id)) {
          result.skippedExisting += 1;
          continue;
        }
        await queue.add(
          AUTO_DRAFT_JOB_NAME,
          {
            organizationId: params.organizationId,
            locationId: params.locationId,
            reviewId: review.id,
          },
          {
            // Idempotent while waiting/active; generation-time dedup guards
            // against re-runs after the job is removed on a later sync.
            jobId: `gbp-autodraft-${review.id}`,
            attempts: 3,
            backoff: { type: "exponential", delay: 30000 },
            removeOnComplete: { age: 86400, count: 1000 },
            removeOnFail: { age: 604800, count: 5000 },
          }
        );
        result.enqueued += 1;
      }

      if (result.enqueued > 0) {
        logger.info(
          `[GBP-AUTODRAFT] Location ${params.locationId}: queued ${result.enqueued} review-reply auto-draft(s)` +
            (result.skippedExisting > 0 ? `, skipped ${result.skippedExisting} already-drafted` : "")
        );
      }
    } catch (err: any) {
      // Auto-draft is best-effort. A queue/readiness failure must never break
      // review ingestion.
      logger.error(
        { err: err?.message },
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
    const existing = await GbpWorkItemModel.findReviewIdsWithReviewReply([params.reviewId]);
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
    } catch (err: any) {
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
