/**
 * Organization Lifecycle Admin Service
 *
 * Business logic for admin-triggered organization lifecycle transitions:
 * organization type (immutable set), lockout/unlock, payment-method removal,
 * and ad-hoc website project creation.
 *
 * Each operation validates + guards, performs the model write and any
 * side effects (Stripe), and returns the response body to relay. Guard
 * failures throw AdminOrgError carrying the exact status + body, so the
 * controller stays a thin orchestration edge with byte-identical responses.
 *
 * All DB access stays in models/.
 */

import { v4 as uuid } from "uuid";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { getStripe, isStripeConfigured } from "../../../config/stripe";
import * as hostnameGenerator from "../feature-utils/hostnameGenerator";
import { AdminOrgError } from "../feature-utils/AdminOrgError";
import logger from "../../../lib/logger";

/** Success envelope: body to JSON-serialize plus the HTTP status to use. */
export interface AdminOrgActionResult {
  status: number;
  body: Record<string, unknown>;
}

async function requireOrganization(orgId: number) {
  const organization = await OrganizationModel.findById(orgId);
  if (!organization) {
    throw new AdminOrgError(404, { error: "Organization not found" });
  }
  return organization;
}

/**
 * Set or change organization type ("health" | "generic"). Editable — the type
 * controls which vocabulary the app serves, and admins may switch it.
 * Validity of `type` is the caller's responsibility.
 */
export async function setOrganizationType(
  orgId: number,
  type: "health" | "generic"
): Promise<AdminOrgActionResult> {
  await requireOrganization(orgId);

  await OrganizationModel.updateById(orgId, {
    organization_type: type,
    updated_at: new Date(),
  } as any);

  return {
    status: 200,
    body: {
      success: true,
      type,
      message: `Organization type set to "${type}".`,
    },
  };
}

/**
 * Lock out an organization (subscription_status -> inactive).
 * Refuses orgs with an active Stripe subscription.
 */
export async function lockoutOrganization(
  orgId: number
): Promise<AdminOrgActionResult> {
  const organization = await requireOrganization(orgId);

  // Cannot lock out paying customers
  if (organization.stripe_customer_id) {
    throw new AdminOrgError(400, {
      success: false,
      error:
        "Cannot lock out an organization with an active Stripe subscription. Cancel their subscription first.",
    });
  }

  await OrganizationModel.updateById(orgId, {
    subscription_status: "inactive",
    updated_at: new Date(),
  } as any);

  return {
    status: 200,
    body: {
      success: true,
      message: `Organization "${organization.name}" has been locked out.`,
    },
  };
}

/**
 * Unlock an organization (subscription_status -> active).
 */
export async function unlockOrganization(
  orgId: number
): Promise<AdminOrgActionResult> {
  const organization = await requireOrganization(orgId);

  await OrganizationModel.updateById(orgId, {
    subscription_status: "active",
    updated_at: new Date(),
  } as any);

  return {
    status: 200,
    body: {
      success: true,
      message: `Organization "${organization.name}" has been unlocked.`,
    },
  };
}

/**
 * Cancel the Stripe subscription and clear Stripe IDs, reverting the org to
 * admin-granted state (active, no billing). Stripe cancellation is best-effort.
 */
export async function removePaymentMethod(
  orgId: number
): Promise<AdminOrgActionResult> {
  const organization = await requireOrganization(orgId);

  // If no Stripe info, nothing to remove
  if (!organization.stripe_customer_id && !organization.stripe_subscription_id) {
    throw new AdminOrgError(400, {
      success: false,
      error: "This organization has no payment method to remove.",
    });
  }

  // Cancel the Stripe subscription if it exists
  if (organization.stripe_subscription_id && isStripeConfigured()) {
    try {
      const stripe = getStripe();
      await stripe.subscriptions.cancel(organization.stripe_subscription_id);
      logger.info(
        `[Admin] Cancelled Stripe subscription ${organization.stripe_subscription_id} for org ${orgId}`
      );
    } catch (stripeErr: any) {
      // Best-effort — if it fails (already cancelled, etc.), log and continue
      logger.warn(
        { detail: stripeErr?.message || stripeErr },
        `[Admin] Failed to cancel Stripe subscription for org ${orgId}:`
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

  logger.info(
    `[Admin] Payment method removed for org ${orgId} (${organization.name}). Reverted to admin-granted state.`
  );

  return {
    status: 200,
    body: {
      success: true,
      message: `Payment method removed for "${organization.name}". Organization reverted to admin-granted state.`,
    },
  };
}

/**
 * Create a website project for an organization (mirrors the project-creation
 * step of TierManagementService.handleDfyUpgrade). Refuses archived orgs and
 * orgs that already have a project.
 */
export async function createProject(
  orgId: number
): Promise<AdminOrgActionResult> {
  const organization = await requireOrganization(orgId);

  if (organization.archived_at) {
    throw new AdminOrgError(423, {
      success: false,
      error: "ORGANIZATION_ARCHIVED",
      message: "Archived organizations cannot create new website projects.",
    });
  }

  // Check if project already exists
  const existingProject = await ProjectModel.findByOrganizationId(orgId);
  if (existingProject) {
    throw new AdminOrgError(409, {
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

  logger.info(
    `[Admin] Website project created for org ${orgId} (${organization.name}) — hostname: ${hostname}`
  );

  return {
    status: 201,
    body: {
      success: true,
      message: `Website project created for "${organization.name}".`,
      project: {
        generated_hostname: hostname,
        status: "CREATED",
      },
    },
  };
}
