import { BaseModel, QueryContext } from "../BaseModel";

export interface IPage {
  id: string;
  project_id: string;
  title: string;
  path: string;
  sections: Record<string, unknown>[] | null;
  seo_data: Record<string, unknown> | null;
  status: string;
  sort_order: number | null;
  created_at: Date;
  updated_at: Date;
}

export class PageModel extends BaseModel {
  protected static tableName = "website_builder.pages";
  protected static jsonFields = ["sections", "seo_data"];

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IPage | undefined> {
    return super.findById(id, trx);
  }

  static async findByProjectId(
    projectId: string,
    status?: string,
    trx?: QueryContext
  ): Promise<IPage[]> {
    let query = this.table(trx).where({ project_id: projectId });
    if (status) {
      query = query.where({ status });
    }
    const rows = await query.orderBy("sort_order", "asc");
    return rows.map((row: IPage) => this.deserializeJsonFields(row));
  }

  /**
   * Find pages by project with specific field selection.
   * Used by media usage tracking to only fetch path + sections.
   */
  static async findByProjectWithFields(
    projectId: string,
    fields: string[],
    trx?: QueryContext
  ): Promise<Partial<IPage>[]> {
    return this.table(trx)
      .where({ project_id: projectId })
      .select(fields);
  }

  static async findSectionsByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<Array<Pick<IPage, "id" | "path" | "sections">>> {
    const rows = await this.table(trx)
      .where({ project_id: projectId })
      .select("id", "path", "sections");
    return rows.map((row: IPage) => this.deserializeJsonFields(row));
  }

  /**
   * Find published pages by project, ordered by path.
   * Used by the user-facing website endpoint.
   */
  static async findPublishedByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<IPage[]> {
    const rows = await this.table(trx)
      .where({ project_id: projectId, status: "published" })
      .orderBy("path");
    return rows.map((row: IPage) => this.deserializeJsonFields(row));
  }

  /**
   * Find a page by ID scoped to a specific project (ownership check).
   */
  static async findByIdAndProject(
    pageId: string,
    projectId: string,
    trx?: QueryContext
  ): Promise<IPage | undefined> {
    const row = await this.table(trx)
      .where({ id: pageId, project_id: projectId })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async create(
    data: Partial<IPage>,
    trx?: QueryContext
  ): Promise<IPage> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: string,
    data: Partial<IPage>,
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
}
