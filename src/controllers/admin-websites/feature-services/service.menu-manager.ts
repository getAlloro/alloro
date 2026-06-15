/**
 * Menu Manager Service
 *
 * CRUD for menus and menu items scoped to projects.
 * Handles cache invalidation for runtime menu resolution.
 */

import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { MenuModel, MenuItemModel } from "../../../models/website-builder/MenuModel";
import { getRedisConnection } from "../../../workers/queues";
import logger from "../../../lib/logger";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function invalidateMenuCache(projectId: string) {
  try {
    const redis = getRedisConnection();
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        `menu:${projectId}:*`,
        "COUNT",
        100
      );
      cursor = nextCursor;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== "0");
  } catch (err) {
    logger.error({ err: err }, "[Menu Manager] Failed to invalidate menu cache:");
  }
}

/**
 * Build a nested items tree from flat rows.
 */
function buildItemTree(items: any[]): any[] {
  const map = new Map<string, any>();
  const roots: any[] = [];

  for (const item of items) {
    map.set(item.id, { ...item, children: [] });
  }

  for (const item of items) {
    const node = map.get(item.id)!;
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// ---------------------------------------------------------------------------
// List menus for a project
// ---------------------------------------------------------------------------

export async function listMenus(
  projectId: string
): Promise<{
  menus: any[];
  error?: { status: number; code: string; message: string };
}> {
  const project = await ProjectModel.findRawById(projectId);
  if (!project) {
    return {
      menus: [],
      error: { status: 404, code: "NOT_FOUND", message: "Project not found" },
    };
  }

  const menus = await MenuModel.findByProjectId(projectId);

  // Attach item counts
  const menuIds = menus.map((m: any) => m.id);
  const counts = menuIds.length > 0
    ? await MenuItemModel.countByMenuIds(menuIds)
    : [];

  const countMap = new Map(counts.map((c: any) => [c.menu_id, parseInt(c.count, 10)]));

  return {
    menus: menus.map((m: any) => ({
      ...m,
      item_count: countMap.get(m.id) || 0,
    })),
  };
}

// ---------------------------------------------------------------------------
// Get menu with nested items
// ---------------------------------------------------------------------------

export async function getMenu(
  projectId: string,
  menuId: string
): Promise<{
  menu: any;
  error?: { status: number; code: string; message: string };
}> {
  const menu = await MenuModel.findByIdAndProject(menuId, projectId);

  if (!menu) {
    return {
      menu: null,
      error: { status: 404, code: "NOT_FOUND", message: "Menu not found" },
    };
  }

  const items = await MenuItemModel.findByMenuIdOrderedByOrderIndex(menuId);

  return {
    menu: {
      ...menu,
      items: buildItemTree(items),
    },
  };
}

// ---------------------------------------------------------------------------
// Create menu
// ---------------------------------------------------------------------------

export async function createMenu(
  projectId: string,
  data: { name: string; slug?: string }
): Promise<{
  menu: any;
  error?: { status: number; code: string; message: string };
}> {
  const { name, slug: providedSlug } = data;

  if (!name) {
    return {
      menu: null,
      error: { status: 400, code: "INVALID_INPUT", message: "name is required" },
    };
  }

  const project = await ProjectModel.findRawById(projectId);
  if (!project) {
    return {
      menu: null,
      error: { status: 404, code: "NOT_FOUND", message: "Project not found" },
    };
  }

  let slug = providedSlug || slugify(name);

  // Ensure slug uniqueness within project
  const existing = await MenuModel.findByProjectAndSlug(projectId, slug);
  if (existing) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }

  const menu = await MenuModel.insertReturning({
    project_id: projectId,
    name,
    slug,
  });

  logger.info(`[Menu Manager] ✓ Created menu "${name}" (${slug}) for project ${projectId}`);

  await invalidateMenuCache(projectId);

  return { menu: { ...menu, items: [], item_count: 0 } };
}

// ---------------------------------------------------------------------------
// Update menu
// ---------------------------------------------------------------------------

export async function updateMenu(
  projectId: string,
  menuId: string,
  updates: { name?: string; slug?: string }
): Promise<{
  menu: any;
  error?: { status: number; code: string; message: string };
}> {
  const existing = await MenuModel.findByIdAndProject(menuId, projectId);
  if (!existing) {
    return {
      menu: null,
      error: { status: 404, code: "NOT_FOUND", message: "Menu not found" },
    };
  }

  const fieldUpdates: Record<string, any> = {};
  if (updates.name) fieldUpdates.name = updates.name;
  if (updates.slug) {
    // Check slug uniqueness
    const conflict = await MenuModel.findSlugConflict(
      projectId,
      updates.slug,
      menuId
    );
    if (conflict) {
      return {
        menu: null,
        error: { status: 409, code: "SLUG_CONFLICT", message: "A menu with this slug already exists" },
      };
    }
    fieldUpdates.slug = updates.slug;
  }

  if (Object.keys(fieldUpdates).length > 0) {
    await MenuModel.updateFieldsById(menuId, fieldUpdates);
  }

  await invalidateMenuCache(projectId);

  const updated = await MenuModel.findById(menuId);
  return { menu: updated };
}

// ---------------------------------------------------------------------------
// Delete menu
// ---------------------------------------------------------------------------

export async function deleteMenu(
  projectId: string,
  menuId: string
): Promise<{ error?: { status: number; code: string; message: string } }> {
  const existing = await MenuModel.findByIdAndProject(menuId, projectId);
  if (!existing) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Menu not found" },
    };
  }

  await MenuModel.deleteById(menuId);

  logger.info(`[Menu Manager] ✓ Deleted menu ID: ${menuId}`);

  await invalidateMenuCache(projectId);

  return {};
}

// ---------------------------------------------------------------------------
// List menu items (flat)
// ---------------------------------------------------------------------------

export async function listMenuItems(
  menuId: string
): Promise<any[]> {
  return MenuItemModel.findByMenuIdOrderedByOrderIndex(menuId);
}

// ---------------------------------------------------------------------------
// Create menu item
// ---------------------------------------------------------------------------

export async function createMenuItem(
  projectId: string,
  menuId: string,
  data: {
    label: string;
    url: string;
    target?: string;
    parent_id?: string | null;
    order_index?: number;
  }
): Promise<{
  item: any;
  error?: { status: number; code: string; message: string };
}> {
  const { label, url, target, parent_id, order_index } = data;

  if (!label || !url) {
    return {
      item: null,
      error: { status: 400, code: "INVALID_INPUT", message: "label and url are required" },
    };
  }

  // Verify menu belongs to project
  const menu = await MenuModel.findByIdAndProject(menuId, projectId);
  if (!menu) {
    return {
      item: null,
      error: { status: 404, code: "NOT_FOUND", message: "Menu not found" },
    };
  }

  // Auto-assign order_index at end if not provided
  let idx = order_index;
  if (idx === undefined) {
    const last = await MenuItemModel.findLastByMenuAndParent(
      menuId,
      parent_id || null
    );
    idx = last ? last.order_index + 1 : 0;
  }

  const item = await MenuItemModel.insertReturning({
    menu_id: menuId,
    parent_id: parent_id || null,
    label,
    url,
    target: target || "_self",
    order_index: idx,
  });

  await invalidateMenuCache(projectId);

  return { item };
}

// ---------------------------------------------------------------------------
// Update menu item
// ---------------------------------------------------------------------------

export async function updateMenuItem(
  projectId: string,
  menuId: string,
  itemId: string,
  updates: {
    label?: string;
    url?: string;
    target?: string;
    parent_id?: string | null;
    order_index?: number;
  }
): Promise<{
  item: any;
  error?: { status: number; code: string; message: string };
}> {
  // Verify menu belongs to project
  const menu = await MenuModel.findByIdAndProject(menuId, projectId);
  if (!menu) {
    return {
      item: null,
      error: { status: 404, code: "NOT_FOUND", message: "Menu not found" },
    };
  }

  const existing = await MenuItemModel.findByIdAndMenu(itemId, menuId);
  if (!existing) {
    return {
      item: null,
      error: { status: 404, code: "NOT_FOUND", message: "Menu item not found" },
    };
  }

  const fieldUpdates: Record<string, any> = {};
  if (updates.label !== undefined) fieldUpdates.label = updates.label;
  if (updates.url !== undefined) fieldUpdates.url = updates.url;
  if (updates.target !== undefined) fieldUpdates.target = updates.target;
  if (updates.parent_id !== undefined) fieldUpdates.parent_id = updates.parent_id;
  if (updates.order_index !== undefined) fieldUpdates.order_index = updates.order_index;

  if (Object.keys(fieldUpdates).length > 0) {
    await MenuItemModel.updateFieldsById(itemId, fieldUpdates);
  }

  await invalidateMenuCache(projectId);

  const updated = await MenuItemModel.findById(itemId);
  return { item: updated };
}

// ---------------------------------------------------------------------------
// Delete menu item
// ---------------------------------------------------------------------------

export async function deleteMenuItem(
  projectId: string,
  menuId: string,
  itemId: string
): Promise<{ error?: { status: number; code: string; message: string } }> {
  const menu = await MenuModel.findByIdAndProject(menuId, projectId);
  if (!menu) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Menu not found" },
    };
  }

  const existing = await MenuItemModel.findByIdAndMenu(itemId, menuId);
  if (!existing) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Menu item not found" },
    };
  }

  await MenuItemModel.deleteById(itemId);

  await invalidateMenuCache(projectId);

  return {};
}

// ---------------------------------------------------------------------------
// Reorder menu items (bulk update parent + order)
// ---------------------------------------------------------------------------

export async function reorderItems(
  projectId: string,
  menuId: string,
  items: { id: string; parent_id: string | null; order_index: number }[]
): Promise<{ error?: { status: number; code: string; message: string } }> {
  const menu = await MenuModel.findByIdAndProject(menuId, projectId);
  if (!menu) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Menu not found" },
    };
  }

  await MenuItemModel.reorder(menuId, items);

  await invalidateMenuCache(projectId);

  return {};
}
