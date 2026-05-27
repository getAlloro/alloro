import express, { NextFunction, Request, Response } from "express";
import multer from "multer";
import { AdminGbpAutomationController } from "../../controllers/gbp-automation/AdminGbpAutomationController";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";

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
      void AdminGbpAutomationController.uploadPostMedia(req, res).catch(next);
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

router.use(authenticateToken, superAdminMiddleware);

router.get("/organizations/:organizationId/readiness", AdminGbpAutomationController.readiness);
router.get("/organizations/:organizationId/work-items", AdminGbpAutomationController.list);
router.put("/organizations/:organizationId/settings", AdminGbpAutomationController.updateSettings);

router.post(
  "/organizations/:organizationId/reviews/sync",
  AdminGbpAutomationController.syncReviews
);
router.get(
  "/organizations/:organizationId/posts/published",
  AdminGbpAutomationController.listPublishedPosts
);
router.post(
  "/organizations/:organizationId/posts/published/sync",
  AdminGbpAutomationController.syncPublishedPosts
);
router.patch(
  "/organizations/:organizationId/posts/published",
  AdminGbpAutomationController.updatePublishedPost
);
router.delete(
  "/organizations/:organizationId/posts/published",
  AdminGbpAutomationController.deletePublishedPost
);
router.post(
  "/organizations/:organizationId/posts/media",
  handlePostImageUpload
);
router.post(
  "/organizations/:organizationId/posts/generate",
  AdminGbpAutomationController.generatePostDraftNow
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
  "/organizations/:organizationId/work-items/:id/regenerate-post",
  AdminGbpAutomationController.regeneratePostDraft
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
