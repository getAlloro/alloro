/**
 * Admin Websites — Project HFCM (code snippets) sub-router
 *
 * Project-scoped header/footer code-snippet CRUD plus reorder and per-snippet
 * toggle. Path param is `:projectId` (matching the original file).
 *
 * Mounted by `../websites.ts` AFTER the super-admin auth hoist, so every route
 * inherits `[authenticateToken, superAdminMiddleware]`. The `reorder` and
 * `:id/toggle` literals precede the `:id` matcher, matching original order.
 */

import express from "express";
import * as controller from "../../../controllers/admin-websites/AdminWebsitesController";

const router = express.Router();

// =====================================================================
// PROJECT HFCM
// =====================================================================

// PATCH /:projectId/code-snippets/reorder — Reorder (before :id)
router.patch("/:projectId/code-snippets/reorder", controller.reorderProjectSnippets);

// GET  /:projectId/code-snippets — List project snippets
router.get("/:projectId/code-snippets", controller.listProjectSnippets);

// POST /:projectId/code-snippets — Create project snippet
router.post("/:projectId/code-snippets", controller.createProjectSnippet);

// PATCH /:projectId/code-snippets/:id/toggle — Toggle (before :id patch)
router.patch("/:projectId/code-snippets/:id/toggle", controller.toggleProjectSnippet);

// PATCH /:projectId/code-snippets/:id — Update project snippet
router.patch("/:projectId/code-snippets/:id", controller.updateProjectSnippet);

// DELETE /:projectId/code-snippets/:id — Delete project snippet
router.delete("/:projectId/code-snippets/:id", controller.deleteProjectSnippet);

export default router;
