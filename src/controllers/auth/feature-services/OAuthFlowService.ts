import { OAuth2Client } from "google-auth-library";
import { UserModel, IUser } from "../../../models/UserModel";
import { GoogleConnectionModel, IGoogleConnection } from "../../../models/GoogleConnectionModel";
import { OrganizationUserModel } from "../../../models/OrganizationUserModel";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { QueryContext } from "../../../models/BaseModel";
import type { AuthenticatedContext } from "../feature-utils/security-utils";
import logger from "../../../lib/logger";

/**
 * Google user profile from OAuth response
 */
export interface GoogleUserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
  verified_email?: boolean;
}

/**
 * Required OAuth scopes for GBP API
 */
const REQUIRED_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/business.manage",
] as const;

/**
 * Result of the complete OAuth flow
 */
export interface OAuthFlowResult {
  user: IUser;
  googleAccount: IGoogleConnection;
}

/**
 * Exchanges an authorization code for OAuth tokens.
 *
 * @param oauth2Client The configured OAuth2 client
 * @param code Authorization code from Google OAuth callback
 * @returns Token credentials from Google
 */
export async function exchangeCodeForTokens(
  oauth2Client: OAuth2Client,
  code: string,
): Promise<any> {
  logger.info("[AUTH] Exchanging authorization code for tokens");
  const { tokens } = await oauth2Client.getToken(code);

  // Set credentials on client BEFORE using it
  oauth2Client.setCredentials(tokens);

  if (!tokens.refresh_token) {
    logger.warn(
      "[AUTH] No refresh token received - user may have already authorized",
    );
  }

  logger.info({ detail: {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiryDate: tokens.expiry_date,
        scopes: tokens.scope,
        accessTokenPreview: tokens.access_token
          ? `${tokens.access_token.substring(0, 10)}...${tokens.access_token.substring(
              tokens.access_token.length - 10,
            )}`
          : "NONE",
        accessTokenLength: tokens.access_token?.length || 0,
      } }, "[AUTH] OAuth tokens received:");

  if (!tokens.access_token) {
    throw new Error("No access token received from Google OAuth");
  }

  return tokens;
}

/**
 * Fetches the user profile from Google using the access token.
 *
 * @param accessToken Valid Google OAuth access token
 * @returns Google user profile data
 */
export async function fetchGoogleUserProfile(
  accessToken: string,
): Promise<GoogleUserProfile> {
  logger.info("[AUTH] Fetching user profile from Google");
  logger.info({ detail: {
        preview: `${accessToken.substring(0, 10)}...${accessToken.substring(
          accessToken.length - 10,
        )}`,
        length: accessToken.length,
        authHeader: `Bearer ${accessToken.substring(0, 20)}...`,
      } }, "[AUTH] Using access token:");

  const userInfoResponse = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!userInfoResponse.ok) {
    const errorText = await userInfoResponse.text();
    throw new Error(
      `Failed to fetch user profile: ${userInfoResponse.status} ${userInfoResponse.statusText}. ${errorText}`,
    );
  }

  const profile = await userInfoResponse.json();

  if (!profile.id || !profile.email) {
    throw new Error("Invalid user profile received from Google");
  }

  const googleProfile: GoogleUserProfile = {
    id: profile.id,
    email: profile.email,
    name: profile.name || profile.email.split("@")[0],
    picture: profile.picture || undefined,
    verified_email: profile.verified_email || undefined,
  };

  logger.info({ detail: {
        id: googleProfile.id,
        email: googleProfile.email,
        name: googleProfile.name,
        verified: googleProfile.verified_email,
      } }, "[AUTH] Google profile fetched:");

  return googleProfile;
}

/**
 * Builds the account data object for Google account creation/update.
 */
function buildAccountData(
  googleProfile: GoogleUserProfile,
  tokens: any,
): Partial<IGoogleConnection> {
  const accountData: Partial<IGoogleConnection> = {
    google_user_id: googleProfile.id,
    email: googleProfile.email.toLowerCase(),
    access_token: tokens.access_token,
    token_type: tokens.token_type || "Bearer",
    expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    scopes: tokens.scope || REQUIRED_SCOPES.join(","),
  };

  if (tokens.refresh_token) {
    accountData.refresh_token = tokens.refresh_token;
  }

  return accountData;
}

/**
 * Ensures the user has an organization relationship with admin role for OAuth users.
 * Used within a transaction context.
 *
 * @param userId User's internal ID
 * @param organizationId Organization ID to link
 * @param trx Optional transaction context
 */
async function ensureOrganizationLink(
  userId: number,
  organizationId: number,
  trx?: QueryContext,
): Promise<void> {
  const orgUser = await OrganizationUserModel.findByUserAndOrg(
    userId,
    organizationId,
    trx,
  );

  if (!orgUser) {
    await OrganizationUserModel.create(
      {
        user_id: userId,
        organization_id: organizationId,
        role: "admin",
      },
      trx,
    );
    logger.info(
      `[AUTH] Created admin role for user ${userId} in organization`,
    );
  }
}

async function resolveOAuthOrganizationId(
  user: IUser,
  googleProfile: GoogleUserProfile,
  authenticatedOrgId?: number,
  trx?: QueryContext,
): Promise<number> {
  if (authenticatedOrgId) {
    logger.info(`[AUTH] Using authenticated org ${authenticatedOrgId}`);
    return authenticatedOrgId;
  }

  const orgUser = await OrganizationUserModel.findByUserId(user.id, trx);
  if (orgUser) {
    return orgUser.organization_id;
  }

  const newOrg = await OrganizationModel.create(
    { name: `${user.name || googleProfile.name}'s Organization` },
    trx,
  );
  await OrganizationUserModel.create(
    { user_id: user.id, organization_id: newOrg.id, role: "admin" },
    trx,
  );
  logger.info(`[AUTH] Created organization ${newOrg.id} for user ${user.id}`);

  return newOrg.id;
}

/**
 * Completes the OAuth flow using a database transaction.
 * Creates or updates the user and Google account atomically.
 *
 * @param tokens OAuth tokens from Google
 * @param googleProfile Fetched Google user profile
 * @returns User and Google account created/updated within the transaction
 */
export async function completeOAuthFlow(
  tokens: any,
  googleProfile: GoogleUserProfile,
  authenticatedContext?: AuthenticatedContext | null,
): Promise<OAuthFlowResult> {
  logger.info("[AUTH] Starting database transaction");

  const result = await UserModel.transaction(async (trx) => {
    let user: IUser;

    if (authenticatedContext) {
      // Authenticated flow (connecting GBP from settings) — use the known user
      const existingUser = await UserModel.findById(authenticatedContext.userId, trx);
      if (!existingUser) {
        throw new Error(`Authenticated user ${authenticatedContext.userId} not found`);
      }
      user = existingUser;
      logger.info(`[AUTH] Using authenticated user: ${user.email} (ID: ${user.id})`);
    } else {
      // Unauthenticated flow (sign-up via Google) — find or create by email
      user = await UserModel.findOrCreate(
        googleProfile.email,
        googleProfile.name,
        trx,
      );
      logger.info(`[AUTH] User resolved: ${googleProfile.email} (ID: ${user.id})`);
    }

    // Build account data
    const accountData = buildAccountData(googleProfile, tokens);

    const targetOrgId = authenticatedContext
      ? await resolveOAuthOrganizationId(
          user,
          googleProfile,
          authenticatedContext.orgId,
          trx,
        )
      : undefined;
    const existingAccount = targetOrgId
      ? await GoogleConnectionModel.findByGoogleUserIdForOrganization(
          googleProfile.id,
          targetOrgId,
          trx,
        )
      : await GoogleConnectionModel.findByGoogleUserId(
          googleProfile.id,
          undefined,
          trx,
        );

    let googleAccount: IGoogleConnection;
    if (existingAccount) {
      await GoogleConnectionModel.updateById(existingAccount.id, accountData, trx);
      googleAccount = { ...existingAccount, ...accountData } as IGoogleConnection;
      logger.info(`[AUTH] Updated Google account for user ${user.id}, org ${googleAccount.organization_id}`);
    } else {
      // Determine organization — prefer authenticated context, then existing org, then create new
      const organizationId =
        targetOrgId ||
        (await resolveOAuthOrganizationId(user, googleProfile, undefined, trx));

      if (!accountData.refresh_token) {
        throw new Error("No refresh token received for new Google connection");
      }

      googleAccount = await GoogleConnectionModel.create(
        { ...accountData, organization_id: organizationId },
        trx,
      );
      logger.info(`[AUTH] Created new Google connection for user ${user.id}, org ${organizationId}`);
    }

    // Ensure organization link if applicable
    if (googleAccount.organization_id) {
      await ensureOrganizationLink(user.id, googleAccount.organization_id, trx);
    }

    return { user, googleAccount };
  });

  logger.info("[AUTH] Database transaction completed successfully");
  return result;
}

/**
 * Fallback non-transactional save when the transaction fails.
 * Preserves the same create/update logic but without atomicity guarantees.
 *
 * @param tokens OAuth tokens from Google
 * @param googleProfile Fetched Google user profile
 * @returns User and Google account
 */
export async function handleFallbackAuth(
  tokens: any,
  googleProfile: GoogleUserProfile,
  authenticatedContext?: AuthenticatedContext | null,
): Promise<OAuthFlowResult> {
  logger.info("[AUTH] Attempting fallback non-transactional save...");

  let user: IUser;
  if (authenticatedContext) {
    const existingUser = await UserModel.findById(authenticatedContext.userId);
    if (!existingUser) {
      throw new Error(`Authenticated user ${authenticatedContext.userId} not found`);
    }
    user = existingUser;
  } else {
    user = await UserModel.findOrCreate(
      googleProfile.email,
      googleProfile.name,
    );
  }

  // Build account data
  const accountData = buildAccountData(googleProfile, tokens);

  const targetOrgId = authenticatedContext
    ? await resolveOAuthOrganizationId(
        user,
        googleProfile,
        authenticatedContext.orgId,
      )
    : undefined;
  const existingAccount = targetOrgId
    ? await GoogleConnectionModel.findByGoogleUserIdForOrganization(
        googleProfile.id,
        targetOrgId,
      )
    : await GoogleConnectionModel.findByGoogleUserId(
        googleProfile.id,
      );

  let googleAccount: IGoogleConnection;
  if (existingAccount) {
    await GoogleConnectionModel.updateById(existingAccount.id, accountData);
    googleAccount = { ...existingAccount, ...accountData } as IGoogleConnection;
  } else {
    const organizationId =
      targetOrgId ||
      (await resolveOAuthOrganizationId(user, googleProfile));

    if (!accountData.refresh_token) {
      throw new Error("No refresh token received for new Google connection");
    }

    googleAccount = await GoogleConnectionModel.create(
      { ...accountData, organization_id: organizationId },
    );
  }

  logger.info("[AUTH] Fallback non-transactional save completed");
  return { user, googleAccount };
}

/**
 * Gets the user's role for the response payload.
 * Defaults to "admin" for OAuth users.
 *
 * @param userId User's internal ID
 * @param organizationId Organization ID (may be null)
 * @returns Role string
 */
export async function getUserRole(
  userId: number,
  organizationId: number | null | undefined,
): Promise<string> {
  let userRole = "admin"; // Default for OAuth users
  if (organizationId) {
    const orgUser = await OrganizationUserModel.findByUserAndOrg(
      userId,
      organizationId,
    );
    if (orgUser) {
      userRole = orgUser.role;
    }
  }
  return userRole;
}
