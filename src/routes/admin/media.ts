/**
 * Admin Media API Routes
 *
 * CRUD operations for website_builder.media - project media uploads
 * with S3 storage, quota enforcement, and usage tracking
 *
 * Features:
 * - Bulk upload (up to 20 files)
 * - Image processing (WebP conversion, thumbnails via Sharp)
 * - Video uploads (no thumbnail extraction, stored as-is)
 * - PDF uploads (stored as-is)
 * - 5 GB quota per project
 * - Usage tracking (which pages reference which media)
 * - Pagination (50 items per page)
 */

import express, { NextFunction, Request, Response } from "express";
import multer from "multer";
import * as controller from "../../controllers/admin-media/AdminMediaController";

const router = express.Router({ mergeParams: true }); // Preserve :projectId param

const MAX_MEDIA_FILE_SIZE_MB = 500;
const MAX_MEDIA_FILE_SIZE_BYTES = MAX_MEDIA_FILE_SIZE_MB * 1024 * 1024;
const MAX_MEDIA_FILES_PER_REQUEST = 20;

// Multer config: memory storage, 500 MB per file, accept all files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MEDIA_FILE_SIZE_BYTES },
});
const uploadMediaFiles = upload.array("files", MAX_MEDIA_FILES_PER_REQUEST);

const handleMediaUpload = (req: Request, res: Response, next: NextFunction) => {
  uploadMediaFiles(req, res, (error: unknown) => {
    if (!error) {
      void controller.uploadMedia(req, res).catch(next);
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,
          error: "FILE_TOO_LARGE",
          message: `Each media file must be ${MAX_MEDIA_FILE_SIZE_MB} MB or smaller.`,
        });
      }

      if (error.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({
          success: false,
          error: "TOO_MANY_FILES",
          message: `Upload up to ${MAX_MEDIA_FILES_PER_REQUEST} files at a time.`,
        });
      }

      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return next(error);
  });
};

// POST /api/admin/websites/:projectId/media — Bulk media upload
router.post("/", handleMediaUpload);

// GET /api/admin/websites/:projectId/media — List media (paginated)
router.get("/", controller.listMedia);

// PATCH /api/admin/websites/:projectId/media/:mediaId — Update metadata
router.patch("/:mediaId", controller.updateMedia);

// DELETE /api/admin/websites/:projectId/media/:mediaId — Delete media
router.delete("/:mediaId", controller.deleteMedia);

export default router;
