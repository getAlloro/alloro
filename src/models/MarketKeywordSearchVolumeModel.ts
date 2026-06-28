import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

export interface IMarketKeywordSearchVolume {
  id: string;
  market_keyword_id: string;
  organization_id: number;
  location_id: number;
  report_month: string;
  search_volume: number | null;
  source: string;
  provider: string;
  provider_location_name: string | null;
  provider_metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface MarketKeywordVolumeUpsert {
  marketKeywordId: string;
  organizationId: number;
  locationId: number;
  reportMonth: string;
  searchVolume: number | null;
  source?: string;
  provider?: string;
  providerLocationName?: string | null;
  providerMetadata?: Record<string, unknown>;
}

export interface MarketOpportunitySourceBreakdown {
  source: string;
  keywordCount: number;
  volume: number;
  nullVolumeCount: number;
}

export interface MarketOpportunityClusterBreakdown {
  cluster: string;
  keywordCount: number;
  volume: number;
  nullVolumeCount: number;
}

export interface MarketOpportunityTopKeyword {
  keyword: string;
  normalizedKeyword: string;
  volume: number;
  nullVolumeCount: number;
  locationCount: number;
}

export interface MarketOpportunitySummary {
  estimatedSearchOpportunity: number;
  keywordCount: number;
  clusterCount: number;
  nullVolumeCount: number;
  sourceBreakdown: MarketOpportunitySourceBreakdown[];
  clusterBreakdown: MarketOpportunityClusterBreakdown[];
  topKeywords: MarketOpportunityTopKeyword[];
  reportMonth: string;
  latestUpdatedAt: string | null;
}

interface OpportunityRow {
  market_keyword_id: string;
  keyword: string;
  normalized_keyword: string;
  location_id: number;
  search_volume: number | null;
  keyword_source: string;
  cluster: string | null;
  updated_at: Date | string;
}

const DEFAULT_SOURCE = "dataforseo";
const DEFAULT_PROVIDER = "dataforseo";

export class MarketKeywordSearchVolumeModel extends BaseModel {
  protected static tableName = "market_keyword_search_volume";
  protected static jsonFields = ["provider_metadata"];

  static async upsert(row: MarketKeywordVolumeUpsert, trx?: QueryContext): Promise<void> {
    const now = new Date();
    const providerMetadata = this.toJson(row.providerMetadata ?? {});
    await this.table(trx)
      .insert({
        market_keyword_id: row.marketKeywordId,
        organization_id: row.organizationId,
        location_id: row.locationId,
        report_month: row.reportMonth,
        search_volume: row.searchVolume,
        source: row.source ?? DEFAULT_SOURCE,
        provider: row.provider ?? DEFAULT_PROVIDER,
        provider_location_name: row.providerLocationName ?? null,
        provider_metadata: providerMetadata,
        created_at: now,
        updated_at: now,
      })
      .onConflict(["market_keyword_id", "report_month", "source"])
      .merge({
        organization_id: row.organizationId,
        location_id: row.locationId,
        search_volume: row.searchVolume,
        provider: row.provider ?? DEFAULT_PROVIDER,
        provider_location_name: row.providerLocationName ?? null,
        provider_metadata: providerMetadata,
        updated_at: now,
      });
  }

  static async upsertMany(rows: MarketKeywordVolumeUpsert[], trx?: QueryContext): Promise<void> {
    for (const row of rows) {
      await this.upsert(row, trx);
    }
  }

  static async getOpportunitySummaryForOrganization(
    organizationId: number,
    reportMonth: string,
    trx?: QueryContext,
  ): Promise<MarketOpportunitySummary> {
    const rows = await (trx || db)("market_keyword_search_volume as v")
      .join("market_keywords as k", "k.id", "v.market_keyword_id")
      .where("v.organization_id", organizationId)
      .andWhere("v.report_month", reportMonth)
      .andWhere("k.status", "approved")
      .select(
        "v.market_keyword_id",
        "v.location_id",
        "v.search_volume",
        "v.updated_at",
        "k.keyword",
        "k.normalized_keyword",
        "k.source as keyword_source",
        "k.cluster",
      );

    return summarizeOpportunityRows(rows as OpportunityRow[], reportMonth);
  }

  static async findLatestMonthForOrganization(
    organizationId: number,
    trx?: QueryContext,
  ): Promise<string | null> {
    const row = await this.table(trx)
      .where({ organization_id: organizationId })
      .select<{ latest_month: string | null }[]>(
        db.raw("max(report_month)::text as latest_month"),
      )
      .first();
    return row?.latest_month ?? null;
  }
}

export function summarizeOpportunityRows(
  rows: OpportunityRow[],
  reportMonth: string,
): MarketOpportunitySummary {
  const keywordIds = new Set<string>();
  const clusters = new Map<string, MarketOpportunityClusterBreakdown>();
  const sources = new Map<string, MarketOpportunitySourceBreakdown>();
  const topKeywordRows = new Map<string, MarketOpportunityTopKeyword & {
    locationIds: Set<number>;
  }>();
  let estimatedSearchOpportunity = 0;
  let nullVolumeCount = 0;
  let latestUpdatedAt: string | null = null;

  for (const row of rows) {
    keywordIds.add(row.market_keyword_id);
    const volume = typeof row.search_volume === "number" ? row.search_volume : 0;
    const hasNullVolume = row.search_volume === null || row.search_volume === undefined;
    estimatedSearchOpportunity += volume;
    if (hasNullVolume) nullVolumeCount += 1;

    const normalizedKeyword = row.normalized_keyword || row.keyword.toLowerCase().trim();
    const topKeywordRow = topKeywordRows.get(normalizedKeyword) ?? {
      keyword: row.keyword,
      normalizedKeyword,
      volume: 0,
      nullVolumeCount: 0,
      locationCount: 0,
      locationIds: new Set<number>(),
    };
    topKeywordRow.volume += volume;
    if (hasNullVolume) topKeywordRow.nullVolumeCount += 1;
    topKeywordRow.locationIds.add(row.location_id);
    topKeywordRow.locationCount = topKeywordRow.locationIds.size;
    topKeywordRows.set(normalizedKeyword, topKeywordRow);

    const source = row.keyword_source || "unknown";
    const sourceRow = sources.get(source) ?? {
      source,
      keywordCount: 0,
      volume: 0,
      nullVolumeCount: 0,
    };
    sourceRow.keywordCount += 1;
    sourceRow.volume += volume;
    if (hasNullVolume) sourceRow.nullVolumeCount += 1;
    sources.set(source, sourceRow);

    const cluster = row.cluster || "Unclustered";
    const clusterRow = clusters.get(cluster) ?? {
      cluster,
      keywordCount: 0,
      volume: 0,
      nullVolumeCount: 0,
    };
    clusterRow.keywordCount += 1;
    clusterRow.volume += volume;
    if (hasNullVolume) clusterRow.nullVolumeCount += 1;
    clusters.set(cluster, clusterRow);

    const updated = row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at);
    if (!latestUpdatedAt || updated > latestUpdatedAt) {
      latestUpdatedAt = updated;
    }
  }

  return {
    estimatedSearchOpportunity,
    keywordCount: keywordIds.size,
    clusterCount: clusters.size,
    nullVolumeCount,
    sourceBreakdown: Array.from(sources.values()).sort((a, b) => b.volume - a.volume),
    clusterBreakdown: Array.from(clusters.values()).sort((a, b) => b.volume - a.volume),
    topKeywords: Array.from(topKeywordRows.values())
      .map(({ locationIds, ...keyword }) => keyword)
      .sort((a, b) => b.volume - a.volume || a.keyword.localeCompare(b.keyword))
      .slice(0, 10),
    reportMonth,
    latestUpdatedAt,
  };
}
