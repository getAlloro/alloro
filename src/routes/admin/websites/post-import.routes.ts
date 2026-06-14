/**
 * Admin Websites — Post Import sub-router (T8 + F4)
 *
 * Enqueue a BullMQ job to import doctor/service/location entries as posts, and
 * poll job state + per-entry results. Path param is `:projectId`.
 *
 * Mounted by `../websites.ts` AFTER the super-admin auth hoist, so every route
 * inherits `[authenticateToken, superAdminMiddleware]`. These paths sit deeper
 * than the project `/:id` catch-all, so mounting after it preserves original
 * behavior.
 */

import express from "express";
import * as controller from "../../../controllers/admin-websites/AdminWebsitesController";

const router = express.Router();

// =====================================================================
// POST IMPORT FROM IDENTITY — T8 + F4
// =====================================================================

// POST /:projectId/posts/import            — Enqueue a BullMQ job to import
//                                            doctor / service / location entries
router.post("/:projectId/posts/import", controller.startPostImport);

// GET  /:projectId/posts/import/:jobId     — Poll job state + per-entry results
router.get("/:projectId/posts/import/:jobId", controller.getPostImportStatus);

export default router;
