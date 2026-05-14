import { BaseModel, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";

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
  private static readonly selectColumns = [
    "id",
    "project_id",
    "data",
    "created_at",
    "updated_at",
  ];

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
      .select(this.selectColumns)
      .select(db.raw("report_date::text as report_date"))
      .where("project_id", projectId)
      .andWhereBetween("report_date", [startDate, endDate])
      .orderBy("report_date", "desc");
    return rows.map((row: IGscData) => this.deserializeJsonFields(row));
  }

  static async findByProjectAndDate(
    projectId: string,
    reportDate: string,
    trx?: QueryContext,
  ): Promise<IGscData | undefined> {
    const row = await this.table(trx)
      .select(this.selectColumns)
      .select(db.raw("report_date::text as report_date"))
      .where({ project_id: projectId, report_date: reportDate })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findLatestReportDate(
    projectId: string,
    trx?: QueryContext,
  ): Promise<string | null> {
    const row = await this.table(trx)
      .where({ project_id: projectId })
      .select<{ latest_report_date: string | null }[]>(
        db.raw("max(report_date)::text as latest_report_date"),
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
