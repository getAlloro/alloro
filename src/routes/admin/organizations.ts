import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as controller from "../../controllers/admin-organizations/AdminOrganizationsController";
import * as BillingController from "../../controllers/billing/BillingController";

const organizationsRoutes = express.Router();

// POST /api/admin/organizations — Create organization with initial admin user
organizationsRoutes.post(
  "/",
  authenticateToken,
  superAdminMiddleware,
  controller.createOrganization
);

// GET /api/admin/organizations — List all with enriched data
organizationsRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  controller.listAll
);

// GET /api/admin/organizations/:id/locations — Organization locations with properties
// MUST be before /:id to avoid matching as the :id param
organizationsRoutes.get(
  "/:id/locations",
  authenticateToken,
  superAdminMiddleware,
  controller.getOrgLocations
);

// GET /api/admin/organizations/:id/billing — Billing details from Stripe
// MUST be before /:id to avoid matching as the :id param
organizationsRoutes.get(
  "/:id/billing",
  authenticateToken,
  superAdminMiddleware,
  BillingController.getAdminDetails
);

// GET /api/admin/organizations/:id/business-data — Org + location business data
// MUST be before /:id to avoid matching as the :id param
organizationsRoutes.get(
  "/:id/business-data",
  authenticateToken,
  superAdminMiddleware,
  controller.getBusinessData
);

// GET /api/admin/organizations/:id/recipient-settings — Recipient settings
// MUST be before /:id to avoid matching as the :id param
organizationsRoutes.get(
  "/:id/recipient-settings",
  authenticateToken,
  superAdminMiddleware,
  controller.getRecipientSettings
);

// PUT /api/admin/organizations/:id/recipient-settings/:channel — Update recipient channel
// MUST be before /:id to avoid matching as the :id param
organizationsRoutes.put(
  "/:id/recipient-settings/:channel",
  authenticateToken,
  superAdminMiddleware,
  controller.updateRecipientSettings
);

// GET /api/admin/organizations/:id — Organization details
organizationsRoutes.get(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  controller.getById
);

// PATCH /api/admin/organizations/:id — Update name
organizationsRoutes.patch(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  controller.updateName
);

// PATCH /api/admin/organizations/:id/tier — Update subscription tier
organizationsRoutes.patch(
  "/:id/tier",
  authenticateToken,
  superAdminMiddleware,
  controller.updateTier
);

// PATCH /api/admin/organizations/:id/type — Set organization type (immutable once set)
organizationsRoutes.patch(
  "/:id/type",
  authenticateToken,
  superAdminMiddleware,
  controller.updateOrganizationType
);

// PATCH /api/admin/organizations/:id/archive — Archive organization and connected operations
organizationsRoutes.patch(
  "/:id/archive",
  authenticateToken,
  superAdminMiddleware,
  controller.archiveOrganization
);

// PATCH /api/admin/organizations/:id/unarchive — Restore archived organization visibility
organizationsRoutes.patch(
  "/:id/unarchive",
  authenticateToken,
  superAdminMiddleware,
  controller.unarchiveOrganization
);

// POST /api/admin/organizations/:id/create-project — Create website project for org
organizationsRoutes.post(
  "/:id/create-project",
  authenticateToken,
  superAdminMiddleware,
  controller.createProject
);

// POST /api/admin/organizations/:id/remove-payment-method — Cancel Stripe sub, clear billing
organizationsRoutes.post(
  "/:id/remove-payment-method",
  authenticateToken,
  superAdminMiddleware,
  controller.removePaymentMethod
);

// PATCH /api/admin/organizations/:id/lockout — Lock out organization (no Stripe only)
organizationsRoutes.patch(
  "/:id/lockout",
  authenticateToken,
  superAdminMiddleware,
  controller.lockoutOrganization
);

// PATCH /api/admin/organizations/:id/unlock — Unlock organization
organizationsRoutes.patch(
  "/:id/unlock",
  authenticateToken,
  superAdminMiddleware,
  controller.unlockOrganization
);

// DELETE /api/admin/organizations/:id — Permanently delete organization
organizationsRoutes.delete(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  controller.deleteOrg
);

// GET /api/admin/organizations/:id/reset-data/preview — Row counts per reset group
organizationsRoutes.get(
  "/:id/reset-data/preview",
  authenticateToken,
  superAdminMiddleware,
  controller.previewResetData
);

// POST /api/admin/organizations/:id/reset-data — Hard-delete selected reset groups
organizationsRoutes.post(
  "/:id/reset-data",
  authenticateToken,
  superAdminMiddleware,
  controller.resetOrgData
);

// POST /api/admin/organizations/users/:userId/set-password — Admin sets temp password for a user
organizationsRoutes.post(
  "/users/:userId/set-password",
  authenticateToken,
  superAdminMiddleware,
  controller.setUserPassword
);

// POST /api/admin/organizations/:id/sync-org-business-data — Copy primary location data to org level
organizationsRoutes.post(
  "/:id/sync-org-business-data",
  authenticateToken,
  superAdminMiddleware,
  controller.syncOrgBusinessData
);

// POST /api/admin/organizations/:id/locations/:locationId/refresh-business-data — Refresh from Google
organizationsRoutes.post(
  "/:id/locations/:locationId/refresh-business-data",
  authenticateToken,
  superAdminMiddleware,
  controller.refreshBusinessData
);

export default organizationsRoutes;
