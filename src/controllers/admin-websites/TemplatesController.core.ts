/**
 * Admin Websites — Templates Controller (core)
 *
 * Templates CRUD + activate, template pages, and template snippets.
 *
 * Behavior-preserving split from the former monolithic AdminWebsitesController.
 * Handlers and helpers are moved verbatim; logic is unchanged. Bound by the
 * matching resource sub-router under src/routes/admin/websites/.
 */

import { Request, Response } from "express";
import * as templateManager from "./feature-services/service.template-manager";
import * as hfcmManager from "./feature-services/service.hfcm-manager";
import { TemplatePageModel } from "../../models/website-builder/TemplatePageModel";
import logger from "../../lib/logger";

/** GET /templates/:templateId/pages/:pageId/slots — Return dynamic_slots for a template page */
export async function getTemplatePageSlots(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { pageId } = req.params;
    const row = await TemplatePageModel.findDynamicSlotsById(pageId);

    if (!row) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    let slots = row.dynamic_slots;
    if (typeof slots === "string") {
      try { slots = JSON.parse(slots); } catch { slots = []; }
    }

    return res.json({ success: true, data: slots || [] });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching template page slots:");
    return res.status(500).json({ success: false, error: "FETCH_ERROR" });
  }
}

/** PATCH /templates/:templateId/pages/:pageId/slots — Update dynamic_slots (admin tool) */

/** PATCH /templates/:templateId/pages/:pageId/slots — Update dynamic_slots (admin tool) */
export async function updateTemplatePageSlots(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { pageId } = req.params;
    const { slots } = req.body;

    if (!Array.isArray(slots)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "slots must be an array",
      });
    }

    const updated = await TemplatePageModel.updateDynamicSlotsById(
      pageId,
      JSON.stringify(slots),
    );

    if (updated === 0) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    return res.json({ success: true, data: slots });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error updating template page slots:");
    return res.status(500).json({ success: false, error: "UPDATE_ERROR" });
  }
}

/** GET /:id/slot-prefill — Fetch pre-filled slot values for a template page OR layout */

/** GET /templates — List all templates */
export async function listTemplates(
  _req: Request,
  res: Response
): Promise<Response> {
  try {
    const templates = await templateManager.listTemplates();
    return res.json({
      success: true,
      data: templates,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching templates:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch templates",
    });
  }
}

/** POST /templates — Create a template */

/** POST /templates — Create a template */
export async function createTemplate(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { template, error } = await templateManager.createTemplate(req.body);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(201).json({
      success: true,
      data: template,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error creating template:");
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create template",
    });
  }
}

/** GET /templates/:templateId — Get template with pages */

/** GET /templates/:templateId — Get template with pages */
export async function getTemplate(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const template = await templateManager.getTemplateById(templateId);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Template not found",
      });
    }

    return res.json({
      success: true,
      data: template,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching template:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch template",
    });
  }
}

/** PATCH /templates/:templateId — Update a template */

/** PATCH /templates/:templateId — Update a template */
export async function updateTemplate(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const { template, error } = await templateManager.updateTemplate(
      templateId,
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
      data: template,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error updating template:");
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update template",
    });
  }
}

/** DELETE /templates/:templateId — Delete a template */

/** DELETE /templates/:templateId — Delete a template */
export async function deleteTemplate(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const { error } = await templateManager.deleteTemplate(templateId);

    if (error) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Template deleted successfully",
      data: { id: templateId },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error deleting template:");
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete template",
    });
  }
}

/** POST /templates/:templateId/activate — Set active template */

/** POST /templates/:templateId/activate — Set active template */
export async function activateTemplate(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const { template, error } = await templateManager.activateTemplate(
      templateId
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
      data: template,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error activating template:");
    return res.status(500).json({
      success: false,
      error: "ACTIVATE_ERROR",
      message: error?.message || "Failed to activate template",
    });
  }
}

/** GET /editor/system-prompt — Get page editor system prompt */

/** GET /templates/:templateId/pages — List template pages */
export async function listTemplatePages(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const { pages, error } = await templateManager.listTemplatePages(
      templateId
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
      data: pages,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching template pages:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch template pages",
    });
  }
}

/** POST /templates/:templateId/pages — Create template page */

/** POST /templates/:templateId/pages — Create template page */
export async function createTemplatePage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const { page, error } = await templateManager.createTemplatePage(
      templateId,
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
      data: page,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error creating template page:");
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create template page",
    });
  }
}

/** GET /templates/:templateId/pages/:pageId — Get template page */

/** GET /templates/:templateId/pages/:pageId — Get template page */
export async function getTemplatePage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId, pageId } = req.params;
    const page = await templateManager.getTemplatePage(templateId, pageId);

    if (!page) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Template page not found",
      });
    }

    return res.json({
      success: true,
      data: page,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching template page:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch template page",
    });
  }
}

/** PATCH /templates/:templateId/pages/:pageId — Update template page */

/** PATCH /templates/:templateId/pages/:pageId — Update template page */
export async function updateTemplatePage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId, pageId } = req.params;
    const { page, error } = await templateManager.updateTemplatePage(
      templateId,
      pageId,
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
      data: page,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error updating template page:");
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update template page",
    });
  }
}

/** DELETE /templates/:templateId/pages/:pageId — Delete template page */

/** DELETE /templates/:templateId/pages/:pageId — Delete template page */
export async function deleteTemplatePage(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId, pageId } = req.params;
    const { error } = await templateManager.deleteTemplatePage(
      templateId,
      pageId
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
      message: "Template page deleted successfully",
      data: { id: pageId },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error deleting template page:");
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete template page",
    });
  }
}

// =====================================================================
// PROJECT PAGES
// =====================================================================

/** GET /:id/pages — List project pages */

/** GET /templates/:templateId/code-snippets — List template snippets */
export async function listTemplateSnippets(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const snippets = await hfcmManager.listTemplateSnippets(templateId);
    return res.json({
      success: true,
      data: snippets,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[HFCM] Error fetching template code snippets:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch code snippets",
    });
  }
}

/** POST /templates/:templateId/code-snippets — Create template snippet */

/** POST /templates/:templateId/code-snippets — Create template snippet */
export async function createTemplateSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const { snippet, error } = await hfcmManager.createTemplateSnippet(
      templateId,
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
    logger.error({ err: error }, "[HFCM] Error creating template code snippet:");
    return res.status(500).json({
      success: false,
      error: "CREATE_ERROR",
      message: error?.message || "Failed to create code snippet",
    });
  }
}

/** PATCH /templates/:templateId/code-snippets/:id — Update template snippet */

/** PATCH /templates/:templateId/code-snippets/:id — Update template snippet */
export async function updateTemplateSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId, id } = req.params;
    const { snippet, error } = await hfcmManager.updateTemplateSnippet(
      templateId,
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
    logger.error({ err: error }, "[HFCM] Error updating template code snippet:");
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update code snippet",
    });
  }
}

/** DELETE /templates/:templateId/code-snippets/:id — Delete template snippet */

/** DELETE /templates/:templateId/code-snippets/:id — Delete template snippet */
export async function deleteTemplateSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId, id } = req.params;
    const { error } = await hfcmManager.deleteTemplateSnippet(templateId, id);

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
    logger.error({ err: error }, "[HFCM] Error deleting template code snippet:");
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete code snippet",
    });
  }
}

/** PATCH /templates/:templateId/code-snippets/:id/toggle — Toggle template snippet */

/** PATCH /templates/:templateId/code-snippets/:id/toggle — Toggle template snippet */
export async function toggleTemplateSnippet(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId, id } = req.params;
    const { is_enabled, error } = await hfcmManager.toggleTemplateSnippet(
      templateId,
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
    logger.error({ err: error }, "[HFCM] Error toggling template code snippet:");
    return res.status(500).json({
      success: false,
      error: "TOGGLE_ERROR",
      message: error?.message || "Failed to toggle code snippet",
    });
  }
}

/** PATCH /templates/:templateId/code-snippets/reorder — Reorder template snippets */

/** PATCH /templates/:templateId/code-snippets/reorder — Reorder template snippets */
export async function reorderTemplateSnippets(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { templateId } = req.params;
    const { snippetIds } = req.body;
    const { error } = await hfcmManager.reorderTemplateSnippets(
      templateId,
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
    logger.error({ err: error }, "[HFCM] Error reordering template code snippets:");
    return res.status(500).json({
      success: false,
      error: "REORDER_ERROR",
      message: error?.message || "Failed to reorder code snippets",
    });
  }
}

// =====================================================================
// PROJECT HFCM
// =====================================================================

/** GET /:projectId/code-snippets — List project snippets */
