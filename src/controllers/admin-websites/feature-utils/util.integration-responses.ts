/**
 * Website Integrations — shared HTTP response + error-mapping helpers.
 *
 * Extracted from WebsiteIntegrationsController.ts to keep the controller thin.
 * These preserve the controller's exact wire shapes:
 *   success → { success: true, data }
 *   failure → { success: false, error: <code>, message }
 *
 * The platform error-mappers translate a thrown typed service error
 * (GscIntegrationError / RybbitIntegrationError / RybbitHistoryError /
 * ClarityIntegrationError) into the matching fail() response, falling back to a
 * 500 (with an auth-aware override for GSC) when the error is not recognized.
 */

import type { Request, Response } from "express";
import type { RBACRequest } from "../../../middleware/rbac";
import logger from "../../../lib/logger";
import { ClarityIntegrationError } from "../feature-services/service.clarity-integration";
import {
  GscIntegrationError,
  type GscActorContext,
} from "../feature-services/service.gsc-integration";
import { RybbitHistoryError } from "../feature-services/service.rybbit-history";
import { RybbitIntegrationError } from "../feature-services/service.rybbit-integration";

export const LOG_PREFIX = "[Website Integrations]";

export function ok<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ success: true, data });
}

export function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
): Response {
  return res.status(status).json({ success: false, error: code, message });
}

export function failGscError(
  res: Response,
  error: unknown,
  fallbackMessage: string,
): Response {
  if (error instanceof GscIntegrationError) {
    return fail(res, error.status, error.code, error.message);
  }

  logger.error({ err: error }, `${LOG_PREFIX} ${fallbackMessage}:`);
  const maybeCode = (error as { code?: number; response?: { status?: number } })?.code;
  const maybeStatus = (error as { response?: { status?: number } })?.response?.status;
  const status = maybeCode || maybeStatus;
  if (status === 401 || status === 403) {
    return fail(res, 401, "AUTH_FAILED", "Google OAuth token is invalid or expired");
  }

  return fail(res, 500, "GSC_ERROR", fallbackMessage);
}

export function getAdminGscActor(req: Request): GscActorContext {
  const authReq = req as RBACRequest;
  if (!authReq.userId) {
    throw new GscIntegrationError(
      401,
      "AUTH_REQUIRED",
      "Authentication is required to manage Search Console integrations",
    );
  }

  return {
    mode: "admin",
    userId: authReq.userId,
    organizationId: authReq.organizationId,
  };
}

export function failRybbitError(
  res: Response,
  error: unknown,
  fallbackMessage: string,
): Response {
  if (error instanceof RybbitIntegrationError) {
    return fail(res, error.status, error.code, error.message);
  }

  logger.error({ err: error }, `${LOG_PREFIX} ${fallbackMessage}:`);
  return fail(res, 500, "RYBBIT_ERROR", fallbackMessage);
}

export function failRybbitHistoryError(
  res: Response,
  error: unknown,
  fallbackMessage: string,
): Response {
  if (error instanceof RybbitHistoryError) {
    return fail(res, error.status, error.code, error.message);
  }

  logger.error({ err: error }, `${LOG_PREFIX} ${fallbackMessage}:`);
  return fail(res, 500, "RYBBIT_HISTORY_ERROR", fallbackMessage);
}

export function failClarityError(
  res: Response,
  error: unknown,
  fallbackMessage: string,
): Response {
  if (error instanceof ClarityIntegrationError) {
    return fail(res, error.status, error.code, error.message);
  }

  logger.error({ err: error }, `${LOG_PREFIX} ${fallbackMessage}:`);
  return fail(res, 500, "CLARITY_ERROR", fallbackMessage);
}
