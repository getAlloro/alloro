/**
 * Admin Websites — SEO sub-router
 *
 * Bulk SEO generation jobs plus per-page and per-post SEO read/generate/analyze
 * endpoints.
 *
 * Mounted by `../websites.ts` AFTER the super-admin auth hoist, so every route
 * inherits `[authenticateToken, superAdminMiddleware]`. Mounted before the
 * project-pages sub-router to preserve original registration order. Literal
 * sub-paths (`/bulk-generate/active`) precede their `:jobId` matcher.
 */

import express from "express";
import * as controller from "../../../controllers/admin-websites/SeoController";
import * as ctrHypothesisController from "../../../controllers/admin-websites/CtrHypothesisController";
import { validate } from "../../../middleware/validate";
import { ctrHypothesisBodySchema } from "../../../validation/ctrHypothesis.schemas";

const router = express.Router();

// =====================================================================
// SEO
// =====================================================================

// POST /:id/seo/bulk-generate — Start bulk SEO generation background job
router.post("/:id/seo/bulk-generate", controller.startBulkSeoGenerate);

// GET  /:id/seo/bulk-generate/active — Check for active bulk SEO job (before :jobId)
router.get("/:id/seo/bulk-generate/active", controller.getActiveBulkSeoJob);

// GET  /:id/seo/bulk-generate/:jobId/status — Poll bulk SEO generation progress
router.get("/:id/seo/bulk-generate/:jobId/status", controller.getBulkSeoStatus);

// GET  /:id/seo/all-meta — All page/post SEO titles/descriptions for uniqueness
router.get("/:id/seo/all-meta", controller.getAllSeoMeta);

// PATCH /:id/pages/:pageId/seo — Update page SEO data
router.patch("/:id/pages/:pageId/seo", controller.updatePageSeo);

// POST /:id/pages/:pageId/seo/generate — AI generate SEO for page section
router.post("/:id/pages/:pageId/seo/generate", controller.generatePageSeo);

// GET  /:id/pages/:pageId/seo/facts — List extracted practice facts for a page
router.get("/:id/pages/:pageId/seo/facts", controller.listPageFacts);

// POST /:id/pages/:pageId/seo/facts — Trigger practice-fact extraction for a page
router.post("/:id/pages/:pageId/seo/facts", controller.extractPageFacts);

// PATCH /:id/posts/:postId/seo — Update post SEO data
router.patch("/:id/posts/:postId/seo", controller.updatePostSeo);

// POST /:id/posts/:postId/seo/generate — AI generate SEO for post section
router.post("/:id/posts/:postId/seo/generate", controller.generatePostSeo);

// GET  /:id/posts/:postId/seo/facts — List extracted practice facts for a post
router.get("/:id/posts/:postId/seo/facts", controller.listPostFacts);

// POST /:id/posts/:postId/seo/facts — Trigger practice-fact extraction for a post
router.post("/:id/posts/:postId/seo/facts", controller.extractPostFacts);

// POST /:id/pages/:pageId/seo/generate-all — AI generate ALL SEO sections at once
router.post("/:id/pages/:pageId/seo/generate-all", controller.generateAllPageSeo);

// POST /:id/posts/:postId/seo/generate-all — AI generate ALL SEO sections at once
router.post("/:id/posts/:postId/seo/generate-all", controller.generateAllPostSeo);

// POST /:id/pages/:pageId/seo/analyze — AI analyze existing SEO for page section
router.post("/:id/pages/:pageId/seo/analyze", controller.analyzePageSeo);

// POST /:id/posts/:postId/seo/analyze — AI analyze existing SEO for post section
router.post("/:id/posts/:postId/seo/analyze", controller.analyzePostSeo);

// POST /:id/seo/ctr-hypothesis — Propose a metadata rewrite for one diagnosed
// CTR opportunity. Read-only: returns a proposal, writes nothing.
router.post(
  "/:id/seo/ctr-hypothesis",
  validate(ctrHypothesisBodySchema, { target: "body", mode: "enforce" }), // §11.2
  ctrHypothesisController.proposeCtrHypothesis,
);

export default router;
