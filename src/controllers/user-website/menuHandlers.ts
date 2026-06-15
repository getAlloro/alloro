/**
 * User Website — Menu Handlers
 *
 * Thin HTTP handlers for owner-facing menus and menu items. Each handler
 * resolves the org's project, calls the shared menu manager, and shapes the
 * response. No business logic lives here.
 *
 * Re-exported from UserWebsiteController so the route file's
 * `import * as controller` surface stays unchanged.
 */

import { Response } from "express";
import { RBACRequest } from "../../middleware/rbac";
import * as menuManager from "../admin-websites/feature-services/service.menu-manager";
import * as contentService from "./user-website-services/websiteContent.service";
import { handleError, sendManagerResult } from "./user-website-utils/responses";

/** Resolve projectId from orgId (null when no website). */
async function getProjectIdForOrg(orgId: number): Promise<string | null> {
  return contentService.resolveProjectId(orgId);
}

/** GET /api/user/website/menus */
export async function listUserMenus(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const result = await menuManager.listMenus(projectId);
    return sendManagerResult(res, result, { data: result.menus });
  } catch (error) {
    return handleError(res, error, "List menus");
  }
}

/** POST /api/user/website/menus */
export async function createUserMenu(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const result = await menuManager.createMenu(projectId, req.body);
    return sendManagerResult(res, result, { successStatus: 201, data: result.menu });
  } catch (error) {
    return handleError(res, error, "Create menu");
  }
}

/** GET /api/user/website/menus/:menuId */
export async function getUserMenu(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const result = await menuManager.getMenu(projectId, req.params.menuId);
    return sendManagerResult(res, result, { data: result.menu });
  } catch (error) {
    return handleError(res, error, "Get menu");
  }
}

/** PATCH /api/user/website/menus/:menuId */
export async function updateUserMenu(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const result = await menuManager.updateMenu(projectId, req.params.menuId, req.body);
    return sendManagerResult(res, result, { data: result.menu });
  } catch (error) {
    return handleError(res, error, "Update menu");
  }
}

/** DELETE /api/user/website/menus/:menuId */
export async function deleteUserMenu(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const result = await menuManager.deleteMenu(projectId, req.params.menuId);
    return sendManagerResult(res, result);
  } catch (error) {
    return handleError(res, error, "Delete menu");
  }
}

/** POST /api/user/website/menus/:menuId/items */
export async function createUserMenuItem(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const result = await menuManager.createMenuItem(projectId, req.params.menuId, req.body);
    return sendManagerResult(res, result, { successStatus: 201, data: result.item });
  } catch (error) {
    return handleError(res, error, "Create menu item");
  }
}

/** PATCH /api/user/website/menus/:menuId/items/:itemId */
export async function updateUserMenuItem(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const result = await menuManager.updateMenuItem(projectId, req.params.menuId, req.params.itemId, req.body);
    return sendManagerResult(res, result, { data: result.item });
  } catch (error) {
    return handleError(res, error, "Update menu item");
  }
}

/** DELETE /api/user/website/menus/:menuId/items/:itemId */
export async function deleteUserMenuItem(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const result = await menuManager.deleteMenuItem(projectId, req.params.menuId, req.params.itemId);
    return sendManagerResult(res, result);
  } catch (error) {
    return handleError(res, error, "Delete menu item");
  }
}

/** PATCH /api/user/website/menus/:menuId/items/reorder */
export async function reorderUserMenuItems(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const projectId = await getProjectIdForOrg(orgId);
    if (!projectId) return res.status(404).json({ error: "No website found" });

    const result = await menuManager.reorderItems(projectId, req.params.menuId, req.body.items || []);
    return sendManagerResult(res, result);
  } catch (error) {
    return handleError(res, error, "Reorder menu items");
  }
}
