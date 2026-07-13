import { Request, Response } from "express";
import { RBACRequest } from "../../middleware/rbac";
import {
  FormResponderSettingsModel,
  FormResponderSettingsUpsert,
  ResponderMode,
} from "../../models/FormResponderSettingsModel";
import logger from "../../lib/logger";

const VALID_MODES: ResponderMode[] = ["ai", "custom"];

/**
 * GET /api/responder-settings
 *
 * Owner-facing read of the auto-responder settings for an org/location scope.
 * Returns the stored row when present, otherwise a defaults object (responder
 * off, AI mode) so the settings UI always has a shape to render.
 *
 * Auth: authenticateToken + rbacMiddleware (mirrors /api/dashboard/metrics).
 *
 * Query params:
 *   - organization_id (required, int)
 *   - location_id     (optional, int)
 *
 * Response: { success: true, data: IFormResponderSettings | defaults }
 */
export async function getResponderSettings(req: Request, res: Response) {
  try {
    // Org comes from the caller's TRUSTED RBAC scope, never a client-supplied
    // query/body param. A settings read/write must not trust a caller-named org:
    // that is a cross-tenant IDOR, and on the write path it weaponizes another
    // org's lead-facing reply copy. (rbac.ts populates req.organizationId.)
    const organizationId = (req as RBACRequest).organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: "No organization in scope",
      });
    }

    const locationIdRaw = req.query.location_id
      ? parseInt(String(req.query.location_id), 10)
      : undefined;
    const locationId =
      locationIdRaw !== undefined && !isNaN(locationIdRaw)
        ? locationIdRaw
        : null;

    const settings = await FormResponderSettingsModel.findForScope(
      organizationId,
      locationId
    );

    return res.json({
      success: true,
      data:
        settings ?? {
          organization_id: organizationId,
          location_id: null,
          enabled: false,
          mode: "ai",
          reply_subject: null,
          reply_body: null,
        },
    });
  } catch (error: any) {
    logger.error(
      { err: error?.message || error },
      "Error in GET /responder-settings:"
    );
    return res.status(error?.statusCode || 500).json({
      success: false,
      error: `Failed to fetch responder settings: ${error?.message || "Unknown error"}`,
    });
  }
}

/**
 * PUT /api/responder-settings
 *
 * Owner-facing write of the auto-responder settings for an org/location scope.
 * Upserts the scope row and returns the persisted settings.
 *
 * Auth: authenticateToken + rbacMiddleware (mirrors /api/dashboard/metrics).
 *
 * Query params:
 *   - organization_id (required, int)
 *   - location_id     (optional, int)
 *
 * Body (all optional):
 *   - enabled       (boolean, coerced)
 *   - mode          ('ai' | 'custom')
 *   - reply_subject (string | null)
 *   - reply_body    (string | null)
 *
 * Response: { success: true, data: IFormResponderSettings }
 */
export async function updateResponderSettings(req: Request, res: Response) {
  try {
    // Org comes from the caller's TRUSTED RBAC scope, never a client-supplied
    // query/body param. A settings read/write must not trust a caller-named org:
    // that is a cross-tenant IDOR, and on the write path it weaponizes another
    // org's lead-facing reply copy. (rbac.ts populates req.organizationId.)
    const organizationId = (req as RBACRequest).organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: "No organization in scope",
      });
    }

    const locationIdRaw = req.query.location_id
      ? parseInt(String(req.query.location_id), 10)
      : undefined;
    const locationId =
      locationIdRaw !== undefined && !isNaN(locationIdRaw)
        ? locationIdRaw
        : null;

    const body = (req.body ?? {}) as {
      enabled?: unknown;
      mode?: unknown;
      reply_subject?: unknown;
      reply_body?: unknown;
    };

    const update: FormResponderSettingsUpsert = {};

    if (body.mode !== undefined) {
      if (!VALID_MODES.includes(body.mode as ResponderMode)) {
        return res.status(400).json({
          success: false,
          error: "Invalid mode parameter (must be 'ai' or 'custom')",
        });
      }
      update.mode = body.mode as ResponderMode;
    }

    if (body.enabled !== undefined) {
      update.enabled = Boolean(body.enabled);
    }

    if (body.reply_subject !== undefined) {
      if (body.reply_subject !== null && typeof body.reply_subject !== "string") {
        return res.status(400).json({
          success: false,
          error: "reply_subject must be a string or null",
        });
      }
      update.reply_subject = body.reply_subject as string | null;
    }

    if (body.reply_body !== undefined) {
      if (body.reply_body !== null && typeof body.reply_body !== "string") {
        return res.status(400).json({
          success: false,
          error: "reply_body must be a string or null",
        });
      }
      update.reply_body = body.reply_body as string | null;
    }

    const settings = await FormResponderSettingsModel.upsertForScope(
      organizationId,
      locationId,
      update
    );

    return res.json({
      success: true,
      data: settings,
    });
  } catch (error: any) {
    logger.error(
      { err: error?.message || error },
      "Error in PUT /responder-settings:"
    );
    return res.status(error?.statusCode || 500).json({
      success: false,
      error: `Failed to update responder settings: ${error?.message || "Unknown error"}`,
    });
  }
}
