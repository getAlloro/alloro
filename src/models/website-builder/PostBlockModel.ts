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
}
