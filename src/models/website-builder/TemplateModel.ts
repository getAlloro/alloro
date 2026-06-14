import { BaseModel, QueryContext } from "../BaseModel";

export interface ITemplate {
  id: string;
  name: string;
  status: string;
  wrapper: string | null;
  header: string | null;
  footer: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Owns the `website_builder.templates` table. Introduced so the generation
 * pipeline can resolve a project's template through a model instead of inline
 * `db("website_builder.templates")`. The pipeline reads arbitrary columns off
 * the row (template_id linkage, layout fields), so the read returns the raw row.
 * Mirrors the inline lookup in service.generation-pipeline verbatim.
 */
export class TemplateModel extends BaseModel {
  protected static tableName = "website_builder.templates";

  /**
   * Fetch a template (full raw row) by id. Mirrors the inline
   * db("website_builder.templates").where("id").first() in
   * service.generation-pipeline.generatePageComponents verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findRawById(id: string, trx?: QueryContext): Promise<any> {
    return this.table(trx).where("id", id).first();
  }
}
