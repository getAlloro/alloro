import express from "express";
import { GbpAutomationController } from "../controllers/gbp-automation/GbpAutomationController";
import { GbpReviewManagementController } from "../controllers/gbp-automation/GbpReviewManagementController";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware, locationScopeMiddleware } from "../middleware/rbac";

const router = express.Router();

router.use(authenticateToken, rbacMiddleware, locationScopeMiddleware);

router.get("/readiness", GbpAutomationController.getReadiness);
router.get("/work-items", GbpAutomationController.listWorkItems);
router.get("/settings", GbpAutomationController.getSettings);
router.put("/settings", GbpAutomationController.updateSettings);

router.post("/reviews/sync", GbpReviewManagementController.syncReviews);
router.post("/reviews/:reviewId/draft", GbpAutomationController.generateDraft);
router.post("/reviews/:reviewId/post-draft", GbpAutomationController.createPostDraftFromReview);
router.patch("/reviews/:reviewId/draft-slot", GbpAutomationController.saveReviewDraftSlot);
router.put("/reviews/:reviewId/escalation", GbpAutomationController.updateReviewEscalation);
router.patch(
  "/reviews/:reviewId/published-reply",
  GbpReviewManagementController.updatePublishedReply
);
router.delete(
  "/reviews/:reviewId/published-reply",
  GbpReviewManagementController.deletePublishedReply
);
router.patch("/work-items/:id", GbpAutomationController.updateDraft);
router.post("/work-items/:id/approve", GbpAutomationController.approve);
router.post("/work-items/:id/reject", GbpAutomationController.reject);
router.get("/work-items/:id/deploy-preview", GbpAutomationController.deployPreview);
router.post("/work-items/:id/deploy", GbpAutomationController.deploy);
router.post("/work-items/:id/retry", GbpAutomationController.retry);
router.get("/work-items/:id/attempts", GbpAutomationController.getAttempts);

export default router;
