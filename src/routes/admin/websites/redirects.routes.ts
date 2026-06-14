/**
 * Admin Websites — Redirects sub-router
 *
 * Project redirect list/create, bulk create, and single-redirect update/delete.
 *
 * Mounted by `../websites.ts` AFTER the super-admin auth hoist, so every route
 * inherits `[authenticateToken, superAdminMiddleware]`. The `bulk` literal
 * precedes the `:redirectId` matcher, matching original order.
 */

import express from "express";
import * as controller from "../../../controllers/admin-websites/RedirectsController";

const router = express.Router();

// =====================================================================
// REDIRECTS
// =====================================================================

// POST /:id/redirects/bulk — Bulk create redirects (before :redirectId)
router.post("/:id/redirects/bulk", controller.bulkCreateRedirects);

// GET  /:id/redirects — List redirects
router.get("/:id/redirects", controller.listRedirects);

// POST /:id/redirects — Create a redirect
router.post("/:id/redirects", controller.createRedirect);

// PATCH /:id/redirects/:redirectId — Update a redirect
router.patch("/:id/redirects/:redirectId", controller.updateRedirect);

// DELETE /:id/redirects/:redirectId — Delete a redirect
router.delete("/:id/redirects/:redirectId", controller.deleteRedirect);

export default router;
