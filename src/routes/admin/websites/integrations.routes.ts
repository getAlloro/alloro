/**
 * Admin Websites — Integrations sub-router
 *
 * CRM connectors plus analytics integrations (Clarity, Rybbit, GSC),
 * detected-form discovery, field mappings, and harvest activity.
 *
 * Mounted by `../websites.ts` AFTER the super-admin auth hoist, so every
 * route inherits `[authenticateToken, superAdminMiddleware]`. Analytics
 * routes additionally re-apply `adminGscAuth` (adds `rbacMiddleware`) inline —
 * preserved verbatim. Specific provider/static paths are declared before the
 * `/:integrationId` matcher to avoid shadowing.
 */

import express from "express";
import * as integrationsController from "../../../controllers/admin-websites/WebsiteIntegrationsController";
import { authenticateToken } from "../../../middleware/auth";
import { rbacMiddleware } from "../../../middleware/rbac";
import { superAdminMiddleware } from "../../../middleware/superAdmin";

const router = express.Router();

// =====================================================================
// WEBSITE INTEGRATIONS (CRM connectors — non-parameterized first)
// =====================================================================

// GET    /:id/integrations — List integrations for a project
router.get("/:id/integrations", integrationsController.listIntegrations);

// POST   /:id/integrations — Create + validate a new integration
router.post("/:id/integrations", integrationsController.createIntegration);

const adminGscAuth = [authenticateToken, rbacMiddleware, superAdminMiddleware];

router.post(
  "/integrations/rybbit/backfill-all",
  ...adminGscAuth,
  integrationsController.backfillAllRybbitHistory,
);

// Clarity-specific routes (must be before /:integrationId params)
router.get(
  "/:id/integrations/clarity/status",
  ...adminGscAuth,
  integrationsController.getClarityStatus,
);
router.post(
  "/:id/integrations/clarity",
  ...adminGscAuth,
  integrationsController.createClarityIntegration,
);
router.post(
  "/:id/integrations/clarity/legacy-snippets/disable",
  ...adminGscAuth,
  integrationsController.disableClarityLegacySnippets,
);
router.post(
  "/:id/integrations/clarity/validate",
  ...adminGscAuth,
  integrationsController.validateClarityInstallation,
);

// Rybbit-specific routes (must be before /:integrationId params)
router.get(
  "/:id/integrations/rybbit/status",
  ...adminGscAuth,
  integrationsController.getRybbitStatus,
);
router.post(
  "/:id/integrations/rybbit",
  ...adminGscAuth,
  integrationsController.createRybbitIntegration,
);
router.post(
  "/:id/integrations/rybbit/preview",
  ...adminGscAuth,
  integrationsController.provisionRybbitPreview,
);
router.post(
  "/:id/integrations/rybbit/legacy-snippets/disable",
  ...adminGscAuth,
  integrationsController.disableRybbitLegacySnippets,
);
router.post(
  "/:id/integrations/:integrationId/rybbit/backfill",
  ...adminGscAuth,
  integrationsController.backfillRybbitHistory,
);
router.get(
  "/:id/integrations/:integrationId/rybbit/performance",
  ...adminGscAuth,
  integrationsController.getRybbitPerformance,
);

// GSC-specific routes (must be before /:integrationId params)
router.get(
  "/:id/integrations/gsc/connections",
  ...adminGscAuth,
  integrationsController.listGscConnections,
);
router.get(
  "/:id/integrations/gsc/sites",
  ...adminGscAuth,
  integrationsController.listGscSites,
);
router.post(
  "/:id/integrations/gsc",
  ...adminGscAuth,
  integrationsController.createGscIntegration,
);
router.post(
  "/:id/integrations/:integrationId/gsc/backfill",
  ...adminGscAuth,
  integrationsController.backfillGscHistory,
);
router.get(
  "/:id/integrations/:integrationId/gsc/performance",
  ...adminGscAuth,
  integrationsController.getGscPerformance,
);

// GET    /:id/detected-forms — List website forms derived from submissions
router.get("/:id/detected-forms", integrationsController.listDetectedForms);

// GET    /:id/detected-forms/:formName/field-shape — Field shape sample for a form
router.get(
  "/:id/detected-forms/:formName/field-shape",
  integrationsController.getDetectedFormFieldShape,
);

// GET    /:id/integrations/:integrationId — Get integration detail (SAFE)
router.get("/:id/integrations/:integrationId", integrationsController.getIntegration);

// PUT    /:id/integrations/:integrationId — Update label / credentials
router.put("/:id/integrations/:integrationId", integrationsController.updateIntegration);

// DELETE /:id/integrations/:integrationId — Hard delete (sync logs survive via SET NULL)
router.delete("/:id/integrations/:integrationId", integrationsController.deleteIntegration);

// POST   /:id/integrations/:integrationId/revoke — Soft revoke (status='revoked')
router.post(
  "/:id/integrations/:integrationId/revoke",
  integrationsController.revokeIntegration,
);

// GET    /:id/integrations/:integrationId/vendor-forms — Live vendor forms list
router.get(
  "/:id/integrations/:integrationId/vendor-forms",
  integrationsController.listVendorForms,
);

// POST   /:id/integrations/:integrationId/validate-mappings — Re-validate token + form existence
router.post(
  "/:id/integrations/:integrationId/validate-mappings",
  integrationsController.validateMappings,
);

// POST   /:id/integrations/:integrationId/infer-mapping — Auto-default field mapping suggestion
router.post(
  "/:id/integrations/:integrationId/infer-mapping",
  integrationsController.inferMapping,
);

// GET    /:id/integrations/:integrationId/sync-logs — Recent push attempts (paginated)
router.get(
  "/:id/integrations/:integrationId/sync-logs",
  integrationsController.listSyncLogs,
);

// GET    /:id/integrations/:integrationId/mappings — List mappings
router.get(
  "/:id/integrations/:integrationId/mappings",
  integrationsController.listMappings,
);

// POST   /:id/integrations/:integrationId/mappings — Create a mapping
router.post(
  "/:id/integrations/:integrationId/mappings",
  integrationsController.createMapping,
);

// PUT    /:id/integrations/:integrationId/mappings/:mappingId — Update a mapping
router.put(
  "/:id/integrations/:integrationId/mappings/:mappingId",
  integrationsController.updateMapping,
);

// DELETE /:id/integrations/:integrationId/mappings/:mappingId — Delete a mapping
router.delete(
  "/:id/integrations/:integrationId/mappings/:mappingId",
  integrationsController.deleteMapping,
);

// POST /:id/integrations/:integrationId/validate — Validate harvest connection
router.post(
  "/:id/integrations/:integrationId/validate",
  integrationsController.validateHarvestIntegration,
);

// GET /:id/integrations/:integrationId/harvest-logs — Paginated harvest activity
router.get(
  "/:id/integrations/:integrationId/harvest-logs",
  integrationsController.getHarvestLogs,
);

// GET /:id/integrations/:integrationId/harvest-logs/:logId/payload — Inspect one stored harvest payload
router.get(
  "/:id/integrations/:integrationId/harvest-logs/:logId/payload",
  integrationsController.getHarvestLogPayload,
);

// POST /:id/integrations/:integrationId/rerun — Re-enqueue a failed harvest
router.post(
  "/:id/integrations/:integrationId/rerun",
  integrationsController.rerunHarvest,
);

export default router;
