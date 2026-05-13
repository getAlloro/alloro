import { BaseModel, QueryContext } from "../BaseModel";

export type HeaderFooterLocation = "head_start" | "head_end" | "body_start" | "body_end";

export interface IHeaderFooterCode {
  id: string;
  project_id: string | null;
  template_id: string | null;
  name: string;
  code: string;
  location: HeaderFooterLocation;
  is_enabled: boolean;
  order_index: number;
  page_ids: string[];
  created_at: Date;
  updated_at: Date;
}

export class HeaderFooterCodeModel extends BaseModel {
  protected static tableName = "website_builder.header_footer_code";
  protected static jsonFields = ["page_ids"];

  static async findByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<IHeaderFooterCode[]> {
    const rows = await this.table(trx)
      .where({ project_id: projectId })
      .orderBy("location", "asc")
      .orderBy("order_index", "asc");
    return rows.map((row: IHeaderFooterCode) => this.deserializeJsonFields(row));
  }

  static async findByTemplateId(
    templateId: string,
    trx?: QueryContext
  ): Promise<IHeaderFooterCode[]> {
    const rows = await this.table(trx)
      .where({ template_id: templateId })
      .orderBy("location", "asc")
      .orderBy("order_index", "asc");
    return rows.map((row: IHeaderFooterCode) => this.deserializeJsonFields(row));
  }

  static async findByProjectAndSnippetIds(
    projectId: string,
    snippetIds: string[],
    trx?: QueryContext,
  ): Promise<IHeaderFooterCode[]> {
    if (snippetIds.length === 0) return [];

    const rows = await this.table(trx)
      .where({ project_id: projectId })
      .whereIn("id", snippetIds)
      .orderBy("location", "asc")
      .orderBy("order_index", "asc");
    return rows.map((row: IHeaderFooterCode) => this.deserializeJsonFields(row));
  }

  static async setProjectSnippetsEnabled(
    projectId: string,
    snippetIds: string[],
    isEnabled: boolean,
    trx?: QueryContext,
  ): Promise<number> {
    if (snippetIds.length === 0) return 0;

    return this.table(trx)
      .where({ project_id: projectId })
      .whereIn("id", snippetIds)
      .update({
        is_enabled: isEnabled,
        updated_at: new Date(),
      });
  }

  static async create(
    data: Partial<IHeaderFooterCode>,
    trx?: QueryContext
  ): Promise<IHeaderFooterCode> {
    return super.create(
      data as Record<string, unknown>,
      trx
    );
  }

  static async updateById(
    id: string,
    data: Partial<IHeaderFooterCode>,
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

  static async updateSortOrder(
    id: string,
    orderIndex: number,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, { order_index: orderIndex }, trx);
  }

  static async toggleEnabled(
    id: string,
    isEnabled: boolean,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, { is_enabled: isEnabled }, trx);
  }
}
