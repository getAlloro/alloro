import { google } from "googleapis";
import { db } from "../database/connection";
import { OrganizationLifecycleService } from "../services/OrganizationLifecycleService";
import logger from "../lib/logger";

// OAuth2 configuration interface
interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface GoogleOAuthClientOptions {
  forceRefresh?: boolean;
}

// Get OAuth2 configuration from environment variables
const getOAuth2Config = (): OAuth2Config => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    const missing = [];
    if (!clientId) missing.push("GOOGLE_CLIENT_ID");
    if (!clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
    if (!redirectUri) missing.push("GOOGLE_REDIRECT_URI");

    throw new Error(
      `Missing required OAuth2 environment variables: ${missing.join(", ")}`
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
  };
};

/**
 * Create OAuth2 client for a specific Google connection.
 * Fetches the refresh token from the database for the given connection ID.
 *
 * @param connectionId - The ID from google_connections table
 * @returns OAuth2Client configured with the connection's refresh token
 */
export const createOAuth2ClientForConnection = async (connectionId: number) => {
  const config = getOAuth2Config();

  const connection = await db("google_connections")
    .where({ id: connectionId })
    .first();

  if (!connection) {
    throw new Error(`Google connection not found: ${connectionId}`);
  }

  if (!connection.refresh_token) {
    throw new Error(
      `No refresh token found for Google connection: ${connectionId}`
    );
  }

  if (connection.organization_id) {
    await OrganizationLifecycleService.assertActive(connection.organization_id);
  }

  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );

  oauth2Client.setCredentials({
    refresh_token: connection.refresh_token,
    access_token: connection.access_token || undefined,
  });

  return oauth2Client;
};

/**
 * Get a valid OAuth2 client for a specific Google connection.
 * Checks if the access token is expired or expiring soon and refreshes if needed.
 * Updates the database with the new token if a refresh occurs.
 *
 * @param connectionId - The ID from google_connections table
 * @returns OAuth2Client with valid credentials
 */
export const getValidOAuth2ClientByConnection = async (
  connectionId: number,
  options: GoogleOAuthClientOptions = {}
) => {
  const config = getOAuth2Config();

  const connection = await db("google_connections")
    .where({ id: connectionId })
    .first();

  if (!connection) {
    throw new Error(`Google connection not found: ${connectionId}`);
  }

  if (!connection.refresh_token) {
    throw new Error(
      `No refresh token found for Google connection: ${connectionId}`
    );
  }

  if (connection.organization_id) {
    await OrganizationLifecycleService.assertActive(connection.organization_id);
  }

  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );

  // Check if token is expired or expiring soon (< 5 minutes)
  const expiryDate = connection.expiry_date
    ? new Date(connection.expiry_date)
    : new Date(0);
  const isExpiringSoon = expiryDate.getTime() - Date.now() < 5 * 60 * 1000;
  const shouldRefresh = options.forceRefresh || isExpiringSoon;

  if (shouldRefresh) {
    logger.info(
      options.forceRefresh
        ? `[OAuth Helper] Force refreshing token for connection ${connectionId}`
        : `[OAuth Helper] Token expiring soon, refreshing for connection ${connectionId}`
    );

    oauth2Client.setCredentials({
      refresh_token: connection.refresh_token,
    });

    try {
      const { credentials } = await oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        throw new Error("Failed to obtain access token after refresh");
      }

      const newExpiry = credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : new Date(Date.now() + 3600000);

      await db("google_connections").where({ id: connectionId }).update({
        access_token: credentials.access_token,
        expiry_date: newExpiry,
        updated_at: new Date(),
      });

      logger.info(
        `[OAuth Helper] Token refreshed for connection ${connectionId}`
      );

      oauth2Client.setCredentials({
        access_token: credentials.access_token,
        refresh_token: connection.refresh_token,
        expiry_date: credentials.expiry_date,
        scope: credentials.scope,
        token_type: credentials.token_type,
      });
    } catch (error: any) {
      logger.error({ err: error.message }, `[OAuth Helper] Failed to refresh token for connection ${connectionId}:`);
      throw error;
    }
  } else {
    oauth2Client.setCredentials({
      access_token: connection.access_token,
      refresh_token: connection.refresh_token,
      expiry_date: connection.expiry_date
        ? new Date(connection.expiry_date).getTime()
        : undefined,
    });
  }

  return oauth2Client;
};

/**
 * Get a valid OAuth2 client by organization ID.
 * Looks up the google_connections record for the organization.
 *
 * @param organizationId - The organization ID
 * @returns OAuth2Client with valid credentials
 */
export const getValidOAuth2ClientByOrg = async (
  organizationId: number,
  options: GoogleOAuthClientOptions = {}
) => {
  const connection = await db("google_connections")
    .where({ organization_id: organizationId })
    .first();

  if (!connection) {
    throw new Error(
      `No Google connection found for organization: ${organizationId}`
    );
  }

  return getValidOAuth2ClientByConnection(connection.id, options);
};

// Backward-compatible aliases — callers will be migrated in Plan 04 Step 7
/** @deprecated Use createOAuth2ClientForConnection */
export const createOAuth2ClientForAccount = createOAuth2ClientForConnection;
/** @deprecated Use getValidOAuth2ClientByConnection or getValidOAuth2ClientByOrg */
export const getValidOAuth2Client = getValidOAuth2ClientByConnection;

/**
 * Legacy: Create OAuth2 client with refresh token from environment variable
 * @deprecated Use createOAuth2ClientForConnection for multi-tenant support
 */
export const createOAuth2Client = () => {
  const config = getOAuth2Config();
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!refreshToken) {
    throw new Error("Missing GOOGLE_REFRESH_TOKEN environment variable");
  }

  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  return oauth2Client;
};

// Legacy aliases for backward compatibility
export const createCustomAuth = createOAuth2Client;
