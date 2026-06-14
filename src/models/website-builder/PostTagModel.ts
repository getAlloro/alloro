import { BaseModel, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";

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

  // ===================================================================
  // Admin taxonomy-manager helpers (service.post-taxonomy-manager)
  //
  // Mirror the inline `db("website_builder.post_tags")` queries in
  // service.post-taxonomy-manager verbatim (same columns, filters, and
  // `db.fn.now()` timestamp source). Reads return raw rows.
  // ===================================================================

  /**
   * Fetch a tag by id scoped to its post type (raw row or undefined). Mirrors
   * the existence/ownership lookups in updateTag/deleteTag.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByIdAndPostType(
    tagId: string,
    postTypeId: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ id: tagId, post_type_id: postTypeId })
      .first();
  }

  /**
   * Fetch a tag by post type + slug (raw row or undefined). Mirrors the
   * slug-existence lookup in createTag.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByPostTypeAndSlug(
    postTypeId: string,
    slug: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ post_type_id: postTypeId, slug })
      .first();
  }

  /**
   * Fetch a tag with a given post type + slug excluding one id (raw row or
   * undefined). Mirrors the slug-conflict check in updateTag.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findSlugConflict(
    postTypeId: string,
    slug: string,
    excludeTagId: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ post_type_id: postTypeId, slug })
      .whereNot("id", excludeTagId)
      .first();
  }

  /**
   * Insert a tag row (post_type_id, name, slug) and return it. Mirrors the
   * inline insert in service.post-taxonomy-manager.createTag verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async insertRawReturning(
    row: { post_type_id: string; name: string; slug: string },
    trx?: QueryContext
  ): Promise<any> {
    const [created] = await this.table(trx).insert(row).returning("*");
    return created;
  }

  /**
   * Apply a partial update to a tag scoped to its post type, stamping
   * updated_at via the DB clock, returning the updated row. Mirrors the inline
   * update in service.post-taxonomy-manager.updateTag verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async updateByIdAndPostTypeReturning(
    tagId: string,
    postTypeId: string,
    fields: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<any> {
    const [updated] = await this.table(trx)
      .where({ id: tagId, post_type_id: postTypeId })
      .update({ ...fields, updated_at: db.fn.now() })
      .returning("*");
    return updated;
  }

  /**
   * Delete a tag scoped to its post type; returns the affected count. Mirrors
   * the inline delete in service.post-taxonomy-manager.deleteTag.
   */
  static async deleteByIdAndPostType(
    tagId: string,
    postTypeId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id: tagId, post_type_id: postTypeId })
      .del();
  }

  /**
   * All tag rows for a post type, unordered, as raw rows. Mirrors the inline
   * export query in workers/processors/websiteBackup verbatim. Distinct from
   * findByPostTypeId, which orders by name — the backup query has no ordering,
   * so it gets its own method to keep the serialized output identical.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findAllByPostTypeIdForBackup(
    postTypeId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx).where({ post_type_id: postTypeId });
  }
}
