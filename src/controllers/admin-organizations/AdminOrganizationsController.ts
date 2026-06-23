/**
 * Admin Organizations Controller
 *
 * Handles HTTP request/response for admin organization endpoints.
 * Thin orchestration: parse input → call feature-service → shape response.
 * Business logic lives in feature-services/; pure helpers live in feature-utils/;
 * all DB access lives in models/.
 */

import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { OrganizationModel } from "../../models/OrganizationModel";
import * as OrganizationEnrichmentService from "./feature-services/OrganizationEnrichmentService";
import * as BusinessDataService from "../locations/BusinessDataService";
import { getValidOAuth2ClientByOrg } from "../../auth/oauth2Helper";
import * as TierManagementService from "./feature-services/TierManagementService";
import * as AdminOrgCreationService from "./feature-services/AdminOrgCreationService";
import * as OrganizationLifecycleAdminService from "./feature-services/OrganizationLifecycleAdminService";
import * as OrganizationDetailsService from "./feature-services/OrganizationDetailsService";
import * as AdminUserPasswordService from "./feature-services/AdminUserPasswordService";
import { deleteOrganization } from "../settings/feature-services/service.delete-organization";
import {
  previewResetCounts,
  resetOrgData as resetOrgDataService,
  validateResetRequest,
} from "./feature-services/service.reset-org-data";
import {
  archiveOrganization as archiveOrganizationService,
  unarchiveOrganization as unarchiveOrganizationService,
} from "./feature-services/OrganizationArchiveService";
import { getOrganizationLifecycleErrorStatus } from "../../services/OrganizationLifecycleService";
import {
  assertRecipientChannel,
  getOrganizationRecipientSettings,
  updateRecipientSetting,
} from "../../services/recipientSettingsService";
import { isAdminOrgError } from "./feature-utils/AdminOrgError";
import {
  handleError,
  parseOrganizationListView,
} from "./feature-utils/controllerResponses";

// =====================================================================
// Handlers
// =====================================================================

/**
 * GET /api/admin/organizations
 * Fetch all organizations with summary data
 */
export async function listAll(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const view = parseOrganizationListView(req.query.view);
    if (!view) {
      return res.status(400).json({
        success: false,
        error: "Invalid organization view. Use active, archived, or all.",
      });
    }

    const organizations = await OrganizationModel.listAll({ view });

    const enrichedOrgs =
      await OrganizationEnrichmentService.enrichWithMetadata(organizations);

    return res.json({
      success: true,
      view,
      organizations: enrichedOrgs,
    });
  } catch (error) {
    return handleError(res, error, "Fetch all organizations");
  }
}

/**
 * PATCH /api/admin/organizations/:id/archive
 * Archive organization and connected operational surfaces.
 */
export async function archiveOrganization(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : null;
    const data = await archiveOrganizationService({
      organizationId: orgId,
      archivedByUserId: req.user?.userId ?? null,
      reason,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    const status = getOrganizationLifecycleErrorStatus(error) ?? error?.statusCode;
    if (status) {
      return res.status(status).json({
        success: false,
        error: error?.code ?? "ORGANIZATION_ARCHIVE_FAILED",
        message: error?.message ?? "Failed to archive organization",
      });
    }
    return handleError(res, error, "Archive organization");
  }
}

/**
 * PATCH /api/admin/organizations/:id/unarchive
 * Restore organization visibility without reconnecting custom domains.
 */
export async function unarchiveOrganization(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const data = await unarchiveOrganizationService({
      organizationId: orgId,
      unarchivedByUserId: req.user?.userId ?? null,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    const status = getOrganizationLifecycleErrorStatus(error) ?? error?.statusCode;
    if (status) {
      return res.status(status).json({
        success: false,
        error: error?.code ?? "ORGANIZATION_UNARCHIVE_FAILED",
        message: error?.message ?? "Failed to unarchive organization",
      });
    }
    return handleError(res, error, "Unarchive organization");
  }
}

/**
 * GET /api/admin/organizations/:id
 * Fetch details for a specific organization (users, full connection details)
 */
export async function getById(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const { organization, users, connections, website } =
      await OrganizationDetailsService.getOrganizationDetail(orgId);

    return res.json({
      success: true,
      organization,
      users,
      connections,
      website,
    });
  } catch (error) {
    if (isAdminOrgError(error)) {
      return res.status(error.statusCode).json(error.body);
    }
    return handleError(res, error, "Fetch organization details");
  }
}

/**
 * GET /api/admin/organizations/:id/recipient-settings
 * Fetch editable recipient channels and fallback previews.
 */
export async function getRecipientSettings(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const organization = await OrganizationModel.findById(orgId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const data = await getOrganizationRecipientSettings(orgId);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return handleError(res, error, "Fetch recipient settings");
  }
}

/**
 * PUT /api/admin/organizations/:id/recipient-settings/:channel
 * Update explicit recipients for one recipient channel.
 */
export async function updateRecipientSettings(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const channel = assertRecipientChannel(req.params.channel);
    const organization = await OrganizationModel.findById(orgId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    await updateRecipientSetting(orgId, channel, req.body.recipients);
    const data = await getOrganizationRecipientSettings(orgId);

    return res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    if (error?.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: error.message,
      });
    }

    return handleError(res, error, "Update recipient settings");
  }
}

/**
 * PATCH /api/admin/organizations/:id
 * Update organization name
 */
export async function updateName(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    const { name } = req.body;

    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "Name is required" });
    }

    const updated = await OrganizationModel.updateById(orgId, {
      name: name.trim(),
      updated_at: new Date(),
    });

    if (!updated) {
      return res.status(404).json({ error: "Organization not found" });
    }

    return res.json({
      success: true,
      message: "Organization updated successfully",
      organization: { id: orgId, name: name.trim() },
    });
  } catch (error) {
    return handleError(res, error, "Update organization");
  }
}

/**
 * DELETE /api/admin/organizations/:id
 * Permanently delete an organization and all related data.
 * Super-admin only. Requires { confirmDelete: true } in request body.
 */
export async function deleteOrg(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const confirmDelete =
      req.body?.confirmDelete === true || req.query?.confirmDelete === "true";
    if (!confirmDelete) {
      return res.status(400).json({
        success: false,
        error: "Confirmation required. Send { confirmDelete: true } to proceed.",
      });
    }

    const organization = await OrganizationModel.findById(orgId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    await deleteOrganization(orgId);

    return res.status(204).send();
  } catch (error) {
    return handleError(res, error, "Delete organization");
  }
}

/**
 * GET /api/admin/organizations/:id/reset-data/preview
 * Read-only row counts per reset group, used by the Reset Data modal.
 * Super-admin only.
 */
export async function previewResetData(
  req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const organization = await OrganizationModel.findById(orgId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const data = await previewResetCounts(orgId);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return handleError(res, error, "Preview reset data");
  }
}

/**
 * POST /api/admin/organizations/:id/reset-data
 * Hard-delete selected reset groups (pms_ingestion, agent_referral) for an org
 * inside a single transaction. Requires `confirmName === org.name` and a
 * non-empty subset of RESET_GROUP_KEYS. Super-admin only.
 */
export async function resetOrgData(
  req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const { uniqueGroups, adminEmail } = await validateResetRequest(
      orgId,
      req.body ?? {},
      req.user?.email,
    );

    const data = await resetOrgDataService(orgId, uniqueGroups, adminEmail);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    if (isAdminOrgError(error)) {
      return res.status(error.statusCode).json(error.body);
    }
    return handleError(res, error, "Reset organization data");
  }
}

/**
 * PATCH /api/admin/organizations/:id/tier
 * Update organization subscription tier
 */
export async function updateTier(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  const trx = await OrganizationModel.beginTransaction();

  try {
    const orgId = parseInt(req.params.id);
    const { tier } = req.body;

    if (isNaN(orgId)) {
      await trx.rollback();
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    if (!tier || !["DWY", "DFY"].includes(tier)) {
      await trx.rollback();
      return res.status(400).json({ error: "Tier must be either DWY or DFY" });
    }

    const result = await TierManagementService.updateTier(orgId, tier, trx);

    if (!result.success) {
      await trx.rollback();
      return res.status(404).json({ error: "Organization not found" });
    }

    await trx.commit();

    return res.json({
      success: true,
      tier,
      message: result.message,
    });
  } catch (error) {
    await trx.rollback();
    return handleError(res, error, "Update organization tier");
  }
}

/**
 * PATCH /api/admin/organizations/:id/type
 * Set or change organization type (health or generic).
 */
export async function updateOrganizationType(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    const { type } = req.body;

    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    if (!type || !["health", "generic"].includes(type)) {
      return res
        .status(400)
        .json({ error: "Type must be either 'health' or 'generic'" });
    }

    const result = await OrganizationLifecycleAdminService.setOrganizationType(
      orgId,
      type
    );
    return res.status(result.status).json(result.body);
  } catch (error) {
    if (isAdminOrgError(error)) {
      return res.status(error.statusCode).json(error.body);
    }
    return handleError(res, error, "Update organization type");
  }
}

/**
 * GET /api/admin/organizations/:id/locations
 * Fetch all locations for an organization with their Google Properties
 */
export async function getOrgLocations(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const { locations, total } =
      await OrganizationDetailsService.getOrganizationLocations(orgId);

    return res.json({
      success: true,
      locations,
      total,
    });
  } catch (error) {
    if (isAdminOrgError(error)) {
      return res.status(error.statusCode).json(error.body);
    }
    return handleError(res, error, "Fetch organization locations");
  }
}

/**
 * POST /api/admin/organizations
 * Create a new organization with an initial admin user.
 * Super-admin only.
 */
export async function createOrganization(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const { organization, user, location } = req.body;

    if (!organization || !user || !location) {
      return res.status(400).json({
        success: false,
        error:
          "Request body must include 'organization', 'user', and 'location' objects.",
      });
    }

    const result = await AdminOrgCreationService.createOrganizationWithUser({
      organization,
      user,
      location,
    });

    return res.status(201).json(result);
  } catch (error: any) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
    }
    return handleError(res, error, "Create organization");
  }
}

/**
 * PATCH /api/admin/organizations/:id/lockout
 * Lock out an organization (sets subscription_status to inactive).
 * Cannot lockout orgs with an active Stripe subscription.
 */
export async function lockoutOrganization(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const result =
      await OrganizationLifecycleAdminService.lockoutOrganization(orgId);
    return res.status(result.status).json(result.body);
  } catch (error) {
    if (isAdminOrgError(error)) {
      return res.status(error.statusCode).json(error.body);
    }
    return handleError(res, error, "Lockout organization");
  }
}

/**
 * PATCH /api/admin/organizations/:id/unlock
 * Unlock an organization (sets subscription_status back to active).
 */
export async function unlockOrganization(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const result =
      await OrganizationLifecycleAdminService.unlockOrganization(orgId);
    return res.status(result.status).json(result.body);
  } catch (error) {
    if (isAdminOrgError(error)) {
      return res.status(error.statusCode).json(error.body);
    }
    return handleError(res, error, "Unlock organization");
  }
}

/**
 * POST /api/admin/organizations/:id/remove-payment-method
 * Cancel the Stripe subscription and clear Stripe IDs from the organization.
 * Reverts the org to admin-granted state (active, DFY, no billing).
 * Super-admin only.
 */
export async function removePaymentMethod(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const result =
      await OrganizationLifecycleAdminService.removePaymentMethod(orgId);
    return res.status(result.status).json(result.body);
  } catch (error) {
    if (isAdminOrgError(error)) {
      return res.status(error.statusCode).json(error.body);
    }
    return handleError(res, error, "Remove payment method");
  }
}

/**
 * POST /api/admin/organizations/:id/create-project
 * Create a website project for an organization.
 * Extracts project creation logic from TierManagementService.handleDfyUpgrade().
 * Only creates if no project already exists.
 */
export async function createProject(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const result =
      await OrganizationLifecycleAdminService.createProject(orgId);
    return res.status(result.status).json(result.body);
  } catch (error) {
    if (isAdminOrgError(error)) {
      return res.status(error.statusCode).json(error.body);
    }
    return handleError(res, error, "Create project for organization");
  }
}

/**
 * POST /api/admin/organizations/users/:userId/set-password
 * Admin sets a temporary password for a user
 */
export async function setUserPassword(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const { notifyUser } = req.body;

    const result = await AdminUserPasswordService.setTemporaryPassword(
      userId,
      Boolean(notifyUser),
      req.user?.email
    );

    return res.json(result);
  } catch (error) {
    if (isAdminOrgError(error)) {
      return res.status(error.statusCode).json(error.body);
    }
    return handleError(res, error, "Set user password");
  }
}

/**
 * GET /api/admin/organizations/:id/business-data
 * Get business data for an organization (org-level + all locations)
 */
export async function getBusinessData(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const data = await BusinessDataService.getOrgBusinessData(orgId);

    return res.json({ success: true, ...data });
  } catch (error) {
    return handleError(res, error, "Get business data");
  }
}

/**
 * POST /api/admin/organizations/:id/locations/:locationId/refresh-business-data
 * Refresh location business data from Google (admin-scoped)
 */
export async function refreshBusinessData(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    const locationId = parseInt(req.params.locationId);
    if (isNaN(orgId) || isNaN(locationId)) {
      return res
        .status(400)
        .json({ error: "Invalid organization or location ID" });
    }

    const oauth2Client = await getValidOAuth2ClientByOrg(orgId);

    const businessData = await BusinessDataService.refreshLocationBusinessData(
      locationId,
      orgId,
      oauth2Client
    );

    return res.json({ success: true, business_data: businessData });
  } catch (error: any) {
    const status = getOrganizationLifecycleErrorStatus(error);
    if (status) {
      return res.status(status).json({
        success: false,
        error: error?.code ?? "ORGANIZATION_UNAVAILABLE",
        message: error?.message ?? "Organization is unavailable",
      });
    }
    return handleError(res, error, "Refresh business data");
  }
}

/**
 * POST /api/admin/organizations/:id/sync-org-business-data
 * Copy primary location's business_data to the org-level record.
 */
export async function syncOrgBusinessData(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const synced =
      await OrganizationDetailsService.syncOrgBusinessDataFromPrimary(orgId);

    return res.json({ success: true, business_data: synced });
  } catch (error) {
    if (isAdminOrgError(error)) {
      return res.status(error.statusCode).json(error.body);
    }
    return handleError(res, error, "Sync org business data");
  }
}
