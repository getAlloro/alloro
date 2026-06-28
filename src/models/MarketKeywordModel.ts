import { BaseModel, QueryContext } from "./BaseModel";

export type MarketKeywordSource =
  | "identifier_seed"
  | "market_intelligence_agent"
  | "gsc_query"
  | "website_content"
  | "service_taxonomy"
  | "manual"
  | "future_dataforseo_keyword_ideas"
  | "future_competitor_research";

export type MarketKeywordStatus = "candidate" | "approved" | "rejected" | "archived";

export interface IMarketKeyword {
  id: string;
  organization_id: number;
  location_id: number;
  specialty: string | null;
  keyword: string;
  normalized_keyword: string;
  canonical_keyword: string | null;
  cluster: string | null;
  intent: string | null;
  source: MarketKeywordSource;
  status: MarketKeywordStatus;
  confidence: string | number | null;
  language_code: string;
  location_name: string | null;
  last_seen_at: Date | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface MarketKeywordUpsert {
  organizationId: number;
  locationId: number;
  specialty?: string | null;
  keyword: string;
  normalizedKeyword: string;
  canonicalKeyword?: string | null;
  cluster?: string | null;
  intent?: string | null;
  source: MarketKeywordSource;
  status?: MarketKeywordStatus;
  confidence?: number | null;
  languageCode?: string;
  locationName?: string | null;
  lastSeenAt?: Date | null;
  metadata?: Record<string, unknown>;
}

export interface MarketKeywordHarvestRow {
  id: string;
  organization_id: number;
  location_id: number;
  keyword: string;
  normalized_keyword: string;
  cluster: string | null;
  source: MarketKeywordSource;
  location_name: string | null;
}

export class MarketKeywordModel extends BaseModel {
  protected static tableName = "market_keywords";
  protected static jsonFields = ["metadata"];

  private static readonly selectColumns = [
    "id",
    "organization_id",
    "location_id",
    "specialty",
    "keyword",
    "normalized_keyword",
    "canonical_keyword",
    "cluster",
    "intent",
    "source",
    "status",
    "confidence",
    "language_code",
    "location_name",
    "last_seen_at",
    "metadata",
    "created_at",
    "updated_at",
  ];

  static async upsert(row: MarketKeywordUpsert, trx?: QueryContext): Promise<void> {
    const now = new Date();
    const data = this.toJson(row.metadata ?? {});
    await this.table(trx)
      .insert({
        organization_id: row.organizationId,
        location_id: row.locationId,
        specialty: row.specialty ?? null,
        keyword: row.keyword,
        normalized_keyword: row.normalizedKeyword,
        canonical_keyword: row.canonicalKeyword ?? row.normalizedKeyword,
        cluster: row.cluster ?? null,
        intent: row.intent ?? null,
        source: row.source,
        status: row.status ?? "approved",
        confidence: row.confidence ?? null,
        language_code: row.languageCode ?? "en",
        location_name: row.locationName ?? null,
        last_seen_at: row.lastSeenAt ?? null,
        metadata: data,
        created_at: now,
        updated_at: now,
      })
      .onConflict(["organization_id", "location_id", "normalized_keyword"])
      .merge({
        specialty: row.specialty ?? null,
        keyword: row.keyword,
        canonical_keyword: row.canonicalKeyword ?? row.normalizedKeyword,
        cluster: row.cluster ?? null,
        intent: row.intent ?? null,
        source: row.source,
        status: row.status ?? "approved",
        confidence: row.confidence ?? null,
        language_code: row.languageCode ?? "en",
        location_name: row.locationName ?? null,
        last_seen_at: row.lastSeenAt ?? null,
        metadata: data,
        updated_at: now,
      });
  }

  static async upsertMany(rows: MarketKeywordUpsert[], trx?: QueryContext): Promise<void> {
    for (const row of rows) {
      await this.upsert(row, trx);
    }
  }

  static async findApprovedByOrganization(
    organizationId: number,
    trx?: QueryContext,
  ): Promise<IMarketKeyword[]> {
    const rows = await this.table(trx)
      .select(this.selectColumns)
      .where({ organization_id: organizationId, status: "approved" })
      .orderBy("location_id", "asc")
      .orderBy("normalized_keyword", "asc");
    return rows.map((row: IMarketKeyword) => this.deserializeJsonFields(row));
  }

  static async findApprovedForHarvest(
    organizationId: number,
    trx?: QueryContext,
  ): Promise<MarketKeywordHarvestRow[]> {
    return this.table(trx)
      .select(
        "id",
        "organization_id",
        "location_id",
        "keyword",
        "normalized_keyword",
        "cluster",
        "source",
        "location_name",
      )
      .where({ organization_id: organizationId, status: "approved" })
      .orderBy("location_id", "asc")
      .orderBy("normalized_keyword", "asc");
  }

  static async findByLocation(
    organizationId: number,
    locationId: number,
    trx?: QueryContext,
  ): Promise<IMarketKeyword[]> {
    const rows = await this.table(trx)
      .select(this.selectColumns)
      .where({ organization_id: organizationId, location_id: locationId })
      .orderBy("normalized_keyword", "asc");
    return rows.map((row: IMarketKeyword) => this.deserializeJsonFields(row));
  }

  static async findApprovedByLocation(
    organizationId: number,
    locationId: number,
    trx?: QueryContext,
  ): Promise<IMarketKeyword[]> {
    const rows = await this.table(trx)
      .select(this.selectColumns)
      .where({ organization_id: organizationId, location_id: locationId, status: "approved" })
      .orderBy("normalized_keyword", "asc");
    return rows.map((row: IMarketKeyword) => this.deserializeJsonFields(row));
  }

  static async markLastSeen(
    organizationId: number,
    locationId: number,
    normalizedKeyword: string,
    lastSeenAt: Date,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where({
        organization_id: organizationId,
        location_id: locationId,
        normalized_keyword: normalizedKeyword,
      })
      .update({ last_seen_at: lastSeenAt, updated_at: new Date() });
  }

  static async demoteApprovedGscKeywordsToCandidates(
    organizationId: number,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where({
        organization_id: organizationId,
        source: "gsc_query",
        status: "approved",
      })
      .update({ status: "candidate", updated_at: new Date() });
  }

  static async archiveApprovedKeywordsNotInSet(
    organizationId: number,
    locationId: number,
    normalizedKeywords: string[],
    trx?: QueryContext,
  ): Promise<number> {
    const query = this.table(trx)
      .where({
        organization_id: organizationId,
        location_id: locationId,
        status: "approved",
      })
      .whereNot({ source: "manual" });

    if (normalizedKeywords.length > 0) {
      query.whereNotIn("normalized_keyword", normalizedKeywords);
    }

    return query.update({ status: "archived", updated_at: new Date() });
  }

  static async archive(
    organizationId: number,
    locationId: number,
    normalizedKeyword: string,
    trx?: QueryContext,
  ): Promise<number> {
    return this.table(trx)
      .where({
        organization_id: organizationId,
        location_id: locationId,
        normalized_keyword: normalizedKeyword,
      })
      .update({ status: "archived", updated_at: new Date() });
  }

  static async countApprovedByLocation(
    organizationId: number,
    locationId: number,
    trx?: QueryContext,
  ): Promise<number> {
    return this.count({ organization_id: organizationId, location_id: locationId, status: "approved" }, trx);
  }
}
