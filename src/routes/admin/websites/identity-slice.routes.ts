/**
 * Admin Websites — Identity Slice sub-router (T3)
 *
 * Surgical per-slice edit for `project_identity`. Accepts only the allow-list
 * enforced inside the handler.
 *
 * Mounted by `../websites.ts` AFTER the super-admin auth hoist, so the route
 * inherits `[authenticateToken, superAdminMiddleware]`. The path anchors after
 * `/:id/identity/`, so it does not collide with the project `/:id` catch-all and
 * is safely mounted after it.
 */

import express from "express";
import * as controller from "../../../controllers/admin-websites/IdentitySliceController";

const router = express.Router();

// =====================================================================
// IDENTITY SLICE PATCH — T3
// =====================================================================

// PATCH /:id/identity/slice — Replace one allow-listed slice of identity
router.patch("/:id/identity/slice", controller.patchIdentitySlice);

export default router;
