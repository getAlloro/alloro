/**
 * Admin Websites — Redirects Controller
 *
 * Project redirect CRUD plus bulk create.
 *
 * Behavior-preserving split from the former monolithic AdminWebsitesController.
 * Handlers and helpers are moved verbatim; logic is unchanged. Bound by the
 * matching resource sub-router under src/routes/admin/websites/.
 */

import { Request, Response } from "express";
import * as redirectsService from "./feature-services/service.redirects";
import logger from "../../lib/logger";

/** GET /:id/redirects — List redirects for a project */
export async function listRedirects(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId } = req.params;
    const { type } = req.query;
    const redirects = await redirectsService.listRedirects(projectId, {
      type: type ? parseInt(type as string, 10) : undefined,
    });
    return res.json({ success: true, data: redirects });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error listing redirects:");
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /:id/redirects — Create a redirect */

/** POST /:id/redirects — Create a redirect */
export async function createRedirect(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId } = req.params;
    const result = await redirectsService.createRedirect(projectId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.redirect });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error creating redirect:");
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** POST /:id/redirects/bulk — Bulk create redirects */

/** POST /:id/redirects/bulk — Bulk create redirects */
export async function bulkCreateRedirects(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId } = req.params;
    const { redirects } = req.body;
    if (!Array.isArray(redirects)) {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "redirects array is required" });
    }
    const result = await redirectsService.bulkCreateRedirects(projectId, redirects);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error bulk creating redirects:");
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** PATCH /:id/redirects/:redirectId — Update a redirect */

/** PATCH /:id/redirects/:redirectId — Update a redirect */
export async function updateRedirect(req: Request, res: Response): Promise<Response> {
  try {
    const { redirectId } = req.params;
    const result = await redirectsService.updateRedirect(redirectId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.redirect });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error updating redirect:");
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /:id/redirects/:redirectId — Delete a redirect */

/** DELETE /:id/redirects/:redirectId — Delete a redirect */
export async function deleteRedirect(req: Request, res: Response): Promise<Response> {
  try {
    const { redirectId } = req.params;
    const result = await redirectsService.deleteRedirect(redirectId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error deleting redirect:");
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

// =====================================================================
// COSTS — per-project AI cost rollup (Anthropic only in MVP)
// =====================================================================

/** GET /:projectId/costs — Per-project AI cost events + totals */
