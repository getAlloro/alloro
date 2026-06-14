import { Request, Response } from "express";
import { REQUIRED_SCOPES, SCOPE_DESCRIPTIONS, SUPPORTED_APIS } from "./utils/scopeDefinitions";
import { OAUTH2_CONFIG } from "./utils/oauthConfig";
import { formatOAuthError } from "./utils/errorHandler";
import { generateAuthorizationUrl, exchangeCodeForTokens } from "./services/OAuth2Service";
import { validateRefreshToken } from "./services/TokenValidationService";
import { generateSuccessPage } from "./utils/templates/successTemplate";
import { generateErrorPage } from "./utils/templates/errorTemplate";
import logger from "../../lib/logger";

// GET /url - Generate OAuth2 authorization URL
export async function generateAuthUrl(req: Request, res: Response) {
  try {
    logger.info("=== Generating OAuth2 Authorization URL ===");
    logger.info({ detail: REQUIRED_SCOPES }, "Required scopes:");

    const authUrl = generateAuthorizationUrl();

    logger.info("✅ Authorization URL generated successfully");

    res.json({
      authUrl,
      scopes: REQUIRED_SCOPES,
      message:
        "Visit the authUrl to authorize access for GBP API",
    });
  } catch (error: any) {
    return formatOAuthError(res, error, "Generate OAuth URL");
  }
}

// POST /callback - Exchange authorization code for tokens
export async function handleCallback(req: Request, res: Response) {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: "Authorization code is required" });
    }

    logger.info("=== Processing OAuth2 Callback ===");

    const tokens = await exchangeCodeForTokens(code);

    logger.info("✅ OAuth2 tokens received successfully");
    logger.info({ detail: {
            hasAccessToken: !!tokens.access_token,
            hasRefreshToken: !!tokens.refresh_token,
            expiryDate: tokens.expiry_date,
            scope: tokens.scope,
          } }, "Token info:");

    res.json({
      message:
        "Authorization successful - tokens obtained for GBP",
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiryDate: tokens.expiry_date,
      scope: tokens.scope,
      apis: [
        "Google Business Profile",
      ],
    });
  } catch (error: any) {
    return formatOAuthError(res, error, "OAuth callback");
  }
}

// GET /web-callback - Browser-based OAuth callback that returns HTML
export async function handleWebCallback(req: Request, res: Response) {
  try {
    const { code, error, state } = req.query;

    if (error) {
      return res.status(400).json({
        error: "OAuth authorization failed",
        details: error,
        description: req.query.error_description,
      });
    }

    if (!code) {
      return res.status(400).json({ error: "Authorization code is required" });
    }

    logger.info("=== Processing Web OAuth2 Callback ===");

    const tokens = await exchangeCodeForTokens(code as string);

    logger.info("✅ Web OAuth2 tokens received successfully");

    // Return enhanced success page with tokens
    res.send(generateSuccessPage(tokens));
  } catch (error: any) {
    logger.error({ err: error }, "Web OAuth callback error:");
    res.status(500).send(generateErrorPage(error.message));
  }
}

// GET /validate - Validate stored refresh token
export async function validateToken(req: Request, res: Response) {
  try {
    const result = await validateRefreshToken();

    if (result.valid) {
      res.json({
        valid: true,
        message: result.message,
        hasRefreshToken: !!OAUTH2_CONFIG.refreshToken,
        scopes: REQUIRED_SCOPES,
      });
    } else {
      res.status(401).json({
        valid: false,
        message: result.message,
      });
    }
  } catch (error: any) {
    return formatOAuthError(res, error, "Validate OAuth token");
  }
}

// GET /scopes - Return scope information
export async function getScopeInfo(req: Request, res: Response) {
  res.json({
    requiredScopes: REQUIRED_SCOPES,
    scopeDescriptions: SCOPE_DESCRIPTIONS,
    apisCovered: SUPPORTED_APIS,
  });
}
