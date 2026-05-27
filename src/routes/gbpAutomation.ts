import express, { NextFunction, Request, Response } from "express";
import multer from "multer";
import { GbpAutomationController } from "../controllers/gbp-automation/GbpAutomationController";
import { GbpReviewManagementController } from "../controllers/gbp-automation/GbpReviewManagementController";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware, locationScopeMiddleware } from "../middleware/rbac";

const router = express.Router();
const MAX_GBP_POST_IMAGE_SIZE_MB = 25;
const MAX_GBP_POST_IMAGE_SIZE_BYTES = MAX_GBP_POST_IMAGE_SIZE_MB * 1024 * 1024;

const postImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_GBP_POST_IMAGE_SIZE_BYTES, files: 1 },
});

function uploadError(
  res: Response,
  status: number,
  code: string,
  message: string
): Response {
  return res.status(status).json({
    success: false,
    data: null,
    error: { code, message, details: null },
  });
}

const handlePostImageUpload = (req: Request, res: Response, next: NextFunction) => {
  postImageUpload.single("file")(req, res, (error: unknown) => {
    if (!error) {
      void GbpAutomationController.uploadPostMedia(req, res).catch(next);
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return uploadError(
          res,
          413,
          "GBP_POST_IMAGE_TOO_LARGE",
          `Post image must be ${MAX_GBP_POST_IMAGE_SIZE_MB} MB or smaller.`
        );
      }

      return uploadError(res, 400, error.code, error.message);
    }

    return next(error);
  });
};

router.use(authenticateToken, rbacMiddleware, locationScopeMiddleware);

router.get("/readiness", GbpAutomationController.getReadiness);
router.get("/work-items", GbpAutomationController.listWorkItems);
router.get("/settings", GbpAutomationController.getSettings);
router.put("/settings", GbpAutomationController.updateSettings);

router.post("/reviews/sync", GbpReviewManagementController.syncReviews);
router.get("/posts/published", GbpAutomationController.listPublishedPosts);
router.post("/posts/published/sync", GbpAutomationController.syncPublishedPosts);
router.patch("/posts/published", GbpAutomationController.updatePublishedPost);
router.delete("/posts/published", GbpAutomationController.deletePublishedPost);
router.post("/posts/media", handlePostImageUpload);
router.post("/posts/generate", GbpAutomationController.generatePostDraftNow);
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
router.post("/work-items/:id/regenerate-post", GbpAutomationController.regeneratePostDraft);
router.post("/work-items/:id/approve", GbpAutomationController.approve);
router.post("/work-items/:id/reject", GbpAutomationController.reject);
router.get("/work-items/:id/deploy-preview", GbpAutomationController.deployPreview);
router.post("/work-items/:id/deploy", GbpAutomationController.deploy);
router.post("/work-items/:id/retry", GbpAutomationController.retry);
router.get("/work-items/:id/attempts", GbpAutomationController.getAttempts);

export default router;
