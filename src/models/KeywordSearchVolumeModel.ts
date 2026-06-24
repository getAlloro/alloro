import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

export interface IKeywordSearchVolume {
  id: string;
  organization_id: number;
  location_id: number;
  keyword: string;
  report_month: string;
  search_volume: number | null;
  source: string;
  location_name: string | null;
  data: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface KeywordVolumeUpsert {
  organizationId: number;
  locationId: number;
  keyword: string;
  reportMonth: string; // first day of the month, YYYY-MM-01
  searchVolume: number | null;
  source?: string;
  locationName?: string | null;
  data?: Record<string, unknown>;
}

export interface MarketVolumeSummary {
  totalVolume: number;
  keywordCount: number;
  reportMonth: string | null;
}

const DEFAULT_SOURCE = "dataforseo";

/**
 * Market search-volume per location keyword per month. Powers the
 * "Searching your market" stage of the Patient Journey funnel. Public schema,
 * location-keyed (same domain as practice_rankings).
 */
export class KeywordSearchVolumeModel extends BaseModel {
  protected static tableName = "keyword_search_volume";
  protected static jsonFields = ["data"];
  private static readonly selectColumns = [
    "id",
    "organization_id",
    "location_id",
    "keyword",
    "search_volume",
    "source",
    "location_name",
    "data",
    "created_at",
    "updated_at",
  ];

  static async upsert(row: KeywordVolumeUpsert, trx?: QueryContext): Promise<void> {
    const now = new Date();
    const jsonData = this.toJson(row.data ?? {});
    await this.table(trx)
      .insert({
        organization_id: row.organizationId,
        location_id: row.locationId,
        keyword: row.keyword,
        report_month: row.reportMonth,
        search_volume: row.searchVolume ?? null,
        source: row.source ?? DEFAULT_SOURCE,
        location_name: row.locationName ?? null,
        data: jsonData,
        created_at: now,
        updated_at: now,
      })
      .onConflict(["location_id", "keyword", "report_month"])
      .merge({
        organization_id: row.organizationId,
        search_volume: row.searchVolume ?? null,
        source: row.source ?? DEFAULT_SOURCE,
        location_name: row.locationName ?? null,
        data: jsonData,
        updated_at: now,
      });
  }

  static async upsertMany(rows: KeywordVolumeUpsert[], trx?: QueryContext): Promise<void> {
    for (const row of rows) {
      await this.upsert(row, trx);
    }
  }

  /**
   * Total monthly market demand for a location: the sum of search volume across
   * its tracked keywords for the given month. Tenant-scoped by organization_id (§11.7).
   */
  static async getMarketVolumeForLocation(
    organizationId: number,
    locationId: number,
    reportMonth: string,
    trx?: QueryContext,
  ): Promise<MarketVolumeSummary> {
    const row = await this.table(trx)
      .where({
        organization_id: organizationId,
        location_id: locationId,
        report_month: reportMonth,
      })
      .select<{ total_volume: number; keyword_count: number }[]>(
        db.raw("COALESCE(SUM(search_volume), 0)::int as total_volume"),
        db.raw("COUNT(*)::int as keyword_count"),
      )
      .first();
    return {
      totalVolume: row?.total_volume ?? 0,
      keywordCount: row?.keyword_count ?? 0,
      reportMonth,
    };
  }

  static async findByLocationAndMonth(
    organizationId: number,
    locationId: number,
    reportMonth: string,
    trx?: QueryContext,
  ): Promise<IKeywordSearchVolume[]> {
    const rows = await this.table(trx)
      .select(this.selectColumns)
      .select(db.raw("report_month::text as report_month"))
      .where({
        organization_id: organizationId,
        location_id: locationId,
        report_month: reportMonth,
      })
      .orderBy("search_volume", "desc");
    return rows.map((row: IKeywordSearchVolume) => this.deserializeJsonFields(row));
  }

  static async findLatestMonth(
    organizationId: number,
    locationId: number,
    trx?: QueryContext,
  ): Promise<string | null> {
    const row = await this.table(trx)
      .where({ organization_id: organizationId, location_id: locationId })
      .select<{ latest_month: string | null }[]>(
        db.raw("max(report_month)::text as latest_month"),
      )
      .first();
    return row?.latest_month ?? null;
  }
}
