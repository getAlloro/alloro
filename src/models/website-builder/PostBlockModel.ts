import { BaseModel, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";

export interface IPostBlock {
  id: string;
  template_id: string;
  post_type_id: string;
  name: string;
  slug: string;
  description: string | null;
  sections: { name: string; content: string }[];
  created_at: Date;
  updated_at: Date;
}

export class PostBlockModel extends BaseModel {
  protected static tableName = "website_builder.post_blocks";
  protected static jsonFields = ["sections"];

  static async findByTemplateId(
    templateId: string,
    trx?: QueryContext
  ): Promise<IPostBlock[]> {
    const rows = await this.table(trx)
      .where({ template_id: templateId })
      .orderBy("created_at", "asc");
    return rows.map((row: IPostBlock) => this.deserializeJsonFields(row));
  }

  static async findByTemplateAndSlug(
    templateId: string,
    slug: string,
    trx?: QueryContext
  ): Promise<IPostBlock | undefined> {
    const row = await this.table(trx)
      .where({ template_id: templateId, slug })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IPostBlock | undefined> {
    const row = await super.findById(id, trx);
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async create(
    data: Partial<IPostBlock>,
    trx?: QueryContext
  ): Promise<IPostBlock> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: string,
    data: Partial<IPostBlock>,
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

  /**
   * Post blocks for a template joined to their post type, projecting the
   * slug/name/description plus the post type's slug. Mirrors the post_blocks
   * query in service.ai-command.getProjectTemplates verbatim
   * (select pb.slug, pb.name, pb.description, pt.slug as post_type_slug).
   */
  static async findWithPostTypeByTemplateId(
    templateId: string,
    trx?: QueryContext
  ): Promise<
    Array<{
      slug: string;
      name: string;
      description: string | null;
      post_type_slug: string;
    }>
  > {
    return (trx || db)("website_builder.post_blocks as pb")
      .join("website_builder.post_types as pt", "pb.post_type_id", "pt.id")
      .where("pb.template_id", templateId)
      .select("pb.slug", "pb.name", "pb.description", "pt.slug as post_type_slug");
  }

  /**
   * Batch-fetch post blocks for a template by slug list, joined to their post
   * type so the resolver gets each block's post_type_slug. Mirrors the inline
   * query in shortcodeResolver.resolvePostBlocks (select pb.slug, pb.sections,
   * pt.slug as post_type_slug). Returns raw rows to preserve original
   * consumption (sections parsed by the caller).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findWithPostTypeByTemplateAndSlugs(
    templateId: string,
    slugs: string[],
    trx?: QueryContext
  ): Promise<Array<{ slug: string; sections: unknown; post_type_slug: string }>> {
    return (trx || db)("website_builder.post_blocks as pb")
      .join("website_builder.post_types as pt", "pb.post_type_id", "pt.id")
      .where("pb.template_id", templateId)
      .whereIn("pb.slug", slugs)
      .select("pb.slug", "pb.sections", "pt.slug as post_type_slug");
  }

  // ===================================================================
  // Admin post-block-manager helpers (service.post-block-manager)
  //
  // Mirror the inline `db("website_builder.post_blocks")` queries in
  // service.post-block-manager verbatim (same columns, filters, ordering, and
  // `db.fn.now()` timestamp source). Reads return raw rows (the service parses
  // `sections` itself), so these bypass deserialization.
  // ===================================================================

  /**
   * All post blocks for a template, ordered created_at asc (raw rows). Mirrors
   * service.post-block-manager.listPostBlocks verbatim.
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
   * Fetch a single post block scoped to (id, template_id) (raw row). Mirrors the
   * get/ownership lookups in service.post-block-manager verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByIdAndTemplate(
    postBlockId: string,
    templateId: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ id: postBlockId, template_id: templateId })
      .first();
  }

  /**
   * Fetch a post block by (template_id, slug) (raw row). Mirrors the
   * slug-uniqueness check in service.post-block-manager.createPostBlock.
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
   * Fetch a conflicting post block by (template_id, slug) excluding a given id
   * (raw row). Mirrors the rename slug-conflict check in
   * service.post-block-manager.updatePostBlock verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findSlugConflictExcludingId(
    templateId: string,
    slug: string,
    excludePostBlockId: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ template_id: templateId, slug })
      .whereNot("id", excludePostBlockId)
      .first();
  }

  /**
   * Insert a post block row verbatim (raw passthrough) and return it. Mirrors
   * the insert in service.post-block-manager.createPostBlock verbatim.
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
   * Apply a partial column update to a post block scoped to (id, template_id),
   * stamping updated_at via the DB clock, returning the updated row. Mirrors the
   * inline update in service.post-block-manager.updatePostBlock verbatim (the
   * caller pre-strips id/template_id/created_at and pre-stringifies sections).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async updateByIdAndTemplateReturning(
    postBlockId: string,
    templateId: string,
    fields: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<any> {
    const [updated] = await this.table(trx)
      .where({ id: postBlockId, template_id: templateId })
      .update({ ...fields, updated_at: db.fn.now() })
      .returning("*");
    return updated;
  }

  /**
   * Delete a post block scoped to (id, template_id); returns the affected count.
   * Mirrors the delete in service.post-block-manager.deletePostBlock.
   */
  static async deleteByIdAndTemplate(
    postBlockId: string,
    templateId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id: postBlockId, template_id: templateId })
      .del();
  }
}
