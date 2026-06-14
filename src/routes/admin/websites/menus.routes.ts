/**
 * Admin Websites — Project Menus sub-router
 *
 * Menu CRUD plus nested menu-item create/update/delete and item reordering.
 *
 * Mounted by `../websites.ts` AFTER the super-admin auth hoist, so every route
 * inherits `[authenticateToken, superAdminMiddleware]`. The `items/reorder`
 * literal precedes the `:itemId` matcher, matching original order.
 */

import express from "express";
import * as controller from "../../../controllers/admin-websites/AdminWebsitesController";

const router = express.Router();

// =====================================================================
// PROJECT MENUS
// =====================================================================

// PATCH /:id/menus/:menuId/items/reorder — Reorder (before :itemId)
router.patch("/:id/menus/:menuId/items/reorder", controller.reorderMenuItems);

// GET  /:id/menus — List menus for a project
router.get("/:id/menus", controller.listMenus);

// POST /:id/menus — Create a menu
router.post("/:id/menus", controller.createMenu);

// GET  /:id/menus/:menuId — Get a menu with items
router.get("/:id/menus/:menuId", controller.getMenu);

// PATCH /:id/menus/:menuId — Update a menu
router.patch("/:id/menus/:menuId", controller.updateMenu);

// DELETE /:id/menus/:menuId — Delete a menu
router.delete("/:id/menus/:menuId", controller.deleteMenu);

// POST /:id/menus/:menuId/items — Create a menu item
router.post("/:id/menus/:menuId/items", controller.createMenuItem);

// PATCH /:id/menus/:menuId/items/:itemId — Update a menu item
router.patch("/:id/menus/:menuId/items/:itemId", controller.updateMenuItem);

// DELETE /:id/menus/:menuId/items/:itemId — Delete a menu item
router.delete("/:id/menus/:menuId/items/:itemId", controller.deleteMenuItem);

export default router;
