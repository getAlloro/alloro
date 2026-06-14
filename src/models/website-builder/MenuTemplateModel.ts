import { BaseModel, QueryContext } from "../BaseModel";

export interface IMenuTemplate {
  id: string;
  template_id: string;
  name: string;
  slug: string;
  sections: { name: string; content: string }[];
  created_at: Date;
  updated_at: Date;
}

export class MenuTemplateModel extends BaseModel {
  protected static tableName = "website_builder.menu_templates";
  protected static jsonFields = ["sections"];

  /**
   * Menu templates for a template, projecting slug + name. Mirrors the
   * menu_templates query in service.ai-command.getProjectTemplates verbatim
   * (select slug, name).
   */
  static async findSlugNameByTemplateId(
    templateId: string,
    trx?: QueryContext
  ): Promise<Array<{ slug: string; name: string }>> {
    return this.table(trx).where("template_id", templateId).select("slug", "name");
  }

  /**
   * Fetch a single menu template by template + slug. Mirrors the inline lookup
   * in shortcodeResolver.resolveMenus. Returns the raw row (sections parsed by
   * the caller).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByTemplateAndSlug(
    templateId: string,
    slug: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ template_id: templateId, slug })
      .first();
  }
}
