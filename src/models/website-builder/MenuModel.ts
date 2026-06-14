import { BaseModel, QueryContext } from "../BaseModel";

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
}
