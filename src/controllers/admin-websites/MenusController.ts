/**
 * Admin Websites — Menus Controller
 *
 * Project menu CRUD plus menu-item CRUD and reorder.
 *
 * Behavior-preserving split from the former monolithic AdminWebsitesController.
 * Handlers and helpers are moved verbatim; logic is unchanged. Bound by the
 * matching resource sub-router under src/routes/admin/websites/.
 */

import { Request, Response } from "express";
import * as menuManager from "./feature-services/service.menu-manager";
import logger from "../../lib/logger";

/** GET /:id/menus */
export async function listMenus(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = req.params.id;
    const result = await menuManager.listMenus(projectId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.menus });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error listing menus:");
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /:id/menus */

/** POST /:id/menus */
export async function createMenu(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = req.params.id;
    const result = await menuManager.createMenu(projectId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.menu });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error creating menu:");
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** GET /:id/menus/:menuId */

/** GET /:id/menus/:menuId */
export async function getMenu(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, menuId } = req.params;
    const result = await menuManager.getMenu(projectId, menuId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.menu });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error getting menu:");
    return res.status(500).json({ success: false, error: "GET_ERROR", message: error?.message });
  }
}

/** PATCH /:id/menus/:menuId */

/** PATCH /:id/menus/:menuId */
export async function updateMenu(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, menuId } = req.params;
    const result = await menuManager.updateMenu(projectId, menuId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.menu });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error updating menu:");
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /:id/menus/:menuId */

/** DELETE /:id/menus/:menuId */
export async function deleteMenu(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, menuId } = req.params;
    const result = await menuManager.deleteMenu(projectId, menuId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error deleting menu:");
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

/** POST /:id/menus/:menuId/items */

/** POST /:id/menus/:menuId/items */
export async function createMenuItem(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, menuId } = req.params;
    const result = await menuManager.createMenuItem(projectId, menuId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.item });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error creating menu item:");
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** PATCH /:id/menus/:menuId/items/:itemId */

/** PATCH /:id/menus/:menuId/items/:itemId */
export async function updateMenuItem(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, menuId, itemId } = req.params;
    const result = await menuManager.updateMenuItem(projectId, menuId, itemId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.item });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error updating menu item:");
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /:id/menus/:menuId/items/:itemId */

/** DELETE /:id/menus/:menuId/items/:itemId */
export async function deleteMenuItem(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, menuId, itemId } = req.params;
    const result = await menuManager.deleteMenuItem(projectId, menuId, itemId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error deleting menu item:");
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

/** PATCH /:id/menus/:menuId/items/reorder */

/** PATCH /:id/menus/:menuId/items/reorder */
export async function reorderMenuItems(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, menuId } = req.params;
    const result = await menuManager.reorderItems(projectId, menuId, req.body.items || []);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error reordering menu items:");
    return res.status(500).json({ success: false, error: "REORDER_ERROR", message: error?.message });
  }
}

// =====================================================================
// SEO
// =====================================================================

/** PATCH /:id/pages/:pageId/seo — Update page SEO data */
