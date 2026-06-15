/**
 * Tier Management Service
 *
 * Manages tier upgrade/downgrade logic including:
 * - Transaction lifecycle
 * - DFY upgrade: project creation + admin email
 * - DWY downgrade: set project read-only
 */

import { Knex } from "knex";
import {
  OrganizationModel,
  IOrganization,
} from "../../../models/OrganizationModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { sendToAdmins } from "../../../emails/emailService";
import * as hostnameGenerator from "../feature-utils/hostnameGenerator";
import * as tierEmailTemplates from "../feature-utils/tierEmailTemplates";
import { v4 as uuid } from "uuid";

export interface TierUpdateResult {
  success: boolean;
  org?: IOrganization;
  oldTier?: string | null;
  tier?: string;
  message?: string;
}

/**
 * Update an organization's subscription tier within a transaction.
 * Handles DFY upgrade (project creation + email) and DWY downgrade (read-only).
 *
 * Validation (org existence, tier validity) is the caller's responsibility.
 * This service owns the transaction lifecycle and side-effect orchestration.
 */
export async function updateTier(
  orgId: number,
  newTier: "DWY" | "DFY",
  trx: Knex.Transaction
): Promise<TierUpdateResult> {
  const org = await OrganizationModel.findById(orgId, trx);
  if (!org) {
    return { success: false };
  }

  const oldTier = org.subscription_tier;

  // Update tier
  await OrganizationModel.updateTier(orgId, newTier, trx);

  // UPGRADE TO DFY: Create empty website project
  if (oldTier === "DWY" && newTier === "DFY") {
    await handleDfyUpgrade(org, orgId, trx);
  }

  // DOWNGRADE TO DWY: Make website read-only
  if (oldTier === "DFY" && newTier === "DWY") {
    await handleDwyDowngrade(orgId, trx);
  }

  return {
    success: true,
    org,
    oldTier,
    tier: newTier,
    message:
      newTier === "DFY"
        ? "Organization upgraded. Website project created."
        : "Organization downgraded. Website is now read-only.",
  };
}

/**
 * Handle DFY upgrade: create project if none exists, send admin email.
 */
async function handleDfyUpgrade(
  org: IOrganization,
  orgId: number,
  trx: Knex.Transaction
): Promise<void> {
  const existingProject = await ProjectModel.findByOrganizationId(orgId, trx);

  if (!existingProject) {
    // Generate hostname based on org name
    const hostname = hostnameGenerator.generate(org.name);

    // Auto-create project
    await ProjectModel.create(
      {
        id: uuid(),
        organization_id: orgId,
        generated_hostname: hostname,
        status: "CREATED",
        created_at: new Date(),
        updated_at: new Date(),
      } as any,
      trx
    );

    // Send email to admins
    const emailBody = tierEmailTemplates.dfyUpgradeEmail(
      orgId,
      org.name,
      hostname
    );
    await sendToAdmins(
      `New DFY Website Ready for Setup: ${org.name}`,
      emailBody
    );
  }
}

/**
 * Handle DWY downgrade: set project to read-only.
 */
async function handleDwyDowngrade(
  orgId: number,
  trx: Knex.Transaction
): Promise<void> {
  await ProjectModel.setReadOnly(orgId, trx);
}
