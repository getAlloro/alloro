import { BaseModel, QueryContext } from "../BaseModel";

export interface IPostTag {
  id: string;
  post_type_id: string;
  name: string;
  slug: string;
  created_at: Date;
  updated_at: Date;
}

export class PostTagModel extends BaseModel {
  protected static tableName = "website_builder.post_tags";

  /**
   * List tags for a post type, ordered by name asc. Mirrors the inline query
   * in UserWebsiteController.listTags. Returns raw rows.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByPostTypeId(
    postTypeId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where("post_type_id", postTypeId)
      .orderBy("name", "asc");
  }

  /**
   * Insert a tag row (post_type_id, name, slug) and return the created row.
   * Mirrors the inline insert in UserWebsiteController.createUserTag.
   */
  static async insertReturning(
    data: { post_type_id: string; name: string; slug: string },
    trx?: QueryContext
  ): Promise<IPostTag> {
    const [row] = await this.table(trx).insert(data).returning("*");
    return row;
  }
}
