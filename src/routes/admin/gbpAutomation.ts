import express from "express";
import { AdminGbpAutomationController } from "../../controllers/gbp-automation/AdminGbpAutomationController";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";

const router = express.Router();

router.use(authenticateToken, superAdminMiddleware);

router.get("/organizations/:organizationId/readiness", AdminGbpAutomationController.readiness);
router.get("/organizations/:organizationId/work-items", AdminGbpAutomationController.list);
router.put("/organizations/:organizationId/settings", AdminGbpAutomationController.updateSettings);

router.post(
  "/organizations/:organizationId/reviews/sync",
  AdminGbpAutomationController.syncReviews
);
router.post(
  "/organizations/:organizationId/reviews/:reviewId/draft",
  AdminGbpAutomationController.generateDraft
);
router.post(
  "/organizations/:organizationId/reviews/:reviewId/post-draft",
  AdminGbpAutomationController.createPostDraftFromReview
);
router.patch(
  "/organizations/:organizationId/reviews/:reviewId/draft-slot",
  AdminGbpAutomationController.saveReviewDraftSlot
);
router.put(
  "/organizations/:organizationId/reviews/:reviewId/escalation",
  AdminGbpAutomationController.updateReviewEscalation
);
router.patch(
  "/organizations/:organizationId/reviews/:reviewId/published-reply",
  AdminGbpAutomationController.updatePublishedReply
);
router.delete(
  "/organizations/:organizationId/reviews/:reviewId/published-reply",
  AdminGbpAutomationController.deletePublishedReply
);
router.patch(
  "/organizations/:organizationId/work-items/:id",
  AdminGbpAutomationController.updateDraft
);
router.post(
  "/organizations/:organizationId/work-items/:id/approve",
  AdminGbpAutomationController.approve
);
router.post(
  "/organizations/:organizationId/work-items/:id/reject",
  AdminGbpAutomationController.reject
);
router.get(
  "/organizations/:organizationId/work-items/:id/deploy-preview",
  AdminGbpAutomationController.deployPreview
);
router.post(
  "/organizations/:organizationId/work-items/:id/deploy",
  AdminGbpAutomationController.deploy
);
router.post(
  "/organizations/:organizationId/work-items/:id/retry",
  AdminGbpAutomationController.retry
);
router.get(
  "/organizations/:organizationId/work-items/:id/attempts",
  AdminGbpAutomationController.getAttempts
);

export default router;
