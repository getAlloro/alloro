import { Knex } from "knex";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { OrganizationUserModel } from "../../../models/OrganizationUserModel";
import { InvitationModel } from "../../../models/InvitationModel";
import { UserModel } from "../../../models/UserModel";
import logger from "../../../lib/logger";

export interface BootstrapResult {
  organizationId: number;
  joinedViaInvitation: boolean;
}

/**
 * Bootstrap an organization for a password-only user who has no org yet.
 *
 * Creates an organization row and links the user as admin,
 * all within the provided transaction.
 *
 * Checks for an existing link first to prevent duplicates on retry.
 */
export async function bootstrapOrganization(
  userId: number,
  practiceName: string,
  domain: string | undefined,
  trx: Knex.Transaction
): Promise<BootstrapResult> {
  // Guard: check if the user already has an org (retry safety)
  const existing = await OrganizationUserModel.findByUserId(userId, trx);
  if (existing) {
    return { organizationId: existing.organization_id, joinedViaInvitation: false };
  }

  // Check for a pending invitation — join existing org instead of creating a new one
  const user = await UserModel.findById(userId, trx);
  if (user?.email) {
    const invitation = await InvitationModel.findPendingByEmail(user.email, trx);
    if (invitation && new Date(invitation.expires_at) > new Date()) {
      await OrganizationUserModel.create(
        {
          organization_id: invitation.organization_id,
          user_id: userId,
          role: invitation.role,
        },
        trx
      );
      await InvitationModel.updateStatus(invitation.id, "accepted", trx);
      logger.info(
        `[Onboarding] User ${userId} joined org ${invitation.organization_id} via invitation (role: ${invitation.role})`
      );
      return { organizationId: invitation.organization_id, joinedViaInvitation: true };
    }
  }

  const newOrg = await OrganizationModel.create(
    {
      name: practiceName || `User ${userId}'s Organization`,
      domain: domain,
    },
    trx
  );

  await OrganizationUserModel.create(
    {
      organization_id: newOrg.id,
      user_id: userId,
      role: "admin",
    },
    trx
  );

  return { organizationId: newOrg.id, joinedViaInvitation: false };
}
