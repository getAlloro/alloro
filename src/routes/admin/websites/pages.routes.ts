/**
 * Admin Websites — Project Pages sub-router
 *
 * Page version lifecycle: list/create, artifact uploads, publish, draft clone,
 * AI edit, version history/restore, single-page CRUD, plus the layout AI editor.
 *
 * Mounted by `../websites.ts` AFTER the super-admin auth hoist, so every route
 * inherits `[authenticateToken, superAdminMiddleware]`. Each route additionally
 * re-applies `...adminWebsiteAuth` inline (idempotent) — preserved verbatim from
 * the original file. The two artifact routes keep their `artifactUpload` multer
 * middleware. Literal sub-paths (`display-name`, `by-path`) and the version /
 * artifact / publish sub-paths precede the `/:id/pages/:pageId` matcher.
 */

import express from "express";
import multer from "multer";
import * as controller from "../../../controllers/admin-websites/AdminWebsitesController";
import { authenticateToken } from "../../../middleware/auth";
import { superAdminMiddleware } from "../../../middleware/superAdmin";

const router = express.Router();
const adminWebsiteAuth = [authenticateToken, superAdminMiddleware];

// Multer for artifact page zip uploads (memory storage, 200 MB limit)
const artifactUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

// =====================================================================
// PROJECT PAGES
// =====================================================================

// PATCH /:id/pages/display-name — Update page display name (before :pageId)
router.patch("/:id/pages/display-name", ...adminWebsiteAuth, controller.updatePageDisplayName);

// DELETE /:id/pages/by-path — Delete all versions at path (before :pageId)
router.delete("/:id/pages/by-path", ...adminWebsiteAuth, controller.deletePagesByPath);

// GET  /:id/pages — List project pages
router.get("/:id/pages", ...adminWebsiteAuth, controller.listPages);

// POST /:id/pages — Create page version
router.post("/:id/pages", ...adminWebsiteAuth, controller.createPage);

// POST /:id/pages/artifact — Upload artifact page (React app zip) — before :pageId
router.post("/:id/pages/artifact", ...adminWebsiteAuth, artifactUpload.single("file"), controller.uploadArtifactPage);

// PUT /:id/pages/:pageId/artifact — Replace artifact page build
router.put("/:id/pages/:pageId/artifact", ...adminWebsiteAuth, artifactUpload.single("file"), controller.replaceArtifactBuild);

// POST /:id/pages/:pageId/publish — Publish a page
router.post("/:id/pages/:pageId/publish", ...adminWebsiteAuth, controller.publishPage);

// POST /:id/pages/:pageId/create-draft — Clone published to draft
router.post("/:id/pages/:pageId/create-draft", ...adminWebsiteAuth, controller.createDraft);

// POST /:id/pages/:pageId/edit — AI edit page component
router.post("/:id/pages/:pageId/edit", ...adminWebsiteAuth, controller.editPageComponent);

// GET  /:id/pages/:pageId/versions — List versions at the page's path
router.get("/:id/pages/:pageId/versions", ...adminWebsiteAuth, controller.listPageVersions);

// GET  /:id/pages/:pageId/versions/:versionId — Get version content
router.get("/:id/pages/:pageId/versions/:versionId", ...adminWebsiteAuth, controller.getPageVersionContent);

// POST /:id/pages/:pageId/versions/:versionId/restore — Restore version into draft
router.post("/:id/pages/:pageId/versions/:versionId/restore", ...adminWebsiteAuth, controller.restorePageVersion);

// GET  /:id/pages/:pageId — Get single page
router.get("/:id/pages/:pageId", ...adminWebsiteAuth, controller.getPage);

// PATCH /:id/pages/:pageId — Update draft page
router.patch("/:id/pages/:pageId", ...adminWebsiteAuth, controller.updatePage);

// DELETE /:id/pages/:pageId — Delete page version
router.delete("/:id/pages/:pageId", ...adminWebsiteAuth, controller.deletePage);

// =====================================================================
// LAYOUT EDITOR — AI EDIT
// =====================================================================

// POST /:id/edit-layout — AI edit layout component
router.post("/:id/edit-layout", ...adminWebsiteAuth, controller.editLayoutComponent);

export default router;
