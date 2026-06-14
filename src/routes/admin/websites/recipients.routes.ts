/**
 * Admin Websites — Recipients & Form Config sub-router
 *
 * Project recipient list (get/update) and detected-form recipient rules plus
 * visual-only form preferences.
 *
 * Mounted by `../websites.ts` AFTER the super-admin auth hoist, so every route
 * inherits `[authenticateToken, superAdminMiddleware]`. Recipient list routes
 * delegate to `AdminWebsitesController`; form rule/preference routes delegate to
 * `WebsiteFormsController`.
 */

import express from "express";
import * as controller from "../../../controllers/admin-websites/AdminWebsitesController";
import * as formsController from "../../../controllers/admin-websites/WebsiteFormsController";

const router = express.Router();

// =====================================================================
// RECIPIENTS
// =====================================================================

// GET  /:id/recipients — Get configured recipients + org users
router.get("/:id/recipients", controller.getRecipients);

// PUT  /:id/recipients — Update recipients list
router.put("/:id/recipients", controller.updateRecipients);

// GET  /:id/forms/catalog — Detected forms + recipient rule state
router.get("/:id/forms/catalog", formsController.listFormCatalog);

// PUT  /:id/forms/recipients — Upsert per-form recipient rule
router.put("/:id/forms/recipients", formsController.updateFormRecipientRule);

// PUT  /:id/forms/preferences — Upsert visual-only form labels/order
router.put("/:id/forms/preferences", formsController.updateFormPreferences);

export default router;
