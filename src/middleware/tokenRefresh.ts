import { Response, NextFunction } from "express";
import { GoogleConnectionModel } from "../models/GoogleConnectionModel";
import { createOAuth2ClientForConnection } from "../auth/oauth2Helper";
import { OAuth2Client } from "google-auth-library";
import { RBACRequest } from "./rbac";
import {
  getOrganizationLifecycleErrorStatus,
  OrganizationLifecycleService,
} from "../services/OrganizationLifecycleService";
import logger from "../lib/logger";

/**
 * Extended Express Request type with OAuth2Client.
 * Extends RBACRequest since tokenRefreshMiddleware runs after
 * authenticateToken + rbacMiddleware.
 */
export interface AuthenticatedRequest extends RBACRequest {
  oauth2Client?: OAuth2Client;
  googleConnectionId?: number;
}

/**
 * Token Refresh Middleware
 *
 * Optional middleware — only needed on routes that call Google APIs (GBP).
 * Requires authenticateToken + rbacMiddleware to have run first.
 *
 * Flow:
 * 1. Reads req.organizationId (from rbacMiddleware)
 * 2. Looks up google_connections by organization_id
 * 3. Refreshes OAuth token if expiring soon
 * 4. Attaches req.oauth2Client and req.googleConnectionId
 */
export const tokenRefreshMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const organizationId = req.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        error: "No organization",
        message: "Organization required for Google API access",
        timestamp: new Date().toISOString(),
      });
    }

    // Fetch Google connection for this organization
    const googleConnection =
      await GoogleConnectionModel.findFirstByOrganization(organizationId);

    if (!googleConnection) {
      return res.status(404).json({
        error: "No Google account connected",
        message: "Please connect your Google Business Profile first",
        timestamp: new Date().toISOString(),
      });
    }

    const connectionId = googleConnection.id;

    // Check if token is expired or expiring soon (< 5 minutes)
    const expiryDate = googleConnection.expiry_date
      ? new Date(googleConnection.expiry_date)
      : new Date(0);
    const isExpiringSoon = expiryDate.getTime() - Date.now() < 5 * 60 * 1000;

    try {
      await OrganizationLifecycleService.assertActive(organizationId);

      // Create OAuth2 client
      const oauth2Client = await createOAuth2ClientForConnection(connectionId);

      if (isExpiringSoon) {
        logger.info(
          `[Token Refresh] Token expiring soon, refreshing for connection ${connectionId}`
        );

        const { credentials } = await oauth2Client.refreshAccessToken();

        if (!credentials.access_token) {
          throw new Error("Failed to obtain access token after refresh");
        }

        const newExpiry = credentials.expiry_date
          ? new Date(credentials.expiry_date)
          : new Date(Date.now() + 3600000);

        await GoogleConnectionModel.updateTokens(connectionId, {
          access_token: credentials.access_token,
          expiry_date: newExpiry,
        });

        logger.info(
          `[Token Refresh] Token refreshed for connection ${connectionId}`
        );

        oauth2Client.setCredentials({
          access_token: credentials.access_token,
          refresh_token: googleConnection.refresh_token,
          expiry_date: credentials.expiry_date,
          scope: credentials.scope,
          token_type: credentials.token_type,
        });
      } else {
        logger.info(
          `[Token Refresh] Token valid for connection ${connectionId}, skipping refresh`
        );
        oauth2Client.setCredentials({
          access_token: googleConnection.access_token,
          refresh_token: googleConnection.refresh_token,
          expiry_date: googleConnection.expiry_date
            ? new Date(googleConnection.expiry_date).getTime()
            : undefined,
        });
      }

      // Attach to request
      req.oauth2Client = oauth2Client;
      req.googleConnectionId = connectionId;
    } catch (refreshError: any) {
      const lifecycleStatus = getOrganizationLifecycleErrorStatus(refreshError);
      if (lifecycleStatus) {
        return res.status(lifecycleStatus).json({
          error: refreshError.code,
          message: refreshError.message,
          timestamp: new Date().toISOString(),
        });
      }

      logger.error({ err: refreshError.message }, `[Token Refresh] Failed to refresh token for connection ${connectionId}:`);

      return res.status(401).json({
        error: "Token refresh failed",
        message: "Failed to refresh access token. Please re-authenticate.",
        details:
          process.env.NODE_ENV === "development"
            ? refreshError.message
            : undefined,
        timestamp: new Date().toISOString(),
      });
    }

    next();
  } catch (error: any) {
    logger.error({ err: error }, "[Token Refresh] Middleware error:");

    return res.status(500).json({
      error: "Authentication error",
      message: "Failed to process authentication",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
      timestamp: new Date().toISOString(),
    });
  }
};
