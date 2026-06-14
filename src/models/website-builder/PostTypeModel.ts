import { BaseModel, QueryContext } from "../BaseModel";

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
}
