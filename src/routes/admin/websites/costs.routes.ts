/**
 * Admin Websites — Costs sub-router
 *
 * Per-project AI cost rollup (events + totals) for the Costs tab. Path param is
 * `:projectId` (matching the original file).
 *
 * Mounted by `../websites.ts` AFTER the super-admin auth hoist, so the route
 * inherits `[authenticateToken, superAdminMiddleware]`.
 */

import express from "express";
import * as controller from "../../../controllers/admin-websites/CostsController";

const router = express.Router();

// =====================================================================
// COSTS — per-project AI cost rollup
// =====================================================================

// GET /:projectId/costs — Cost events + totals for the Costs tab
router.get("/:projectId/costs", controller.getProjectCosts);

export default router;
