/**
 * Rehearsal — the GBP review-reply done-for-you loop, deploy + attribute step.
 *
 * Proves the loop's value moment RUNS end-to-end without a real Google account:
 * given an approved, deploying work item on a ready location, deployNow posts the
 * reply to Google (stubbed, so no network escapes) and fires the owner-facing,
 * plain-language, felt-AND-attributed notification. This turns "structurally
 * wired" into "logic proven to run." It does NOT prove the real Google API or the
 * SQL queries (mocked at the model seam) — that stays Dave's runtime truth-gate
 * with a live connection.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  replyToGbpReview: vi.fn(),
  getOAuth: vi.fn(),
  assertActive: vi.fn(),
  notificationCreate: vi.fn(),
  getReadiness: vi.fn(),
  validateSafety: vi.fn(),
  findWorkItem: vi.fn(),
  markPublished: vi.fn(),
  createAttempt: vi.fn(),
  markSucceeded: vi.fn(),
  findReview: vi.fn(),
  updateReplyFields: vi.fn(),
  findProperty: vi.fn(),
}));

// Stub the two Google touchpoints so NO real network request can escape.
vi.mock("../controllers/gbp/gbp-services/gbp-write.service", () => ({
  replyToGbpReview: h.replyToGbpReview,
}));
vi.mock("../auth/oauth2Helper", () => ({
  getValidOAuth2ClientByConnection: h.getOAuth,
}));
vi.mock("../services/OrganizationLifecycleService", () => ({
  OrganizationLifecycleService: { assertActive: h.assertActive },
  OrganizationArchivedError: class OrganizationArchivedError extends Error {},
}));
vi.mock("../controllers/gbp-automation/feature-services/GbpNotificationService", () => ({
  GbpNotificationService: { create: h.notificationCreate },
}));
vi.mock("../controllers/gbp-automation/feature-services/GbpReadinessService", () => ({
  GbpReadinessService: { getLocationReadiness: h.getReadiness },
}));
vi.mock("../controllers/gbp-automation/feature-services/GbpContentSafetyService", () => ({
  GbpContentSafetyService: { validateReviewReply: h.validateSafety },
}));
vi.mock("../models/GbpWorkItemModel", () => ({
  GbpWorkItemModel: { findById: h.findWorkItem, markPublished: h.markPublished },
}));
vi.mock("../models/GbpDeploymentAttemptModel", () => ({
  GbpDeploymentAttemptModel: {
    createRunningNext: h.createAttempt,
    markSucceeded: h.markSucceeded,
    markFailed: vi.fn(),
  },
}));
vi.mock("../models/website-builder/ReviewModel", () => ({
  ReviewModel: { findById: h.findReview, updateReplyFields: h.updateReplyFields },
}));
vi.mock("../models/GooglePropertyModel", () => ({
  GooglePropertyModel: { findById: h.findProperty },
}));

import { GbpReviewReplyDeploymentService } from "../controllers/gbp-automation/feature-services/GbpReviewReplyDeploymentService";

const APPROVED_CONTENT =
  "Thank you so much for the kind words, we loved having you in.";
const REVIEW_NAME = "accounts/1/locations/2/reviews/3";

beforeEach(() => {
  vi.clearAllMocks();
  h.findWorkItem.mockResolvedValue({
    id: "wi-1",
    organization_id: 7,
    location_id: 5,
    status: "deploying",
    source_review_id: "rev-1",
    google_property_id: "prop-1",
    approved_content: APPROVED_CONTENT,
    draft_content: null,
  });
  h.assertActive.mockResolvedValue(undefined);
  h.createAttempt.mockResolvedValue({ id: "attempt-1" });
  h.getReadiness.mockResolvedValue({ ready: true, googleProperty: { id: "prop-1" } });
  h.findReview.mockResolvedValue({ id: "rev-1", google_review_name: REVIEW_NAME });
  h.validateSafety.mockReturnValue({ isSafe: true, reasons: [] });
  h.findProperty.mockResolvedValue({ id: "prop-1", google_connection_id: 31 });
  h.getOAuth.mockResolvedValue({ __fakeAuth: true });
  h.replyToGbpReview.mockResolvedValue({
    resourceName: `${REVIEW_NAME}/reply`,
    response: { ok: true },
  });
  h.markPublished.mockResolvedValue(1);
  h.markSucceeded.mockResolvedValue(undefined);
  h.updateReplyFields.mockResolvedValue(undefined);
  h.notificationCreate.mockResolvedValue(1);
});

describe("review-reply loop rehearsal — deploy + attribute", () => {
  it("posts the approved reply to Google and fires the attributed owner notification, with no real Google call", async () => {
    await GbpReviewReplyDeploymentService.deployNow("wi-1", 99);

    // POST — the reply reaches Google exactly once, with the real review name and
    // the owner-approved content (and the stub proves no network escaped).
    expect(h.replyToGbpReview).toHaveBeenCalledTimes(1);
    expect(h.replyToGbpReview).toHaveBeenCalledWith(
      { __fakeAuth: true },
      REVIEW_NAME,
      APPROVED_CONTENT,
    );

    // STATE — the loop's transitions ran: published, attempt succeeded, review updated.
    expect(h.markPublished).toHaveBeenCalledTimes(1);
    expect(h.markSucceeded).toHaveBeenCalledTimes(1);
    expect(h.updateReplyFields).toHaveBeenCalledWith(
      "rev-1",
      APPROVED_CONTENT,
      expect.any(Date),
    );

    // ATTRIBUTE — the owner gets the plain-language, felt + attributed notification.
    expect(h.notificationCreate).toHaveBeenCalledTimes(1);
    const notif = h.notificationCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(notif).toMatchObject({
      organizationId: 7,
      locationId: 5,
      kind: "gbp_reply_published",
      title: "Alloro replied to a review for you",
    });
    expect(String(notif.message)).toContain("Alloro");
  });

  it("refuses to post or attribute when the location is not ready (honest gate)", async () => {
    h.getReadiness.mockResolvedValue({ ready: false, googleProperty: null });

    await GbpReviewReplyDeploymentService.deployNow("wi-1", 99).catch(() => undefined);

    // No Google call, and crucially no false "Alloro replied for you" notification.
    expect(h.replyToGbpReview).not.toHaveBeenCalled();
    expect(h.notificationCreate).not.toHaveBeenCalled();
  });
});
