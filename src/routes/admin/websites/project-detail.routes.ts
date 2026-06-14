/**
 * Admin Websites — Project Detail sub-router
 *
 * Per-project operational routes: status polling, page generation status /
 * progressive state, bulk create-from-template, cancel generation, URL probing,
 * project identity (warmup/get/update/resync/slot prefill+generate), layout
 * generation, single-section regeneration, org linking, and custom-domain
 * connect/verify/disconnect.
 *
 * Mounted by `../websites.ts` AFTER the super-admin auth hoist (every route
 * inherits `[authenticateToken, superAdminMiddleware]`) and BEFORE the project
 * `/:id` catch-all and the project-pages sub-router, matching original order.
 * The `regenerate-component` route re-applies `...adminWebsiteAuth` inline
 * (idempotent) — preserved verbatim. Literal `/:id/pages/generation-status`
 * precedes the `:pageId` matchers declared in the pages sub-router.
 */

import express from "express";
import * as controller from "../../../controllers/admin-websites/ProjectDetailController";
import { authenticateToken } from "../../../middleware/auth";
import { superAdminMiddleware } from "../../../middleware/superAdmin";

const router = express.Router();
const adminWebsiteAuth = [authenticateToken, superAdminMiddleware];

// =====================================================================
// PROJECTS (parameterized routes — must come after literal paths)
// =====================================================================

// GET  /:id/status — Lightweight status polling
router.get("/:id/status", controller.getProjectStatus);

// GET  /:id/pages/generation-status — Per-page generation status (before /:id/pages/:pageId)
router.get("/:id/pages/generation-status", controller.getPagesGenerationStatus);

// GET  /:id/pages/:pageId/progressive-state — Template scaffolding + generated sections so far
router.get("/:id/pages/:pageId/progressive-state", controller.getPageProgressiveState);

// POST /:id/create-all-from-template — Bulk create all pages from template
router.post("/:id/create-all-from-template", controller.createAllFromTemplate);

// POST /:id/cancel-generation — Cancel all in-progress page generation
router.post("/:id/cancel-generation", controller.cancelGeneration);

// =====================================================================
// PROJECT IDENTITY
// =====================================================================

// POST /:id/test-url — Probe a URL for block/CAPTCHA signals
router.post("/:id/test-url", controller.testUrl);

// POST /:id/identity/warmup — Enqueue identity warmup job
router.post("/:id/identity/warmup", controller.startIdentityWarmup);

// GET  /:id/identity — Full project identity JSON
router.get("/:id/identity", controller.getIdentity);

// GET  /:id/identity/status — Lightweight warmup status polling
router.get("/:id/identity/status", controller.getIdentityStatus);

// PUT  /:id/identity — Replace identity with admin-edited JSON
router.put("/:id/identity", controller.updateIdentity);

// POST /:id/identity/resync-list — Re-run doctor/service extraction against cached pages
router.post("/:id/identity/resync-list", controller.resyncIdentityList);

// GET /:id/slot-prefill — Pre-filled slot values from project_identity
router.get("/:id/slot-prefill", controller.getSlotPrefill);

// POST /:id/slot-generate — LLM-fill text slots using identity context
router.post("/:id/slot-generate", controller.generateSlotValues);

// POST /:id/generate-layouts — Enqueue layouts generation
router.post("/:id/generate-layouts", controller.startLayoutGeneration);

// GET /:id/layouts-status — Layouts generation status polling
router.get("/:id/layouts-status", controller.getLayoutsStatus);

// POST /:id/pages/:pageId/regenerate-component — Regenerate a single section
router.post(
  "/:id/pages/:pageId/regenerate-component",
  ...adminWebsiteAuth,
  controller.regeneratePageComponent,
);

// PATCH /:id/link-organization — Link/unlink org
router.patch("/:id/link-organization", controller.linkOrganization);

// POST /:id/connect-domain — Connect a custom domain
router.post("/:id/connect-domain", controller.connectDomainHandler);

// POST /:id/verify-domain — Verify DNS for custom domain
router.post("/:id/verify-domain", controller.verifyDomainHandler);

// DELETE /:id/disconnect-domain — Disconnect custom domain
router.delete("/:id/disconnect-domain", controller.disconnectDomainHandler);

export default router;
