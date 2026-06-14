/**
 * Menu Manager Service
 *
 * CRUD for menus and menu items scoped to projects.
 * Handles cache invalidation for runtime menu resolution.
 */

import { db } from "../../../database/connection";
import { getRedisConnection } from "../../../workers/queues";
import logger from "../../../lib/logger";

const MENUS_TABLE = "website_builder.menus";
const MENU_ITEMS_TABLE = "website_builder.menu_items";
const PROJECTS_TABLE = "website_builder.projects";

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
  const project = await db(PROJECTS_TABLE).where("id", projectId).first();
  if (!project) {
    return {
      menus: [],
      error: { status: 404, code: "NOT_FOUND", message: "Project not found" },
    };
  }

  const menus = await db(MENUS_TABLE)
    .where("project_id", projectId)
    .orderBy("created_at", "asc");

  // Attach item counts
  const menuIds = menus.map((m: any) => m.id);
  const counts = menuIds.length > 0
    ? await db(MENU_ITEMS_TABLE)
        .whereIn("menu_id", menuIds)
        .groupBy("menu_id")
        .select("menu_id")
        .count("* as count")
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
  const menu = await db(MENUS_TABLE)
    .where({ id: menuId, project_id: projectId })
    .first();

  if (!menu) {
    return {
      menu: null,
      error: { status: 404, code: "NOT_FOUND", message: "Menu not found" },
    };
  }

  const items = await db(MENU_ITEMS_TABLE)
    .where("menu_id", menuId)
    .orderBy("order_index", "asc");

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

  const project = await db(PROJECTS_TABLE).where("id", projectId).first();
  if (!project) {
    return {
      menu: null,
      error: { status: 404, code: "NOT_FOUND", message: "Project not found" },
    };
  }

  let slug = providedSlug || slugify(name);

  // Ensure slug uniqueness within project
  const existing = await db(MENUS_TABLE)
    .where({ project_id: projectId, slug })
    .first();
  if (existing) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }

  const [menu] = await db(MENUS_TABLE)
    .insert({
      project_id: projectId,
      name,
      slug,
    })
    .returning("*");

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
  const existing = await db(MENUS_TABLE)
    .where({ id: menuId, project_id: projectId })
    .first();
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
    const conflict = await db(MENUS_TABLE)
      .where({ project_id: projectId, slug: updates.slug })
      .whereNot("id", menuId)
      .first();
    if (conflict) {
      return {
        menu: null,
        error: { status: 409, code: "SLUG_CONFLICT", message: "A menu with this slug already exists" },
      };
    }
    fieldUpdates.slug = updates.slug;
  }

  if (Object.keys(fieldUpdates).length > 0) {
    await db(MENUS_TABLE)
      .where({ id: menuId })
      .update({ ...fieldUpdates, updated_at: db.fn.now() });
  }

  await invalidateMenuCache(projectId);

  const updated = await db(MENUS_TABLE).where("id", menuId).first();
  return { menu: updated };
}

// ---------------------------------------------------------------------------
// Delete menu
// ---------------------------------------------------------------------------

export async function deleteMenu(
  projectId: string,
  menuId: string
): Promise<{ error?: { status: number; code: string; message: string } }> {
  const existing = await db(MENUS_TABLE)
    .where({ id: menuId, project_id: projectId })
    .first();
  if (!existing) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Menu not found" },
    };
  }

  await db(MENUS_TABLE).where({ id: menuId }).del();

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
  return db(MENU_ITEMS_TABLE)
    .where("menu_id", menuId)
    .orderBy("order_index", "asc");
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
  const menu = await db(MENUS_TABLE)
    .where({ id: menuId, project_id: projectId })
    .first();
  if (!menu) {
    return {
      item: null,
      error: { status: 404, code: "NOT_FOUND", message: "Menu not found" },
    };
  }

  // Auto-assign order_index at end if not provided
  let idx = order_index;
  if (idx === undefined) {
    const last = await db(MENU_ITEMS_TABLE)
      .where({ menu_id: menuId, parent_id: parent_id || null })
      .orderBy("order_index", "desc")
      .first();
    idx = last ? last.order_index + 1 : 0;
  }

  const [item] = await db(MENU_ITEMS_TABLE)
    .insert({
      menu_id: menuId,
      parent_id: parent_id || null,
      label,
      url,
      target: target || "_self",
      order_index: idx,
    })
    .returning("*");

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
  const menu = await db(MENUS_TABLE)
    .where({ id: menuId, project_id: projectId })
    .first();
  if (!menu) {
    return {
      item: null,
      error: { status: 404, code: "NOT_FOUND", message: "Menu not found" },
    };
  }

  const existing = await db(MENU_ITEMS_TABLE)
    .where({ id: itemId, menu_id: menuId })
    .first();
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
    await db(MENU_ITEMS_TABLE)
      .where({ id: itemId })
      .update({ ...fieldUpdates, updated_at: db.fn.now() });
  }

  await invalidateMenuCache(projectId);

  const updated = await db(MENU_ITEMS_TABLE).where("id", itemId).first();
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
  const menu = await db(MENUS_TABLE)
    .where({ id: menuId, project_id: projectId })
    .first();
  if (!menu) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Menu not found" },
    };
  }

  const existing = await db(MENU_ITEMS_TABLE)
    .where({ id: itemId, menu_id: menuId })
    .first();
  if (!existing) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Menu item not found" },
    };
  }

  await db(MENU_ITEMS_TABLE).where({ id: itemId }).del();

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
  const menu = await db(MENUS_TABLE)
    .where({ id: menuId, project_id: projectId })
    .first();
  if (!menu) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Menu not found" },
    };
  }

  await db.transaction(async (trx) => {
    for (const item of items) {
      await trx(MENU_ITEMS_TABLE)
        .where({ id: item.id, menu_id: menuId })
        .update({
          parent_id: item.parent_id,
          order_index: item.order_index,
          updated_at: trx.fn.now(),
        });
    }
  });

  await invalidateMenuCache(projectId);

  return {};
}
