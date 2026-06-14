import { BaseModel, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";

export interface IPostType {
  id: string;
  template_id: string;
  name: string;
  slug: string;
  schema: Record<string, unknown>[] | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Owns the `website_builder.post_types` table. Created so the admin-websites AI
 * command pipeline can resolve post types through a model instead of inline
 * `db("website_builder.post_types")`. Read methods return raw rows because the
 * callers consume columns (id, name, slug, schema) directly off the row.
 * Mirrors the inline queries in service.ai-command verbatim (same filters).
 */
export class PostTypeModel extends BaseModel {
  protected static tableName = "website_builder.post_types";

  /**
   * All post types for a template (full raw rows). Mirrors getProjectPostTypes.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByTemplateId(
    templateId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx).where("template_id", templateId);
  }

  /**
   * Fetch a single post type by template + slug (full raw row). Mirrors the
   * post-type resolution in executeCreatePost.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByTemplateAndSlug(
    templateId: string,
    slug: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx).where({ template_id: templateId, slug }).first();
  }

  /**
   * Fetch a single post type by id (full raw row). Mirrors the inline
   * db("website_builder.post_types").where("id").first() in
   * AdminWebsitesController.aiGeneratePost verbatim (the caller reads `.name`).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findRawById(id: string, trx?: QueryContext): Promise<any> {
    return this.table(trx).where("id", id).first();
  }

  // ===================================================================
  // Admin post-type-manager helpers (service.post-type-manager)
  //
  // Mirror the inline `db("website_builder.post_types")` queries in
  // service.post-type-manager verbatim (same columns, filters, ordering, and
  // `db.fn.now()` timestamp source). Reads return raw rows.
  // ===================================================================

  /**
   * All post types for a template, ordered created_at asc (full raw rows).
   * Mirrors service.post-type-manager.listPostTypes verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByTemplateIdOrdered(
    templateId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where("template_id", templateId)
      .orderBy("created_at", "asc");
  }

  /**
   * Fetch a single post type scoped to (id, template_id) (full raw row).
   * Mirrors the get/ownership lookups in service.post-type-manager verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByIdAndTemplate(
    postTypeId: string,
    templateId: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ id: postTypeId, template_id: templateId })
      .first();
  }

  /**
   * Fetch a post type by (template_id, slug) (full raw row). Mirrors the
   * slug-uniqueness check in service.post-type-manager.createPostType.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByTemplateAndSlugRaw(
    templateId: string,
    slug: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ template_id: templateId, slug })
      .first();
  }

  /**
   * Fetch a conflicting post type by (template_id, slug) excluding a given id
   * (full raw row). Mirrors the rename slug-conflict check in
   * service.post-type-manager.updatePostType verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findSlugConflictExcludingId(
    templateId: string,
    slug: string,
    excludePostTypeId: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ template_id: templateId, slug })
      .whereNot("id", excludePostTypeId)
      .first();
  }

  /**
   * Insert a post type row verbatim (raw passthrough) and return it. Mirrors
   * the insert in service.post-type-manager.createPostType verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async insertReturning(
    row: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<any> {
    const [created] = await this.table(trx).insert(row).returning("*");
    return created;
  }

  /**
   * Apply a partial column update to a post type scoped to (id, template_id),
   * stamping updated_at via the DB clock, returning the updated row. Mirrors the
   * inline update in service.post-type-manager.updatePostType verbatim (the
   * caller pre-strips id/template_id/created_at).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async updateByIdAndTemplateReturning(
    postTypeId: string,
    templateId: string,
    fields: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<any> {
    const [updated] = await this.table(trx)
      .where({ id: postTypeId, template_id: templateId })
      .update({ ...fields, updated_at: db.fn.now() })
      .returning("*");
    return updated;
  }

  /**
   * Delete a post type scoped to (id, template_id); returns the affected count.
   * Mirrors the delete in service.post-type-manager.deletePostType verbatim.
   */
  static async deleteByIdAndTemplate(
    postTypeId: string,
    templateId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id: postTypeId, template_id: templateId })
      .del();
  }

  /**
   * Resolve a post type for a template by a case-insensitive slug match against
   * a candidate list, preferring an exact (lowercased) match on `preferredSlug`.
   * Mirrors service.post-importer.resolvePostTypeId verbatim — same
   * `whereIn(db.raw("lower(slug)"), candidates)` filter and
   * `orderByRaw("CASE WHEN lower(slug) = ? THEN 0 ELSE 1 END", [preferred])`
   * ordering — and returns the raw row (caller reads `.id`).
   */
  static async findByTemplateAndCandidateSlugs(
    templateId: string,
    candidateSlugsLower: string[],
    preferredSlugLower: string,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return this.table(trx)
      .where("template_id", templateId)
      .whereIn(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        db.raw("lower(slug)") as any,
        candidateSlugsLower,
      )
      .orderByRaw(
        `CASE WHEN lower(slug) = ? THEN 0 ELSE 1 END`,
        [preferredSlugLower],
      )
      .first();
  }
}
