import { BaseModel, QueryContext } from "../BaseModel";

export interface IGscData {
  id: string;
  project_id: string;
  report_date: string;
  data: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export class GscDataModel extends BaseModel {
  protected static tableName = "website_builder.gsc_data";
  protected static jsonFields = ["data"];

  static async upsert(
    projectId: string,
    reportDate: string,
    data: unknown,
    trx?: QueryContext,
  ): Promise<void> {
    const jsonData = this.toJson(data);
    const now = new Date();
    await this.table(trx)
      .insert({
        project_id: projectId,
        report_date: reportDate,
        data: jsonData,
        created_at: now,
        updated_at: now,
      })
      .onConflict(["project_id", "report_date"])
      .merge({
        data: jsonData,
        updated_at: now,
      });
  }

  static async findByProjectAndDateRange(
    projectId: string,
    startDate: string,
    endDate: string,
    trx?: QueryContext,
  ): Promise<IGscData[]> {
    const rows = await this.table(trx)
      .where("project_id", projectId)
      .andWhereBetween("report_date", [startDate, endDate])
      .orderBy("report_date", "desc");
    return rows.map((row: IGscData) => this.deserializeJsonFields(row));
  }

  static async findLatestReportDate(
    projectId: string,
    trx?: QueryContext,
  ): Promise<string | null> {
    const row = await this.table(trx)
      .where({ project_id: projectId })
      .max<{ latest_report_date: string | null }>(
        "report_date as latest_report_date",
      )
      .first();
    return row?.latest_report_date ?? null;
  }

  static async deleteByProjectId(
    projectId: string,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx).where({ project_id: projectId }).del();
  }
}
