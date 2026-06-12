/**
 * User Website Routes
 *
 * DFY-tier user-facing website endpoints:
 * - GET  / — Fetch organization website data
 * - GET  /media — List organization website media
 * - POST /media — Upload organization website media
 * - POST /pages/:pageId/edit — AI-powered page component edit
 */

import express, { NextFunction, Response } from "express";
import multer from "multer";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, requireRole } from "../../middleware/rbac";
import type { RBACRequest } from "../../middleware/rbac";
import * as controller from "../../controllers/user-website/UserWebsiteController";

const userWebsiteRoutes = express.Router();

const MAX_MEDIA_FILE_SIZE_MB = 500;
const MAX_MEDIA_FILE_SIZE_BYTES = MAX_MEDIA_FILE_SIZE_MB * 1024 * 1024;
const MAX_MEDIA_FILES_PER_REQUEST = 20;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MEDIA_FILE_SIZE_BYTES },
});
const uploadMediaFiles = upload.array("files", MAX_MEDIA_FILES_PER_REQUEST);

const handleMediaUpload = (
  req: RBACRequest,
  res: Response,
  next: NextFunction,
) => {
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

userWebsiteRoutes.get(
  "/",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.getUserWebsite
);

userWebsiteRoutes.get(
  "/media",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.listMedia
);

userWebsiteRoutes.post(
  "/media",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  handleMediaUpload
);

userWebsiteRoutes.get(
  "/gsc/connections",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.listGscConnections
);

userWebsiteRoutes.get(
  "/gsc/sites",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.listGscSites
);

userWebsiteRoutes.get(
  "/gsc/performance",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.getGscPerformance
);

userWebsiteRoutes.get(
  "/gsc",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.getGscIntegration
);

userWebsiteRoutes.post(
  "/gsc",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin"),
  controller.saveGscIntegration
);

userWebsiteRoutes.post(
  "/pages/:pageId/edit",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.editPageComponent
);

userWebsiteRoutes.post(
  "/resolve-preview",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.resolvePreview
);

userWebsiteRoutes.patch(
  "/pages/:pageId/save",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.savePageSections
);

// Version history
userWebsiteRoutes.get(
  "/pages/:pageId/versions",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.getPageVersions
);

userWebsiteRoutes.get(
  "/pages/:pageId/versions/:versionId",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.getPageVersionContent
);

userWebsiteRoutes.post(
  "/pages/:pageId/versions/:versionId/restore",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.restorePageVersion
);

// Recipients
userWebsiteRoutes.get(
  "/recipients",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.getRecipients
);

userWebsiteRoutes.put(
  "/recipients",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin"),
  controller.updateRecipients
);

userWebsiteRoutes.get(
  "/forms/catalog",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.listFormCatalog
);

userWebsiteRoutes.put(
  "/forms/recipients",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin"),
  controller.updateFormRecipientRule
);

userWebsiteRoutes.put(
  "/forms/preferences",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin"),
  controller.updateFormPreferences
);

// Analytics (Rybbit)
userWebsiteRoutes.get(
  "/analytics",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.getWebsiteAnalytics
);

// Form submissions
userWebsiteRoutes.get(
  "/form-submissions/stats",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.getFormSubmissionStats
);

userWebsiteRoutes.patch(
  "/form-submissions/mark-all-read",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.markAllFormSubmissionsRead
);

userWebsiteRoutes.get(
  "/form-submissions/export",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.exportFormSubmissions
);

userWebsiteRoutes.get(
  "/form-submissions/timeseries",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.getFormSubmissionsTimeseries
);

userWebsiteRoutes.get(
  "/form-submissions",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.listFormSubmissions
);

userWebsiteRoutes.get(
  "/form-submissions/:id",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.getFormSubmission
);

userWebsiteRoutes.patch(
  "/form-submissions/:id/read",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.toggleFormSubmissionRead
);

userWebsiteRoutes.delete(
  "/form-submissions/:id",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.deleteFormSubmission
);

// Posts
userWebsiteRoutes.get(
  "/posts",
  authenticateToken, rbacMiddleware, requireRole("admin", "manager"),
  controller.listPosts
);
userWebsiteRoutes.post(
  "/posts",
  authenticateToken, rbacMiddleware, requireRole("admin", "manager"),
  controller.createUserPost
);
userWebsiteRoutes.get(
  "/posts/:postId",
  authenticateToken, rbacMiddleware, requireRole("admin", "manager"),
  controller.getPost
);
userWebsiteRoutes.patch(
  "/posts/:postId",
  authenticateToken, rbacMiddleware, requireRole("admin", "manager"),
  controller.updateUserPost
);
userWebsiteRoutes.delete(
  "/posts/:postId",
  authenticateToken, rbacMiddleware, requireRole("admin", "manager"),
  controller.deleteUserPost
);
userWebsiteRoutes.patch(
  "/posts/:postId/seo",
  authenticateToken, rbacMiddleware, requireRole("admin", "manager"),
  controller.updateUserPostSeo
);

// Post types (read-only)
userWebsiteRoutes.get(
  "/post-types",
  authenticateToken, rbacMiddleware, requireRole("admin", "manager"),
  controller.listPostTypes
);

// Categories & Tags
userWebsiteRoutes.get(
  "/post-types/:postTypeId/categories",
  authenticateToken, rbacMiddleware, requireRole("admin", "manager"),
  controller.listCategories
);
userWebsiteRoutes.post(
  "/post-types/:postTypeId/categories",
  authenticateToken, rbacMiddleware, requireRole("admin", "manager"),
  controller.createUserCategory
);
userWebsiteRoutes.get(
  "/post-types/:postTypeId/tags",
  authenticateToken, rbacMiddleware, requireRole("admin", "manager"),
  controller.listTags
);
userWebsiteRoutes.post(
  "/post-types/:postTypeId/tags",
  authenticateToken, rbacMiddleware, requireRole("admin", "manager"),
  controller.createUserTag
);

// Menus
userWebsiteRoutes.patch(
  "/menus/:menuId/items/reorder",
  authenticateToken, rbacMiddleware, requireRole("admin", "manager"),
  controller.reorderUserMenuItems
);
userWebsiteRoutes.get(
  "/menus",
  authenticateToken, rbacMiddleware, requireRole("admin", "manager"),
  controller.listUserMenus
);
userWebsiteRoutes.post(
  "/menus",
  authenticateToken, rbacMiddleware, requireRole("admin", "manager"),
  controller.createUserMenu
);
userWebsiteRoutes.get(
  "/menus/:menuId",
  authenticateToken, rbacMiddleware, requireRole("admin", "manager"),
  controller.getUserMenu
);
userWebsiteRoutes.patch(
  "/menus/:menuId",
  authenticateToken, rbacMiddleware, requireRole("admin", "manager"),
  controller.updateUserMenu
);
userWebsiteRoutes.delete(
  "/menus/:menuId",
  authenticateToken, rbacMiddleware, requireRole("admin", "manager"),
  controller.deleteUserMenu
);
userWebsiteRoutes.post(
  "/menus/:menuId/items",
  authenticateToken, rbacMiddleware, requireRole("admin", "manager"),
  controller.createUserMenuItem
);
userWebsiteRoutes.patch(
  "/menus/:menuId/items/:itemId",
  authenticateToken, rbacMiddleware, requireRole("admin", "manager"),
  controller.updateUserMenuItem
);
userWebsiteRoutes.delete(
  "/menus/:menuId/items/:itemId",
  authenticateToken, rbacMiddleware, requireRole("admin", "manager"),
  controller.deleteUserMenuItem
);

// Custom domain
userWebsiteRoutes.post(
  "/domain/connect",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.connectDomain
);

userWebsiteRoutes.post(
  "/domain/verify",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.verifyDomain
);

userWebsiteRoutes.delete(
  "/domain/disconnect",
  authenticateToken,
  rbacMiddleware,
  requireRole("admin", "manager"),
  controller.disconnectDomain
);

export default userWebsiteRoutes;
