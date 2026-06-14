import { BaseModel, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";

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

  // ===================================================================
  // Admin taxonomy-manager helpers (service.post-taxonomy-manager)
  //
  // Mirror the inline `db("website_builder.post_categories")` queries in
  // service.post-taxonomy-manager verbatim (same columns, filters, ordering,
  // and `db.fn.now()` timestamp source). Reads return raw rows because the
  // caller forwards them straight through.
  // ===================================================================

  /**
   * Fetch a category by id scoped to its post type (raw row or undefined).
   * Mirrors the existence/ownership lookups in updateCategory/deleteCategory.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByIdAndPostType(
    categoryId: string,
    postTypeId: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ id: categoryId, post_type_id: postTypeId })
      .first();
  }

  /**
   * Fetch a category by post type + slug (raw row or undefined). Mirrors the
   * slug-existence lookup in createCategory.
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
   * Fetch a category with a given post type + slug excluding one id (raw row or
   * undefined). Mirrors the slug-conflict check in updateCategory.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findSlugConflict(
    postTypeId: string,
    slug: string,
    excludeCategoryId: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ post_type_id: postTypeId, slug })
      .whereNot("id", excludeCategoryId)
      .first();
  }

  /**
   * Insert a full category row (raw passthrough) and return it. Mirrors the
   * inline insert in service.post-taxonomy-manager.createCategory verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async insertRawReturning(
    row: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<any> {
    const [created] = await this.table(trx).insert(row).returning("*");
    return created;
  }

  /**
   * Apply a partial update to a category scoped to its post type, stamping
   * updated_at via the DB clock, returning the updated row. Mirrors the inline
   * update in service.post-taxonomy-manager.updateCategory verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async updateByIdAndPostTypeReturning(
    categoryId: string,
    postTypeId: string,
    fields: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<any> {
    const [updated] = await this.table(trx)
      .where({ id: categoryId, post_type_id: postTypeId })
      .update({ ...fields, updated_at: db.fn.now() })
      .returning("*");
    return updated;
  }

  /**
   * Delete a category scoped to its post type; returns the affected count.
   * Mirrors the inline delete in service.post-taxonomy-manager.deleteCategory.
   */
  static async deleteByIdAndPostType(
    categoryId: string,
    postTypeId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id: categoryId, post_type_id: postTypeId })
      .del();
  }

  /**
   * All category rows for a post type, unordered, as raw rows. Mirrors the
   * inline export query in workers/processors/websiteBackup verbatim. Distinct
   * from findByPostTypeId, which orders by sort_order — the backup query has no
   * ordering, so it gets its own method to keep the serialized output identical.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findAllByPostTypeIdForBackup(
    postTypeId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx).where({ post_type_id: postTypeId });
  }
}
