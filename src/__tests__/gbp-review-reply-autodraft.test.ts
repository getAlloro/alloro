/**
 * Auto-draft-on-ingest — proves the wiring that stages an owner-held reply DRAFT
 * when a NEW replyable review lands, WITHOUT sending anything to Google.
 *
 * Covers the two seams of GbpReviewReplyAutoDraftService at the model/service
 * seam (no DB, no network, no LLM):
 *   enqueueForIngestedReviews — filters to genuinely-replyable OAuth reviews,
 *     respects the manual readiness gate, dedups against existing work items,
 *     queues one auto-draft job per new review, and never throws.
 *   autoDraftForReview — drafts once (dedup), reuses generateDraft with userId
 *     null + the auto_ingest marker, treats "no longer applicable" as a clean
 *     skip, and rethrows unexpected failures so BullMQ retries.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GbpAutomationError } from "../controllers/gbp-automation/feature-utils/GbpAutomationError";

const h = vi.hoisted(() => ({
  queueAdd: vi.fn(),
  getReadiness: vi.fn(),
  getEffectiveSettings: vi.fn(),
  findReviewIds: vi.fn(),
  generateDraft: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("../workers/queues", () => ({
  getGbpAutomationQueue: () => ({ add: h.queueAdd }),
}));
vi.mock("../controllers/gbp-automation/feature-services/GbpCustomizationService", () => ({
  GbpCustomizationService: { getEffectiveSettings: h.getEffectiveSettings },
}));
vi.mock("../controllers/gbp-automation/feature-services/GbpReadinessService", () => ({
  GbpReadinessService: { getLocationReadiness: h.getReadiness },
}));
vi.mock("../models/GbpWorkItemModel", () => ({
  GbpWorkItemModel: { findReviewIdsWithReviewReply: h.findReviewIds },
}));
vi.mock("../controllers/gbp-automation/feature-services/GbpReviewReplyService", () => ({
  GbpReviewReplyService: { generateDraft: h.generateDraft },
}));
vi.mock("../lib/logger", () => ({
  default: { error: h.loggerError, warn: h.loggerWarn, info: h.loggerInfo, debug: vi.fn() },
}));

import { GbpReviewReplyAutoDraftService } from "../controllers/gbp-automation/feature-services/GbpReviewReplyAutoDraftService";

const ORG = 1;
const LOC = 2;

function review(overrides: Record<string, unknown> = {}) {
  return {
    id: "rev-1",
    location_id: LOC,
    google_review_name: "accounts/1/locations/2/reviews/3",
    source: "oauth",
    place_id: null,
    stars: 5,
    text: "Great team",
    reviewer_name: "Sam",
    reviewer_photo_url: null,
    is_anonymous: false,
    review_created_at: new Date(),
    has_reply: false,
    reply_text: null,
    reply_date: null,
    hidden: false,
    synced_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getReadiness.mockResolvedValue({ ready: true, status: "ready" });
  // The activation switch is OFF in the schema default; these tests describe an
  // account where an operator has deliberately turned it ON. The off-by-default
  // behavior is asserted explicitly in its own tests below.
  h.getEffectiveSettings.mockResolvedValue({ review_reply_autodraft_enabled: true });
  h.findReviewIds.mockResolvedValue(new Set());
  h.queueAdd.mockResolvedValue(undefined);
  h.generateDraft.mockResolvedValue({ id: "wi-1" });
});

describe("enqueueForIngestedReviews", () => {
  it("queues one auto-draft job for a new replyable review", async () => {
    const result = await GbpReviewReplyAutoDraftService.enqueueForIngestedReviews({
      organizationId: ORG,
      locationId: LOC,
      reviews: [review()],
    });

    expect(result.candidates).toBe(1);
    expect(result.enqueued).toBe(1);
    expect(h.queueAdd).toHaveBeenCalledTimes(1);
    const [jobName, data, opts] = h.queueAdd.mock.calls[0];
    expect(jobName).toBe("autodraft-review-reply");
    expect(data).toEqual({ organizationId: ORG, locationId: LOC, reviewId: "rev-1" });
    expect(opts.jobId).toBe("gbp-autodraft-rev-1");
  });

  it("skips non-replyable reviews (already replied, no google_review_name, apify, hidden, other location)", async () => {
    const result = await GbpReviewReplyAutoDraftService.enqueueForIngestedReviews({
      organizationId: ORG,
      locationId: LOC,
      reviews: [
        review({ id: "a", has_reply: true }),
        review({ id: "b", google_review_name: null }),
        review({ id: "c", source: "apify", google_review_name: null }),
        review({ id: "d", hidden: true }),
        review({ id: "e", location_id: 999 }),
      ],
    });

    expect(result.candidates).toBe(0);
    expect(h.getReadiness).not.toHaveBeenCalled();
    expect(h.queueAdd).not.toHaveBeenCalled();
  });

  it("does not enqueue when the location is not ready (feature disabled / no scope)", async () => {
    h.getReadiness.mockResolvedValue({ ready: false, status: "feature_disabled" });

    const result = await GbpReviewReplyAutoDraftService.enqueueForIngestedReviews({
      organizationId: ORG,
      locationId: LOC,
      reviews: [review()],
    });

    expect(result.candidates).toBe(1);
    expect(result.skippedNotReady).toBe(true);
    expect(result.enqueued).toBe(0);
    expect(h.queueAdd).not.toHaveBeenCalled();
  });

  it("dedups against reviews that already have a work item (never double-drafts)", async () => {
    h.findReviewIds.mockResolvedValue(new Set(["rev-1"]));

    const result = await GbpReviewReplyAutoDraftService.enqueueForIngestedReviews({
      organizationId: ORG,
      locationId: LOC,
      reviews: [review({ id: "rev-1" }), review({ id: "rev-2" })],
    });

    expect(result.candidates).toBe(2);
    expect(result.skippedExisting).toBe(1);
    expect(result.enqueued).toBe(1);
    expect(h.queueAdd).toHaveBeenCalledTimes(1);
    expect(h.queueAdd.mock.calls[0][1].reviewId).toBe("rev-2");
  });

  it("stays dark when the activation switch is off — the default for every account", async () => {
    // The point of the switch: a location that is fully READY for manual replies
    // must still auto-draft NOTHING until someone turns auto-draft on for it.
    h.getEffectiveSettings.mockResolvedValue({
      review_reply_autodraft_enabled: false,
    });
    h.getReadiness.mockResolvedValue({ ready: true, status: "ready" });

    const result = await GbpReviewReplyAutoDraftService.enqueueForIngestedReviews({
      organizationId: ORG,
      locationId: LOC,
      reviews: [review({ id: "rev-1" }), review({ id: "rev-2" })],
    });

    expect(result.candidates).toBe(2);
    expect(result.skippedDisabled).toBe(true);
    expect(result.enqueued).toBe(0);
    expect(h.queueAdd).not.toHaveBeenCalled();
    // Nothing is even looked up past the switch — no readiness read, no dedup
    // read, no LLM call.
    expect(h.getReadiness).not.toHaveBeenCalled();
    expect(h.findReviewIds).not.toHaveBeenCalled();
  });

  it("stays dark when no settings row exists yet (absence is not consent)", async () => {
    h.getEffectiveSettings.mockResolvedValue(undefined);

    const result = await GbpReviewReplyAutoDraftService.enqueueForIngestedReviews({
      organizationId: ORG,
      locationId: LOC,
      reviews: [review()],
    });

    expect(result.skippedDisabled).toBe(true);
    expect(result.enqueued).toBe(0);
    expect(h.queueAdd).not.toHaveBeenCalled();
  });

  it("caps how many drafts one sync may queue, deferring the rest to the next run", async () => {
    // The catch-up burst: 200 unreplied reviews on a freshly-enabled location.
    // Uncapped, that is 200 LLM calls queued at once onto the concurrency-1
    // queue that also carries owner-initiated publishes.
    const reviews = Array.from({ length: 200 }, (_, i) =>
      review({ id: `rev-${i}` })
    );

    const result = await GbpReviewReplyAutoDraftService.enqueueForIngestedReviews({
      organizationId: ORG,
      locationId: LOC,
      reviews,
    });

    expect(result.candidates).toBe(200);
    expect(result.enqueued).toBe(10);
    expect(h.queueAdd).toHaveBeenCalledTimes(10);
    // Deferred, not dropped — dedup is by existing work item, so the next sync
    // re-offers these same reviews.
    expect(result.deferredOverCap).toBe(190);
    expect(h.loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining("190 replyable review(s) deferred")
    );
  });

  it("retains a failed job for less than the sync interval so it stays retryable", async () => {
    // BullMQ ignores `add` for a jobId that still exists in ANY state, including
    // `failed`. Retention longer than the daily sync would make a permanently
    // failed review un-retryable until the record aged out.
    await GbpReviewReplyAutoDraftService.enqueueForIngestedReviews({
      organizationId: ORG,
      locationId: LOC,
      reviews: [review()],
    });

    const opts = h.queueAdd.mock.calls[0][2];
    const ONE_DAY_SECONDS = 86400;
    expect(opts.removeOnFail.age).toBeLessThan(ONE_DAY_SECONDS);
  });

  it("scopes the dedup read to the caller's org + location (§11.7)", async () => {
    await GbpReviewReplyAutoDraftService.enqueueForIngestedReviews({
      organizationId: ORG,
      locationId: LOC,
      reviews: [review({ id: "rev-1" })],
    });

    // Tenant ids are the FIRST two arguments — a required part of the call, not
    // an optional filter the caller may forget.
    expect(h.findReviewIds).toHaveBeenCalledWith(ORG, LOC, ["rev-1"]);
  });

  it("never throws when the queue fails — ingestion must not break", async () => {
    h.queueAdd.mockRejectedValue(new Error("redis down"));

    const result = await GbpReviewReplyAutoDraftService.enqueueForIngestedReviews({
      organizationId: ORG,
      locationId: LOC,
      reviews: [review()],
    });

    expect(result.enqueued).toBe(0);
    expect(h.loggerError).toHaveBeenCalled();
  });
});

describe("autoDraftForReview", () => {
  it("stages a held draft via generateDraft with userId null + auto_ingest marker", async () => {
    const result = await GbpReviewReplyAutoDraftService.autoDraftForReview({
      organizationId: ORG,
      locationId: LOC,
      reviewId: "rev-1",
    });

    expect(result.drafted).toBe(true);
    expect(h.generateDraft).toHaveBeenCalledTimes(1);
    const arg = h.generateDraft.mock.calls[0][0];
    expect(arg.userId).toBeNull();
    expect(arg.reviewId).toBe("rev-1");
    expect(arg.metadata).toEqual({ trigger: "auto_ingest" });
  });

  it("skips when a work item already exists for the review", async () => {
    h.findReviewIds.mockResolvedValue(new Set(["rev-1"]));

    const result = await GbpReviewReplyAutoDraftService.autoDraftForReview({
      organizationId: ORG,
      locationId: LOC,
      reviewId: "rev-1",
    });

    expect(result.drafted).toBe(false);
    expect(result.reason).toBe("already_drafted");
    expect(h.generateDraft).not.toHaveBeenCalled();
  });

  it("scopes its own dedup read to the job's org + location (§11.7)", async () => {
    await GbpReviewReplyAutoDraftService.autoDraftForReview({
      organizationId: ORG,
      locationId: LOC,
      reviewId: "rev-1",
    });

    expect(h.findReviewIds).toHaveBeenCalledWith(ORG, LOC, ["rev-1"]);
  });

  it("treats a no-longer-applicable outcome as a clean skip, not a retry", async () => {
    h.generateDraft.mockRejectedValue(
      new GbpAutomationError("GBP_NOT_READY", "GBP review replies are not ready.")
    );

    const result = await GbpReviewReplyAutoDraftService.autoDraftForReview({
      organizationId: ORG,
      locationId: LOC,
      reviewId: "rev-1",
    });

    expect(result.drafted).toBe(false);
    expect(result.reason).toBe("GBP_NOT_READY");
  });

  it("rethrows an unexpected generation failure so BullMQ retries", async () => {
    h.generateDraft.mockRejectedValue(new Error("LLM timeout"));

    await expect(
      GbpReviewReplyAutoDraftService.autoDraftForReview({
        organizationId: ORG,
        locationId: LOC,
        reviewId: "rev-1",
      })
    ).rejects.toThrow("LLM timeout");
  });
});
