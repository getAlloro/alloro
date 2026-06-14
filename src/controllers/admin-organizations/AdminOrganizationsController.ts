/**
 * Admin Organizations Controller
 *
 * Handles HTTP request/response for admin organization endpoints.
 * Delegates business logic to services and data access to models.
 */

import { Response } from "express";
import crypto from "crypto";
import { AuthRequest } from "../../middleware/auth";
import { db } from "../../database/connection";
import bcrypt from "bcrypt";
import {
  OrganizationListView,
  OrganizationModel,
} from "../../models/OrganizationModel";
import { OrganizationUserModel } from "../../models/OrganizationUserModel";
import { UserModel } from "../../models/UserModel";
import { GoogleConnectionModel } from "../../models/GoogleConnectionModel";
import { LocationModel } from "../../models/LocationModel";
import { GooglePropertyModel } from "../../models/GooglePropertyModel";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import * as OrganizationEnrichmentService from "./feature-services/OrganizationEnrichmentService";
import * as ConnectionDetectionService from "./feature-services/ConnectionDetectionService";
import * as BusinessDataService from "../locations/BusinessDataService";
import { getValidOAuth2ClientByOrg } from "../../auth/oauth2Helper";
import * as TierManagementService from "./feature-services/TierManagementService";
import * as AdminOrgCreationService from "./feature-services/AdminOrgCreationService";
import * as hostnameGenerator from "./feature-utils/hostnameGenerator";
import { deleteOrganization } from "../settings/feature-services/service.delete-organization";
import {
  previewResetCounts,
  resetOrgData as resetOrgDataService,
} from "./feature-services/service.reset-org-data";
import {
  archiveOrganization as archiveOrganizationService,
  unarchiveOrganization as unarchiveOrganizationService,
} from "./feature-services/OrganizationArchiveService";
import {
  getOrganizationLifecycleErrorStatus,
} from "../../services/OrganizationLifecycleService";
import {
  RESET_GROUP_KEYS,
  ResetGroupKey,
} from "../../types/adminReset";
import { sendEmail } from "../../emails/emailService";
import { getStripe, isStripeConfigured } from "../../config/stripe";
import { v4 as uuid } from "uuid";
import {
  assertRecipientChannel,
  getOrganizationRecipientSettings,
  updateRecipientSetting,
} from "../../services/recipientSettingsService";

const BCRYPT_SALT_ROUNDS = 12;

// =====================================================================
// Error handler (preserves original handleError response shape)
// =====================================================================

function handleError(res: Response, error: any, operation: string): Response {
  console.error(`[Admin/Orgs] ${operation} Error:`, error?.message || error);
  return res.status(500).json({
    success: false,
    error: `Failed to ${operation.toLowerCase()}`,
    message: error?.message || "Unknown error occurred",
    timestamp: new Date().toISOString(),
  });
}

function parseOrganizationListView(value: unknown): OrganizationListView | null {
  if (value === undefined || value === null || value === "") return "active";
  if (value === "active" || value === "archived" || value === "all") {
    return value;
  }
  return null;
}

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

    const organization = await OrganizationModel.findById(orgId);

    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Fetch users - map to original response shape
    const rawUsers = await OrganizationUserModel.listByOrgWithUsers(orgId);
    const users = rawUsers.map((u) => ({
      id: u.user_id,
      name: u.name,
      email: u.email,
      role: u.role,
      joined_at: u.created_at,
      has_password: !!u.password_hash,
    }));

    // Fetch connection details
    const linkedAccounts = await GoogleConnectionModel.findByOrganization(orgId);
    const connections =
      ConnectionDetectionService.formatConnectionDetails(linkedAccounts);

    // Fetch linked website - project only the original fields
    const rawWebsite = await ProjectModel.findByOrganizationId(orgId);
    const website = rawWebsite
      ? {
          id: rawWebsite.id,
          generated_hostname: (rawWebsite as any).generated_hostname,
          status: rawWebsite.status,
          created_at: rawWebsite.created_at,
        }
      : null;

    return res.json({
      success: true,
      organization,
      users,
      connections,
      website,
    });
  } catch (error) {
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

    const confirmDelete = req.body?.confirmDelete === true || req.query?.confirmDelete === "true";
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

    const organization = await OrganizationModel.findById(orgId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const { groups, confirmName } = (req.body ?? {}) as {
      groups?: unknown;
      confirmName?: unknown;
    };

    if (typeof confirmName !== "string" || confirmName !== organization.name) {
      return res.status(400).json({
        success: false,
        error:
          "Confirmation failed. `confirmName` must match the organization name exactly.",
      });
    }

    if (!Array.isArray(groups) || groups.length === 0) {
      return res.status(400).json({
        success: false,
        error: "`groups` must be a non-empty array of reset group keys.",
      });
    }

    const allowed = new Set<string>(RESET_GROUP_KEYS);
    const invalid = groups.filter(
      (g): g is unknown => typeof g !== "string" || !allowed.has(g),
    );
    if (invalid.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid reset group key(s): ${invalid
          .map((g) => JSON.stringify(g))
          .join(", ")}. Allowed: ${RESET_GROUP_KEYS.join(", ")}.`,
      });
    }

    const adminEmail = req.user?.email;
    if (!adminEmail) {
      return res.status(401).json({
        success: false,
        error: "Authenticated admin email not found on request.",
      });
    }

    // De-dupe while preserving order — guards against `["pms_ingestion","pms_ingestion"]`.
    const uniqueGroups = Array.from(new Set(groups as ResetGroupKey[]));

    const data = await resetOrgDataService(orgId, uniqueGroups, adminEmail);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
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
  const trx = await db.transaction();

  try {
    const orgId = parseInt(req.params.id);
    const { tier } = req.body;

    if (isNaN(orgId)) {
      await trx.rollback();
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    if (!tier || !["DWY", "DFY"].includes(tier)) {
      await trx.rollback();
      return res
        .status(400)
        .json({ error: "Tier must be either DWY or DFY" });
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
 * Set organization type (health or saas). Immutable once set.
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

    if (!type || !["health", "saas"].includes(type)) {
      return res
        .status(400)
        .json({ error: "Type must be either 'health' or 'saas'" });
    }

    const organization = await OrganizationModel.findById(orgId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Immutable once set
    if (organization.organization_type) {
      return res.status(409).json({
        success: false,
        error: `Organization type is already set to "${organization.organization_type}" and cannot be changed.`,
      });
    }

    await OrganizationModel.updateById(orgId, {
      organization_type: type,
      updated_at: new Date(),
    } as any);

    return res.json({
      success: true,
      type,
      message: `Organization type set to "${type}".`,
    });
  } catch (error) {
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

    const organization = await OrganizationModel.findById(orgId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Fetch all locations for this organization
    const locations = await LocationModel.findByOrganizationId(orgId);

    // Fetch google properties for each location in parallel
    const locationsWithProperties = await Promise.all(
      locations.map(async (location) => {
        const properties = await GooglePropertyModel.findByLocationId(location.id);
        return {
          ...location,
          googleProperties: properties,
        };
      })
    );

    return res.json({
      success: true,
      locations: locationsWithProperties,
      total: locationsWithProperties.length,
    });
  } catch (error) {
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

    const result =
      await AdminOrgCreationService.createOrganizationWithUser({
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

    const organization = await OrganizationModel.findById(orgId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Cannot lock out paying customers
    if (organization.stripe_customer_id) {
      return res.status(400).json({
        success: false,
        error:
          "Cannot lock out an organization with an active Stripe subscription. Cancel their subscription first.",
      });
    }

    await OrganizationModel.updateById(orgId, {
      subscription_status: "inactive",
      updated_at: new Date(),
    } as any);

    return res.json({
      success: true,
      message: `Organization "${organization.name}" has been locked out.`,
    });
  } catch (error) {
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

    const organization = await OrganizationModel.findById(orgId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    await OrganizationModel.updateById(orgId, {
      subscription_status: "active",
      updated_at: new Date(),
    } as any);

    return res.json({
      success: true,
      message: `Organization "${organization.name}" has been unlocked.`,
    });
  } catch (error) {
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

    const organization = await OrganizationModel.findById(orgId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // If no Stripe info, nothing to remove
    if (!organization.stripe_customer_id && !organization.stripe_subscription_id) {
      return res.status(400).json({
        success: false,
        error: "This organization has no payment method to remove.",
      });
    }

    // Cancel the Stripe subscription if it exists
    if (organization.stripe_subscription_id && isStripeConfigured()) {
      try {
        const stripe = getStripe();
        await stripe.subscriptions.cancel(organization.stripe_subscription_id);
        console.log(
          `[Admin] Cancelled Stripe subscription ${organization.stripe_subscription_id} for org ${orgId}`
        );
      } catch (stripeErr: any) {
        // Best-effort — if it fails (already cancelled, etc.), log and continue
        console.warn(
          `[Admin] Failed to cancel Stripe subscription for org ${orgId}:`,
          stripeErr?.message || stripeErr
        );
      }
    }

    // Clear Stripe fields and revert to admin-granted state
    await OrganizationModel.updateById(orgId, {
      stripe_customer_id: null,
      stripe_subscription_id: null,
      subscription_status: "active",
      subscription_updated_at: new Date(),
      updated_at: new Date(),
    } as any);

    console.log(
      `[Admin] Payment method removed for org ${orgId} (${organization.name}). Reverted to admin-granted state.`
    );

    return res.json({
      success: true,
      message: `Payment method removed for "${organization.name}". Organization reverted to admin-granted state.`,
    });
  } catch (error) {
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

    const organization = await OrganizationModel.findById(orgId);
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    if (organization.archived_at) {
      return res.status(423).json({
        success: false,
        error: "ORGANIZATION_ARCHIVED",
        message: "Archived organizations cannot create new website projects.",
      });
    }

    // Check if project already exists
    const existingProject = await ProjectModel.findByOrganizationId(orgId);
    if (existingProject) {
      return res.status(409).json({
        success: false,
        error: "This organization already has a website project.",
        project: {
          id: existingProject.id,
          generated_hostname: (existingProject as any).generated_hostname,
          status: existingProject.status,
        },
      });
    }

    // Generate hostname and create project (same logic as TierManagementService.handleDfyUpgrade)
    const hostname = hostnameGenerator.generate(organization.name);

    await ProjectModel.create({
      id: uuid(),
      organization_id: orgId,
      generated_hostname: hostname,
      status: "CREATED",
      created_at: new Date(),
      updated_at: new Date(),
    } as any);

    console.log(
      `[Admin] Website project created for org ${orgId} (${organization.name}) — hostname: ${hostname}`
    );

    return res.status(201).json({
      success: true,
      message: `Website project created for "${organization.name}".`,
      project: {
        generated_hostname: hostname,
        status: "CREATED",
      },
    });
  } catch (error) {
    return handleError(res, error, "Create project for organization");
  }
}

// =====================================================================
// Admin Set Password
// =====================================================================

function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;

  // crypto.randomInt is uniform and unpredictable (unlike Math.random, which is
  // not a CSPRNG and must never seed a credential).
  const pick = (charset: string): string =>
    charset[crypto.randomInt(charset.length)];

  // Ensure at least 1 uppercase, 1 lowercase, 1 digit
  const chars: string[] = [pick(upper), pick(lower), pick(digits)];
  for (let i = 3; i < 12; i++) {
    chars.push(pick(all));
  }

  // Unbiased Fisher–Yates shuffle (the old `.sort(() => Math.random() - 0.5)`
  // is statistically biased and non-cryptographic).
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

/**
 * POST /api/admin/users/:userId/set-password
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

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_SALT_ROUNDS);

    await UserModel.updatePasswordHash(userId, passwordHash);

    // Ensure email is verified so user can log in
    if (!user.email_verified) {
      await UserModel.setEmailVerified(userId);
    }

    if (notifyUser) {
      const appUrl = process.env.NODE_ENV === "production"
        ? "https://app.getalloro.com"
        : "http://localhost:5173";

      const emailResult = await sendEmail({
        subject: "Your Alloro password has been set",
        body: `
          <div style="font-family: sans-serif; padding: 20px; max-width: 600px;">
            <h2 style="color: #1a1a1a;">Hello${user.name ? `, ${user.name}` : ""}!</h2>
            <p style="color: #4a5568; font-size: 16px;">
              Alloro has set a temporary password for your account. You can now sign in using your email and the password below.
            </p>
            <div style="background: #f7f7f7; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="color: #718096; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 1px;">Your temporary password</p>
              <p style="font-size: 20px; font-weight: bold; letter-spacing: 2px; margin: 0; color: #1a1a1a; font-family: monospace;">${tempPassword}</p>
            </div>
            <p style="color: #4a5568; font-size: 16px;">
              We recommend changing your password as soon as possible. You can do this from your
              <a href="${appUrl}/settings" style="color: #F97316; text-decoration: underline;">Account Settings</a>.
            </p>
            <p style="color: #718096; font-size: 14px; margin-top: 24px;">
              If you have any questions, please contact our team.
            </p>
          </div>
        `,
        recipients: [user.email],
      });

      if (!emailResult.success) {
        console.error(`[Admin] Failed to send password notification to ${user.email}:`, emailResult.error);
      }
    }

    console.log(`[Admin] Temporary password set for user ${userId} (${user.email}) by admin ${req.user?.email}`);

    return res.json({
      success: true,
      temporaryPassword: tempPassword,
      message: notifyUser
        ? `Password set and notification sent to ${user.email}`
        : `Password set for ${user.email}`,
    });
  } catch (error) {
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
      return res.status(400).json({ error: "Invalid organization or location ID" });
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

    const locations = await LocationModel.findByOrganizationId(orgId);
    const primary = locations.find((l) => l.is_primary) || locations[0];

    if (!primary?.business_data) {
      return res.status(400).json({
        error: "Primary location has no business data. Refresh the location first.",
      });
    }

    const synced = await BusinessDataService.updateOrgBusinessData(
      orgId,
      primary.business_data as Record<string, unknown>,
    );

    return res.json({ success: true, business_data: synced });
  } catch (error) {
    return handleError(res, error, "Sync org business data");
  }
}
