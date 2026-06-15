/**
 * Admin Websites — Project Code Snippets Controller
 *
 * Project-scoped header/footer code-snippet CRUD plus reorder and per-snippet toggle.
 *
 * Behavior-preserving split from the former monolithic AdminWebsitesController.
 * Handlers and helpers are moved verbatim; logic is unchanged. Bound by the
 * matching resource sub-router under src/routes/admin/websites/.
 */

import { Request, Response } from "express";
import * as hfcmManager from "./feature-services/service.hfcm-manager";
import logger from "../../lib/logger";

/** GET /:projectId/code-snippets — List project snippets */
export async function listProjectSnippets(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId } = req.params;
    const snippets = await hfcmManager.listProjectSnippets(projectId);
    return res.json({
      success: true,
      data: snippets,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[HFCM] Error fetching project code snippets:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch code snippets",
    });
  }
}

/** POST /:projectId/code-snippets — Create project snippet */

/** POST /:projectId/code-snippets — Create project snippet */
export async function createProjectSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId } = req.params;
    const { snippet, error } = await hfcmManager.createProjectSnippet(
      projectId,
      req.body
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(201).json({
      success: true,
      data: snippet,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[HFCM] Error creating project code snippet:");
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create code snippet",
    });
  }
}

/** PATCH /:projectId/code-snippets/:id — Update project snippet */

/** PATCH /:projectId/code-snippets/:id — Update project snippet */
export async function updateProjectSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId, id } = req.params;
    const { snippet, error } = await hfcmManager.updateProjectSnippet(
      projectId,
      id,
      req.body
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({
      success: true,
      data: snippet,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[HFCM] Error updating project code snippet:");
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update code snippet",
    });
  }
}

/** DELETE /:projectId/code-snippets/:id — Delete project snippet */

/** DELETE /:projectId/code-snippets/:id — Delete project snippet */
export async function deleteProjectSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId, id } = req.params;
    const { error } = await hfcmManager.deleteProjectSnippet(projectId, id);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({
      success: true,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[HFCM] Error deleting project code snippet:");
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete code snippet",
    });
  }
}

/** PATCH /:projectId/code-snippets/:id/toggle — Toggle project snippet */

/** PATCH /:projectId/code-snippets/:id/toggle — Toggle project snippet */
export async function toggleProjectSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId, id } = req.params;
    const { is_enabled, error } = await hfcmManager.toggleProjectSnippet(
      projectId,
      id
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({
      success: true,
      data: { is_enabled },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[HFCM] Error toggling project code snippet:");
    return res.status(500).json({
      success: false,
      error: "TOGGLE_ERROR",
      message: error?.message || "Failed to toggle code snippet",
    });
  }
}

/** PATCH /:projectId/code-snippets/reorder — Reorder project snippets */

/** PATCH /:projectId/code-snippets/reorder — Reorder project snippets */
export async function reorderProjectSnippets(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId } = req.params;
    const { snippetIds } = req.body;
    const { error } = await hfcmManager.reorderProjectSnippets(
      projectId,
      snippetIds
    );

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({
      success: true,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[HFCM] Error reordering project code snippets:");
    return res.status(500).json({
      success: false,
      error: "REORDER_ERROR",
      message: error?.message || "Failed to reorder code snippets",
    });
  }
}

// =====================================================================
// RECIPIENTS
// =====================================================================

/** GET /:id/recipients — Get configured recipients + org users */
