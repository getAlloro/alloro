import { BaseModel, QueryContext } from "../BaseModel";

export interface ITemplatePage {
  id: string;
  template_id: string;
  title: string;
  path: string;
  sections: Record<string, unknown>[] | null;
  meta_title: string | null;
  meta_description: string | null;
  sort_order: number | null;
  created_at: Date;
  updated_at: Date;
}

export class TemplatePageModel extends BaseModel {
  protected static tableName = "website_builder.template_pages";
  protected static jsonFields = ["sections"];

  static async findByTemplateId(
    templateId: string,
    trx?: QueryContext
  ): Promise<ITemplatePage[]> {
    const rows = await this.table(trx)
      .where({ template_id: templateId })
      .orderBy("sort_order", "asc");
    return rows.map((row: ITemplatePage) =>
      this.deserializeJsonFields(row)
    );
  }

  static async findSectionsByTemplateId(
    templateId: string,
    trx?: QueryContext
  ): Promise<Array<Pick<ITemplatePage, "id" | "sections">>> {
    const rows = await this.table(trx)
      .where({ template_id: templateId })
      .select("id", "sections");
    return rows.map((row: ITemplatePage) =>
      this.deserializeJsonFields(row)
    );
  }
}
