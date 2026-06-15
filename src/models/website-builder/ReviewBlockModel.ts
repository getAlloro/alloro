import { BaseModel, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";

export interface IReviewBlock {
  id: string;
  template_id: string;
  name: string;
  slug: string;
  sections: { name: string; content: string }[];
  created_at: Date;
  updated_at: Date;
}

export class ReviewBlockModel extends BaseModel {
  protected static tableName = "website_builder.review_blocks";
  protected static jsonFields = ["sections"];

  /**
   * Review blocks for a template, projecting slug + name + description. Mirrors
   * the review_blocks query in service.ai-command.getProjectTemplates verbatim
   * (select slug, name, description).
   */
  static async findSlugNameDescriptionByTemplateId(
    templateId: string,
    trx?: QueryContext
  ): Promise<Array<{ slug: string; name: string; description: string | null }>> {
    return this.table(trx)
      .where("template_id", templateId)
      .select("slug", "name", "description");
  }

  /**
   * Batch-fetch review blocks for a template by slug list. Mirrors the inline
   * query in shortcodeResolver.resolveReviewBlocks (select slug, sections).
   * Returns raw rows to preserve original consumption (sections parsed by the
   * caller).
   */
  static async findByTemplateAndSlugs(
    templateId: string,
    slugs: string[],
    trx?: QueryContext
  ): Promise<Array<{ slug: string; sections: unknown }>> {
    return this.table(trx)
      .where("template_id", templateId)
      .whereIn("slug", slugs)
      .select("slug", "sections");
  }

  // ===================================================================
  // Admin review-block-manager helpers (service.review-block-manager)
  //
  // Mirror the inline `db("website_builder.review_blocks")` queries in
  // service.review-block-manager verbatim (same columns, filters, ordering, and
  // `db.fn.now()` timestamp source). Reads return raw rows (the service parses
  // `sections` itself), so these bypass deserialization.
  // ===================================================================

  /**
   * All review blocks for a template, ordered created_at asc (raw rows). Mirrors
   * service.review-block-manager.listReviewBlocks verbatim.
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
   * Fetch a single review block scoped to (id, template_id) (raw row). Mirrors
   * the get/ownership lookups in service.review-block-manager verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByIdAndTemplate(
    reviewBlockId: string,
    templateId: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ id: reviewBlockId, template_id: templateId })
      .first();
  }

  /**
   * Fetch a review block by (template_id, slug) (raw row). Mirrors the
   * slug-uniqueness check in service.review-block-manager.createReviewBlock.
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
   * Fetch a conflicting review block by (template_id, slug) excluding a given id
   * (raw row). Mirrors the rename slug-conflict check in
   * service.review-block-manager.updateReviewBlock verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findSlugConflictExcludingId(
    templateId: string,
    slug: string,
    excludeReviewBlockId: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ template_id: templateId, slug })
      .whereNot("id", excludeReviewBlockId)
      .first();
  }

  /**
   * Insert a review block row verbatim (raw passthrough) and return it. Mirrors
   * the insert in service.review-block-manager.createReviewBlock verbatim.
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
   * Apply a partial column update to a review block scoped to (id, template_id),
   * stamping updated_at via the DB clock, returning the updated row. Mirrors the
   * inline update in service.review-block-manager.updateReviewBlock verbatim
   * (the caller pre-strips id/template_id/created_at and pre-stringifies
   * sections).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async updateByIdAndTemplateReturning(
    reviewBlockId: string,
    templateId: string,
    fields: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<any> {
    const [updated] = await this.table(trx)
      .where({ id: reviewBlockId, template_id: templateId })
      .update({ ...fields, updated_at: db.fn.now() })
      .returning("*");
    return updated;
  }

  /**
   * Delete a review block scoped to (id, template_id); returns the affected
   * count. Mirrors the delete in service.review-block-manager.deleteReviewBlock.
   */
  static async deleteByIdAndTemplate(
    reviewBlockId: string,
    templateId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id: reviewBlockId, template_id: templateId })
      .del();
  }
}
