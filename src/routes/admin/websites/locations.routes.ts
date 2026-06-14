/**
 * Admin Websites — Locations sub-router (F3 multi-location management)
 *
 * Add+scrape a place_id, switch primary location, re-scrape a single location,
 * and remove a non-primary location.
 *
 * Mounted by `../websites.ts` AFTER the super-admin auth hoist, so every route
 * inherits `[authenticateToken, superAdminMiddleware]`. These two-segment+ paths
 * sit deeper than the project `/:id` catch-all (path-to-regexp anchors `/:id` to
 * end-of-path), so mounting after the catch-all preserves the original behavior.
 */

import express from "express";
import * as controller from "../../../controllers/admin-websites/AdminWebsitesController";

const router = express.Router();

// =====================================================================
// LOCATIONS — F3 (multi-location management for IdentityModal Locations tab)
// =====================================================================

// POST   /:id/locations               — Add + scrape a new place_id
router.post("/:id/locations", controller.addProjectLocation);

// PATCH  /:id/locations/primary       — Switch primary location (rewrites identity.business)
router.patch("/:id/locations/primary", controller.setPrimaryLocation);

// POST   /:id/locations/:place_id/resync — Re-scrape a single location
router.post("/:id/locations/:place_id/resync", controller.resyncProjectLocation);

// DELETE /:id/locations/:place_id     — Remove a non-primary location
router.delete("/:id/locations/:place_id", controller.removeProjectLocation);

export default router;
