/**
 * Admin Organization Creation Service
 *
 * Creates an organization with an initial admin user account.
 * All operations run in a single transaction — all or nothing.
 *
 * Pre-completes onboarding flags so the created user skips onboarding entirely.
 */

import bcrypt from "bcrypt";
import { Knex } from "knex";
import { db } from "../../../database/connection";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { UserModel } from "../../../models/UserModel";
import { OrganizationUserModel } from "../../../models/OrganizationUserModel";
import { LocationModel } from "../../../models/LocationModel";
import logger from "../../../lib/logger";

const BCRYPT_SALT_ROUNDS = 12;

// ─── Types ───

export interface CreateOrgInput {
  organization: {
    name: string;
    domain?: string;
    address?: string;
  };
  user: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  };
  location: {
    name: string;
    address?: string;
  };
}

export interface CreateOrgResult {
  success: boolean;
  organizationId: number;
  userId: number;
  locationId: number;
  message: string;
}

// ─── Validation ───

/**
 * Validate password strength (same rules as registration):
 * - Minimum 8 characters
 * - At least 1 uppercase letter
 * - At least 1 number
 */
function validatePassword(password: string): string | null {
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters long";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number";
  }
  return null;
}

// ─── Service ───

/**
 * Create an organization with an initial admin user.
 *
 * Transactional — creates org, user, org-user link, primary location,
 * and pre-completes all onboarding flags.
 */
export async function createOrganizationWithUser(
  input: CreateOrgInput
): Promise<CreateOrgResult> {
  // ── Validate inputs ──
  const { organization, user, location } = input;

  if (!organization.name || organization.name.trim().length === 0) {
    throw { statusCode: 400, message: "Organization name is required" };
  }

  if (!user.email || user.email.trim().length === 0) {
    throw { statusCode: 400, message: "User email is required" };
  }

  // Validate email format (basic)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(user.email)) {
    throw { statusCode: 400, message: "Invalid email format" };
  }

  // Validate password
  const passwordError = validatePassword(user.password);
  if (passwordError) {
    throw { statusCode: 400, message: passwordError };
  }

  // Check email uniqueness
  const existingUser = await UserModel.findByEmail(user.email);
  if (existingUser) {
    throw {
      statusCode: 409,
      message: "A user with this email already exists",
    };
  }

  // ── Execute in transaction ──
  const trx = await db.transaction();

  try {
    // 1. Create organization
    const org = await OrganizationModel.create(
      {
        name: organization.name.trim(),
        domain: organization.domain?.trim() || undefined,
      },
      trx
    );

    // Default to DFY tier (single-product model), set operational jurisdiction,
    // and pre-complete onboarding flags
    await OrganizationModel.updateById(
      org.id,
      {
        subscription_tier: "DFY",
        subscription_status: "active",
        operational_jurisdiction: organization.address?.trim() || null,
        onboarding_completed: true,
        onboarding_wizard_completed: true,
        setup_progress: {
          step1_api_connected: false,
          step2_pms_uploaded: false,
          dismissed: false,
          completed: false,
        },
      } as any,
      trx
    );

    // 2. Hash password and create user
    const passwordHash = await bcrypt.hash(user.password, BCRYPT_SALT_ROUNDS);

    const createdUser = await UserModel.create(
      {
        email: user.email.toLowerCase().trim(),
        password_hash: passwordHash,
      },
      trx
    );

    // Set user profile fields and mark email as verified (admin-created users skip verification)
    await UserModel.updateProfile(
      createdUser.id,
      {
        first_name: user.firstName?.trim() || undefined,
        last_name: user.lastName?.trim() || undefined,
      },
      trx
    );
    await UserModel.setEmailVerified(createdUser.id, trx);

    // 3. Link user to org as admin
    await OrganizationUserModel.create(
      {
        user_id: createdUser.id,
        organization_id: org.id,
        role: "admin",
      },
      trx
    );

    // 4. Create primary location
    const locationRecord = await LocationModel.create(
      {
        organization_id: org.id,
        name: location.name?.trim() || organization.name.trim(),
        domain: organization.domain?.trim() || null,
        is_primary: true,
      } as any,
      trx
    );

    await trx.commit();

    logger.info(
      `[Admin] Organization created: ${org.id} (${org.name}) with user ${createdUser.id} (${createdUser.email})`
    );

    return {
      success: true,
      organizationId: org.id,
      userId: createdUser.id,
      locationId: locationRecord.id,
      message: `Organization "${org.name}" created with admin user ${createdUser.email}`,
    };
  } catch (error) {
    await trx.rollback();
    throw error;
  }
}
