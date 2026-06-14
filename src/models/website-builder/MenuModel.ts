import { BaseModel, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";

export interface IMenu {
  id: string;
  project_id: string;
  name: string;
  slug: string;
  created_at: Date;
  updated_at: Date;
}

export interface IMenuItem {
  id: string;
  menu_id: string;
  parent_id: string | null;
  label: string;
  url: string;
  target: string;
  order_index: number;
  created_at: Date;
  updated_at: Date;
}

export class MenuModel extends BaseModel {
  protected static tableName = "website_builder.menus";

  static async findByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<IMenu[]> {
    return this.table(trx)
      .where({ project_id: projectId })
      .orderBy("created_at", "asc");
  }

  static async findByProjectAndSlug(
    projectId: string,
    slug: string,
    trx?: QueryContext
  ): Promise<IMenu | undefined> {
    return this.table(trx)
      .where({ project_id: projectId, slug })
      .first();
  }

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IMenu | undefined> {
    return super.findById(id, trx) as Promise<IMenu | undefined>;
  }

  static async create(
    data: Partial<IMenu>,
    trx?: QueryContext
  ): Promise<IMenu> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: string,
    data: Partial<IMenu>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  static async deleteById(
    id: string,
    trx?: QueryContext
  ): Promise<number> {
    return super.deleteById(id, trx);
  }

  // ===================================================================
  // Admin menu-manager helpers (service.menu-manager)
  //
  // Mirror the inline `db("website_builder.menus")` queries in
  // service.menu-manager verbatim (same columns, filters, and `db.fn.now()`
  // timestamp source).
  // ===================================================================

  /**
   * Fetch a menu by id scoped to its project (raw row or undefined). Mirrors
   * the existence/ownership lookups in service.menu-manager.getMenu /
   * updateMenu / deleteMenu / createMenuItem / updateMenuItem / deleteMenuItem /
   * reorderItems.
   */
  static async findByIdAndProject(
    menuId: string,
    projectId: string,
    trx?: QueryContext
  ): Promise<IMenu | undefined> {
    return this.table(trx)
      .where({ id: menuId, project_id: projectId })
      .first();
  }

  /**
   * Fetch a menu with a given project + slug excluding one id (raw row or
   * undefined). Mirrors the slug-conflict check in
   * service.menu-manager.updateMenu.
   */
  static async findSlugConflict(
    projectId: string,
    slug: string,
    excludeMenuId: string,
    trx?: QueryContext
  ): Promise<IMenu | undefined> {
    return this.table(trx)
      .where({ project_id: projectId, slug })
      .whereNot("id", excludeMenuId)
      .first();
  }

  /**
   * Insert a menu row (project_id, name, slug) and return it. Mirrors the
   * inline insert in service.menu-manager.createMenu verbatim.
   */
  static async insertReturning(
    data: { project_id: string; name: string; slug: string },
    trx?: QueryContext
  ): Promise<IMenu> {
    const [created] = await this.table(trx).insert(data).returning("*");
    return created;
  }

  /**
   * Apply a partial column update to a menu by id, stamping updated_at via the
   * DB clock. Mirrors the inline update in service.menu-manager.updateMenu
   * verbatim (caller builds the field bag).
   */
  static async updateFieldsById(
    menuId: string,
    fields: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id: menuId })
      .update({ ...fields, updated_at: db.fn.now() });
  }
}

export class MenuItemModel extends BaseModel {
  protected static tableName = "website_builder.menu_items";

  static async findByMenuId(
    menuId: string,
    trx?: QueryContext
  ): Promise<IMenuItem[]> {
    return this.table(trx)
      .where({ menu_id: menuId })
      .orderBy("parent_id", "asc")
      .orderBy("order_index", "asc");
  }

  /**
   * Fetch a menu's items ordered by order_index, selecting only the columns the
   * shortcode resolver consumes when building the nav tree. Mirrors the inline
   * query in shortcodeResolver.resolveMenus. Returns raw rows.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findItemsForMenuTree(
    menuId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where("menu_id", menuId)
      .orderBy("order_index", "asc")
      .select("id", "parent_id", "label", "url", "target", "order_index");
  }

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IMenuItem | undefined> {
    return super.findById(id, trx) as Promise<IMenuItem | undefined>;
  }

  static async create(
    data: Partial<IMenuItem>,
    trx?: QueryContext
  ): Promise<IMenuItem> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: string,
    data: Partial<IMenuItem>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  static async deleteById(
    id: string,
    trx?: QueryContext
  ): Promise<number> {
    return super.deleteById(id, trx);
  }

  // ===================================================================
  // Admin menu-manager helpers (service.menu-manager)
  //
  // Mirror the inline `db("website_builder.menu_items")` queries in
  // service.menu-manager verbatim (same columns, filters, ordering, and
  // `db.fn.now()` timestamp source). Distinct from findByMenuId, which orders
  // by parent_id then order_index — the admin manager orders by order_index
  // only, so it gets its own method to keep the output identical. Reads return
  // raw rows.
  // ===================================================================

  /**
   * All items for a menu, ordered order_index asc (full raw rows). Mirrors the
   * inline item query in service.menu-manager.getMenu / listMenuItems verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByMenuIdOrderedByOrderIndex(
    menuId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where("menu_id", menuId)
      .orderBy("order_index", "asc");
  }

  /**
   * Per-menu item counts for a set of menu ids. Mirrors the inline grouped
   * count in service.menu-manager.listMenus verbatim
   * (whereIn(menu_id).groupBy(menu_id).select(menu_id).count("* as count")).
   * Returns the raw aggregate rows (menu_id + count).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async countByMenuIds(
    menuIds: string[],
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .whereIn("menu_id", menuIds)
      .groupBy("menu_id")
      .select("menu_id")
      .count("* as count");
  }

  /**
   * Fetch an item by id scoped to its menu (raw row or undefined). Mirrors the
   * existence/ownership lookups in service.menu-manager.updateMenuItem /
   * deleteMenuItem.
   */
  static async findByIdAndMenu(
    itemId: string,
    menuId: string,
    trx?: QueryContext
  ): Promise<IMenuItem | undefined> {
    return this.table(trx)
      .where({ id: itemId, menu_id: menuId })
      .first();
  }

  /**
   * Fetch the highest-order_index item for a menu + parent (raw row or
   * undefined). Mirrors the auto-append lookup in
   * service.menu-manager.createMenuItem verbatim.
   */
  static async findLastByMenuAndParent(
    menuId: string,
    parentId: string | null,
    trx?: QueryContext
  ): Promise<IMenuItem | undefined> {
    return this.table(trx)
      .where({ menu_id: menuId, parent_id: parentId })
      .orderBy("order_index", "desc")
      .first();
  }

  /**
   * Insert a menu item row verbatim (raw passthrough) and return it. Mirrors
   * the inline insert in service.menu-manager.createMenuItem verbatim.
   */
  static async insertReturning(
    row: {
      menu_id: string;
      parent_id: string | null;
      label: string;
      url: string;
      target: string;
      order_index: number;
    },
    trx?: QueryContext
  ): Promise<IMenuItem> {
    const [created] = await this.table(trx).insert(row).returning("*");
    return created;
  }

  /**
   * Apply a partial column update to an item by id, stamping updated_at via the
   * DB clock. Mirrors the inline update in service.menu-manager.updateMenuItem
   * verbatim (caller builds the field bag).
   */
  static async updateFieldsById(
    itemId: string,
    fields: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id: itemId })
      .update({ ...fields, updated_at: db.fn.now() });
  }

  /**
   * Reorder a menu's items: within a transaction, set parent_id + order_index
   * (stamping updated_at via the trx DB clock) for each item, scoped to the
   * menu. Mirrors the inline db.transaction loop in
   * service.menu-manager.reorderItems verbatim. The model owns the transaction
   * boundary (mirrors ReviewModel.replaceApifyReviewsForPlace); an injected trx
   * is honored if the caller is composing further writes.
   */
  static async reorder(
    menuId: string,
    items: { id: string; parent_id: string | null; order_index: number }[],
    trx?: QueryContext
  ): Promise<void> {
    const run = async (t: import("knex").Knex.Transaction): Promise<void> => {
      for (const item of items) {
        await t(this.tableName)
          .where({ id: item.id, menu_id: menuId })
          .update({
            parent_id: item.parent_id,
            order_index: item.order_index,
            updated_at: t.fn.now(),
          });
      }
    };

    if (trx) {
      return run(trx as import("knex").Knex.Transaction);
    }
    await db.transaction(run);
  }
}
