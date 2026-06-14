import { BaseModel, QueryContext } from "../BaseModel";

export interface IPostCategory {
  id: string;
  post_type_id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  sort_order: number | null;
  created_at: Date;
  updated_at: Date;
}

export class PostCategoryModel extends BaseModel {
  protected static tableName = "website_builder.post_categories";

  /**
   * List categories for a post type, ordered by sort_order asc. Mirrors the
   * inline query in UserWebsiteController.listCategories. Returns raw rows.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByPostTypeId(
    postTypeId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where("post_type_id", postTypeId)
      .orderBy("sort_order", "asc");
  }

  /**
   * Insert a category row (post_type_id, name, slug, parent_id) and return the
   * created row. Mirrors the inline insert in
   * UserWebsiteController.createUserCategory.
   */
  static async insertReturning(
    data: {
      post_type_id: string;
      name: string;
      slug: string;
      parent_id: string | null;
    },
    trx?: QueryContext
  ): Promise<IPostCategory> {
    const [row] = await this.table(trx).insert(data).returning("*");
    return row;
  }
}
