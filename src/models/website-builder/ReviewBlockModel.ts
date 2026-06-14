import { BaseModel, QueryContext } from "../BaseModel";

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
}
