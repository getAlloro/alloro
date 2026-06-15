/**
 * Admin Websites API Routes
 *
 * Portal to manage website-builder data from the admin panel.
 * Reads/writes to the website_builder schema tables.
 *
 * This file is a THIN mounter. The endpoint implementations are registered in
 * resource-scoped sub-routers under `./websites/*.routes.ts`; this module wires
 * them onto a single router in the exact order they were originally declared so
 * the external path surface and path-to-regexp match precedence are unchanged.
 *
 * Auth: the public N8N generation-status callback is declared FIRST (before the
 * auth hoist). Then `router.use(...adminWebsiteAuth)` hoists super-admin auth
 * onto everything below — including every mounted sub-router and the `/imports`
 * sub-router. Individual sub-routers that re-apply `...adminWebsiteAuth` /
 * `...adminGscAuth` inline keep doing so (idempotent), preserving prior behavior.
 */

import express from "express";
import * as controller from "../../controllers/admin-websites/ProjectsController";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import importsRouter from "./imports";
import aiCommandRouter from "./websites/ai-command.routes";
import backupsRouter from "./websites/backups.routes";
import codeSnippetsRouter from "./websites/code-snippets.routes";
import costsRouter from "./websites/costs.routes";
import formSubmissionsRouter from "./websites/form-submissions.routes";
import identitySliceRouter from "./websites/identity-slice.routes";
import integrationsRouter from "./websites/integrations.routes";
import locationsRouter from "./websites/locations.routes";
import menusRouter from "./websites/menus.routes";
import pagesRouter from "./websites/pages.routes";
import postImportRouter from "./websites/post-import.routes";
import postsRouter from "./websites/posts.routes";
import projectDetailRouter from "./websites/project-detail.routes";
import recipientsRouter from "./websites/recipients.routes";
import redirectsRouter from "./websites/redirects.routes";
import reviewsRouter from "./websites/reviews.routes";
import seoRouter from "./websites/seo.routes";
import templatesRouter from "./websites/templates.routes";

const router = express.Router();
const adminWebsiteAuth = [authenticateToken, superAdminMiddleware];

// =====================================================================
// MACHINE CALLBACK (PUBLIC — must be declared BEFORE the auth hoist and before
// the /:id routes). This is an inbound N8N callback that reports page-generation
// status; it does not carry a super-admin JWT. It stays unauthenticated to
// preserve the pipeline. (Residual exposure — a dedicated internal-key gate is
// follow-up work, intentionally out of scope for this hotfix.)
// =====================================================================

// PATCH /pages/:pageId/generation-status — N8N callback to update page status
router.patch("/pages/:pageId/generation-status", controller.updatePageGenerationStatus);

// =====================================================================
// AUTH HOIST — every route below requires authenticated super-admin. Replaces
// the per-route `...adminWebsiteAuth` spreads (which remain idempotent if still
// present) and also covers the mounted imports sub-router at the bottom.
// =====================================================================
router.use(...adminWebsiteAuth);

// =====================================================================
// PROJECTS (non-parameterized routes first)
// =====================================================================

// GET  / — List all projects with pagination
router.get("/", controller.listProjects);

// POST / — Create a new website project
router.post("/", controller.createProject);

// GET  /statuses — Get unique statuses
router.get("/statuses", controller.getStatuses);

// POST /start-pipeline — Trigger N8N webhook (admin-triggered, now guarded)
router.post("/start-pipeline", controller.startPipeline);

// =====================================================================
// TEMPLATES + post taxonomy + template sub-resources
// =====================================================================
router.use(templatesRouter);

// =====================================================================
// PAGE EDITOR — SYSTEM PROMPT
// =====================================================================

// GET /editor/system-prompt — Get page editor system prompt
router.get("/editor/system-prompt", ...adminWebsiteAuth, controller.getEditorSystemPrompt);

// =====================================================================
// WEBSITE SCRAPE
// =====================================================================

// POST /scrape — Scrape website for content
router.post("/scrape", controller.scrapeWebsite);

// =====================================================================
// IMPORTS (sub-router — must come before parameterized /:id routes)
// =====================================================================

router.use("/imports", importsRouter);

// =====================================================================
// BACKUPS (before other /:id parameterized routes)
// =====================================================================
router.use(backupsRouter);

// =====================================================================
// PROJECT DETAIL (parameterized — status/identity/domain/etc.)
// =====================================================================
router.use(projectDetailRouter);

// =====================================================================
// RECIPIENTS + per-form recipient rules/preferences
// =====================================================================
router.use(recipientsRouter);

// =====================================================================
// FORM SUBMISSIONS
// =====================================================================
router.use(formSubmissionsRouter);

// =====================================================================
// WEBSITE INTEGRATIONS (CRM + analytics connectors)
// =====================================================================
router.use(integrationsRouter);

// =====================================================================
// REVIEW SYNC (project-scoped)
// =====================================================================
router.use(reviewsRouter);

// =====================================================================
// PROJECT POSTS
// =====================================================================
router.use(postsRouter);

// =====================================================================
// PROJECT MENUS
// =====================================================================
router.use(menusRouter);

// =====================================================================
// SEO
// =====================================================================
router.use(seoRouter);

// =====================================================================
// PROJECT PAGES + layout editor
// =====================================================================
router.use(pagesRouter);

// =====================================================================
// PROJECT HFCM (code snippets)
// =====================================================================
router.use(codeSnippetsRouter);

// =====================================================================
// REDIRECTS
// =====================================================================
router.use(redirectsRouter);

// =====================================================================
// AI COMMAND
// =====================================================================
router.use(aiCommandRouter);

// =====================================================================
// COSTS — per-project AI cost rollup
// =====================================================================
router.use(costsRouter);

// =====================================================================
// PROJECTS (parameterized — last to avoid matching other routes)
// =====================================================================

// GET  /:id — Get single project with pages
router.get("/:id", ...adminWebsiteAuth, controller.getProject);

// PATCH /:id — Update project
router.patch("/:id", controller.updateProject);

// DELETE /:id — Delete project (cascade pages)
router.delete("/:id", controller.deleteProject);

// =====================================================================
// LOCATIONS — F3 (multi-location management for IdentityModal Locations tab)
// =====================================================================
//
// Express's `/:id` matcher above does NOT swallow `/:id/locations`
// (path-to-regexp anchors `/:id` to end-of-path), so registration order is
// safe even after the `/:id` catch-all.
router.use(locationsRouter);

// =====================================================================
// POST IMPORT FROM IDENTITY — T8 + F4
// =====================================================================
//
// The `/:projectId/posts/import` paths sit deeper than the catch-all `/:id`
// GET above, so Express's path-to-regexp does not match them against the
// project-detail handler.
router.use(postImportRouter);

// =====================================================================
// IDENTITY SLICE PATCH — T3
// =====================================================================
//
// `/:id/identity/slice` anchors after `/:id/identity/` so it does not collide
// with the catch-all `/:id` matcher above.
router.use(identitySliceRouter);

// =====================================================================
// EXPORTS
// =====================================================================

export default router;
