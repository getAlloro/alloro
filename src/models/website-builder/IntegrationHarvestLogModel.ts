import { BaseModel, PaginatedResult, PaginationParams, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";

export type HarvestOutcome = "success" | "failed";

export interface IIntegrationHarvestLog {
  id: string;
  integration_id: string | null;
  platform: string | null;
  harvest_date: string;
  outcome: HarvestOutcome;
  rows_fetched: number | null;
  error: string | null;
  error_details: string | null;
  retry_count: number;
  attempted_at: Date;
}

const HARVEST_LOG_COLUMNS = [
  "id",
  "integration_id",
  "platform",
  "outcome",
  "rows_fetched",
  "error",
  "error_details",
  "retry_count",
  "attempted_at",
];

export class IntegrationHarvestLogModel extends BaseModel {
  protected static tableName = "website_builder.integration_harvest_logs";

  static async create(
    data: {
      integration_id?: string | null;
      platform?: string | null;
      harvest_date: string;
      outcome: HarvestOutcome;
      rows_fetched?: number | null;
      error?: string | null;
      error_details?: string | null;
      retry_count?: number;
    },
    trx?: QueryContext,
  ): Promise<IIntegrationHarvestLog> {
    const [result] = await this.table(trx)
      .insert({
        integration_id: data.integration_id ?? null,
        platform: data.platform ?? null,
        harvest_date: data.harvest_date,
        outcome: data.outcome,
        rows_fetched: data.rows_fetched ?? null,
        error: data.error ?? null,
        error_details: data.error_details ?? null,
        retry_count: data.retry_count ?? 0,
        attempted_at: new Date(),
      })
      .returning("*");
    return result as IIntegrationHarvestLog;
  }

  static async findByIntegrationId(
    integrationId: string,
    pagination: PaginationParams,
    trx?: QueryContext,
  ): Promise<PaginatedResult<IIntegrationHarvestLog>> {
    const { limit = 50, offset = 0 } = pagination;
    const baseQuery = this.table(trx).where({ integration_id: integrationId });

    const totalResult = await baseQuery
      .clone()
      .count("* as count")
      .first();
    const total = parseInt(totalResult?.count as string, 10) || 0;

    const rows = await baseQuery
      .clone()
      .select(HARVEST_LOG_COLUMNS)
      .select(db.raw("harvest_date::text as harvest_date"))
      .orderBy("harvest_date", "desc")
      .orderBy("attempted_at", "desc")
      .limit(limit)
      .offset(offset);

    return { data: rows as IIntegrationHarvestLog[], total };
  }

  static async findFailedByIntegrationId(
    integrationId: string,
    trx?: QueryContext,
  ): Promise<IIntegrationHarvestLog[]> {
    return this.table(trx)
      .where({ integration_id: integrationId, outcome: "failed" })
      .where("retry_count", "<", 3)
      .orderBy("attempted_at", "desc");
  }

  static async getLatestRetryCount(
    integrationId: string,
    harvestDate: string,
    trx?: QueryContext,
  ): Promise<number> {
    const row = await this.table(trx)
      .where({ integration_id: integrationId, harvest_date: harvestDate })
      .orderBy("attempted_at", "desc")
      .select("retry_count")
      .first();
    return row?.retry_count ?? 0;
  }

  static async getSuccessRate(
    integrationId: string,
    days: number = 30,
    trx?: QueryContext,
  ): Promise<{ total: number; successful: number; failed: number }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const rows = await this.table(trx)
      .where({ integration_id: integrationId })
      .where("attempted_at", ">=", cutoff)
      .select("outcome");

    const total = rows.length;
    const successful = rows.filter((r: { outcome: string }) => r.outcome === "success").length;
    return { total, successful, failed: total - successful };
  }

  static async deleteByIntegrationId(
    integrationId: string,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx).where({ integration_id: integrationId }).del();
  }

  static async deleteByIntegrationAndPlatform(
    integrationId: string,
    platform: string,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where({ integration_id: integrationId, platform })
      .del();
  }
}
