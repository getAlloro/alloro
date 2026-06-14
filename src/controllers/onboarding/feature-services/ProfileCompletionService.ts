import { db } from "../../../database/connection";
import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { OrganizationUserModel } from "../../../models/OrganizationUserModel";
import { UserModel } from "../../../models/UserModel";
import { ProfileData } from "../feature-utils/onboardingValidation";
import { bootstrapOrganization } from "./OrganizationBootstrapService";
import logger from "../../../lib/logger";

export interface ProfileCompletionResult {
  profile: ProfileData;
}

export interface SaveProfileResult {
  organizationId: number;
  profile: ProfileData;
}

/**
 * Complete onboarding by saving profile data and creating/updating the organization.
 *
 * Runs the entire operation inside a database transaction:
 * 1. Fetch the google account (verify it exists)
 * 2. If no organization exists, create one and link the user as admin
 * 3. If an organization exists, update its name and domain
 * 4. Update the google account with profile fields and mark onboarding_completed = true
 *
 * Throws if the google account is not found (the transaction rolls back automatically).
 */
export async function completeOnboardingWithProfile(
  googleAccountId: number,
  profileData: ProfileData
): Promise<ProfileCompletionResult> {
  await db.transaction(async (trx) => {
    const googleAccount = await GoogleConnectionModel.findById(
      googleAccountId,
      trx
    );

    if (!googleAccount) {
      throw new Error("Google account not found");
    }

    let orgId = googleAccount.organization_id;

    // If no organization exists (e.g. new user), create one
    if (!orgId) {
      const newOrg = await OrganizationModel.create(
        {
          name:
            profileData.practiceName ||
            `${profileData.firstName}'s Organization`,
          domain: profileData.domainName,
        },
        trx
      );

      orgId = newOrg.id;

      // Link user to organization as admin
      // Look up user via email since user_id was dropped from google_connections
      const user = await UserModel.findByEmail(googleAccount.email);
      if (user) {
        await OrganizationUserModel.create(
          {
            organization_id: orgId,
            user_id: user.id,
            role: "admin",
          },
          trx
        );
      }
    } else {
      // Update existing organization name/domain
      await OrganizationModel.updateById(
        orgId,
        {
          name: profileData.practiceName,
          domain: profileData.domainName,
        },
        trx
      );
    }

    // Profile fields and onboarding_completed now live on organizations/users
    // (google_connections only stores OAuth tokens + google_property_ids)
    await OrganizationModel.updateById(
      orgId,
      {
        name: profileData.practiceName,
        domain: profileData.domainName,
        operational_jurisdiction: profileData.operationalJurisdiction,
        onboarding_completed: true,
      },
      trx
    );

    // Update user profile fields
    const user = await UserModel.findByEmail(googleAccount.email);
    if (user) {
      await UserModel.updateProfile(
        user.id,
        {
          first_name: profileData.firstName,
          last_name: profileData.lastName,
          phone: profileData.phone,
        },
        trx
      );
    }

    // Ensure google_connection is linked to the org
    if (!googleAccount.organization_id) {
      await GoogleConnectionModel.updateById(
        googleAccountId,
        { organization_id: orgId },
        trx
      );
    }
  });

  logger.info(
    `[Onboarding] Completed onboarding for account ${googleAccountId}`
  );

  return {
    profile: {
      firstName: profileData.firstName,
      lastName: profileData.lastName,
      phone: profileData.phone,
      practiceName: profileData.practiceName,
      operationalJurisdiction: profileData.operationalJurisdiction,
      domainName: profileData.domainName,
    },
  };
}

/**
 * Complete onboarding for a password-only user who has no google_connections row.
 *
 * Creates the organization + org_user link, updates the user profile,
 * and marks onboarding complete on the organization — all in one transaction.
 *
 * Returns the new organizationId so the caller can attach it to the response.
 */
export async function completeOnboardingForPasswordUser(
  userId: number,
  profileData: ProfileData
): Promise<ProfileCompletionResult & { organizationId: number }> {
  let orgId: number;

  await db.transaction(async (trx) => {
    const result = await bootstrapOrganization(
      userId,
      profileData.practiceName,
      profileData.domainName,
      trx
    );
    orgId = result.organizationId;

    // Only update org settings if user created a new org (not joining via invitation)
    if (!result.joinedViaInvitation) {
      await OrganizationModel.updateById(
        orgId,
        {
          name: profileData.practiceName,
          domain: profileData.domainName,
          operational_jurisdiction: profileData.operationalJurisdiction,
          onboarding_completed: true,
        },
        trx
      );
    }

    // Update user profile fields
    await UserModel.updateProfile(
      userId,
      {
        first_name: profileData.firstName,
        last_name: profileData.lastName,
        phone: profileData.phone,
      },
      trx
    );
  });

  logger.info(
    `[Onboarding] Completed onboarding for password user ${userId}, org ${orgId!}`
  );

  return {
    organizationId: orgId!,
    profile: {
      firstName: profileData.firstName,
      lastName: profileData.lastName,
      phone: profileData.phone,
      practiceName: profileData.practiceName,
      operationalJurisdiction: profileData.operationalJurisdiction,
      domainName: profileData.domainName,
    },
  };
}

/**
 * Save profile data and bootstrap organization — Step 2 of the restructured flow.
 *
 * Creates the organization (or updates it if it already exists) and saves the
 * user's profile fields. Does NOT mark onboarding as complete — that happens
 * in Step 3 after GBP connection.
 *
 * Works for both password-only and OAuth users.
 */
export async function saveProfileAndBootstrapOrg(
  userId: number,
  organizationId: number | undefined,
  profileData: ProfileData
): Promise<SaveProfileResult> {
  let orgId: number;

  await db.transaction(async (trx) => {
    if (organizationId) {
      // Org already exists — update it
      orgId = organizationId;
      await OrganizationModel.updateById(
        orgId,
        {
          name: profileData.practiceName,
          domain: profileData.domainName,
          operational_jurisdiction: profileData.operationalJurisdiction,
        },
        trx
      );
    } else {
      // No org yet — bootstrap one (or join via invitation)
      const result = await bootstrapOrganization(
        userId,
        profileData.practiceName,
        profileData.domainName,
        trx
      );
      orgId = result.organizationId;

      // Only update org settings if user created a new org (not joining via invitation)
      if (!result.joinedViaInvitation) {
        await OrganizationModel.updateById(
          orgId,
          {
            operational_jurisdiction: profileData.operationalJurisdiction,
          },
          trx
        );
      }
    }

    // Update user profile fields
    await UserModel.updateProfile(
      userId,
      {
        first_name: profileData.firstName,
        last_name: profileData.lastName,
        phone: profileData.phone,
      },
      trx
    );
  });

  logger.info(
    `[Onboarding] Saved profile for user ${userId}, org ${orgId!}`
  );

  return {
    organizationId: orgId!,
    profile: {
      firstName: profileData.firstName,
      lastName: profileData.lastName,
      phone: profileData.phone,
      practiceName: profileData.practiceName,
      operationalJurisdiction: profileData.operationalJurisdiction,
      domainName: profileData.domainName,
    },
  };
}

/**
 * Mark onboarding as complete on the organization — Step 3 finalization.
 *
 * Called after GBP connection (or skip). Only sets the flag; profile data
 * was already saved in Step 2 via saveProfileAndBootstrapOrg.
 */
export async function markOnboardingComplete(
  organizationId: number
): Promise<void> {
  await OrganizationModel.completeOnboarding(organizationId);
  logger.info(
    `[Onboarding] Marked onboarding complete for org ${organizationId}`
  );
}
