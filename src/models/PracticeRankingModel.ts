import { Knex } from "knex";
import { BaseModel, PaginatedResult, PaginationParams, QueryContext } from "./BaseModel";

export type SearchPositionStatus =
  | "ok"
  | "not_in_top_20"
  | "bias_unavailable"
  | "api_error";

/**
 * Source of the persisted `search_position` value.
 *
 * - `serpapi_maps`: SerpApi Google Maps search, centered on client coordinates
 * - `apify_maps`  : legacy Apify Google Maps actor
 * - `places_text`: legacy Places API `searchText` (soft fallback when live Maps lookup fails)
 * - null         : pre-cutover row, before source tracking shipped
 *
 * Spec: plans/05142026-no-ticket-serpapi-maps-rank-source/spec.md (T3)
 */
export type SearchPositionSource = "serpapi_maps" | "apify_maps" | "places_text";
export type RankingRunReason =
  | "scheduled"
  | "manual"
  | "first_competitor_finalize"
  | "competitor_reselection"
  | "retry";

export interface SearchResultEntry {
  placeId: string;
  name: string;
  position: number;
  rating: number;
  reviewCount: number;
  primaryType: string;
  types: string[];
  isClient: boolean;
}

export interface IPracticeRanking {
  id: number;
  organization_id: number;
  location_id: number | null;
  specialty: string | null;
  location: string | null;
  gbp_account_id: string | null;
  gbp_location_id: string | null;
  gbp_location_name: string | null;
  batch_id: string | null;
  observed_at: Date | null;
  status: "pending" | "processing" | "completed" | "failed";
  status_detail: Record<string, unknown> | null;
  rank_keywords: string | null;
  search_city: string | null;
  search_state: string | null;
  search_county: string | null;
  search_postal_code: string | null;
  // Search Position fields (Practice Health + Search Position split)
  // Spec: plans/04122026-no-ticket-practice-health-search-position-split/spec.md
  search_position: number | null;
  search_query: string | null;
  search_lat: number | null;
  search_lng: number | null;
  search_radius_meters: number | null;
  search_results: SearchResultEntry[] | null;
  search_checked_at: Date | null;
  search_status: SearchPositionStatus | null;
  search_position_source: SearchPositionSource | null;
  competitor_discovery_radius_meters: number | null;
  competitor_set_revision: number | null;
  competitor_snapshot: Record<string, unknown> | null;
  run_reason: RankingRunReason | null;
  include_in_summary_recommendations: boolean;
  llm_analysis: Record<string, unknown> | null;
  ranking_factors: Record<string, unknown> | null;
  raw_data: Record<string, unknown> | null;
  rank_score: number | null;
  rank_position: number | null;
  total_competitors: number | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface RankingFilters {
  status?: string;
  gbp_location_id?: string;
  batch_id?: string;
  location_id?: number;
}

export class PracticeRankingModel extends BaseModel {
  protected static tableName = "practice_rankings";
  protected static jsonFields = [
    "status_detail",
    "llm_analysis",
    "ranking_factors",
    "raw_data",
    "search_results",
    "competitor_snapshot",
  ];

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<IPracticeRanking | undefined> {
    return super.findById(id, trx);
  }

  static async findByBatchId(
    batchId: string,
    trx?: QueryContext
  ): Promise<IPracticeRanking[]> {
    const rows = await this.table(trx).where({ batch_id: batchId });
    return rows.map((row: IPracticeRanking) =>
      this.deserializeJsonFields(row)
    );
  }

  static async create(
    data: Partial<IPracticeRanking>,
    trx?: QueryContext
  ): Promise<IPracticeRanking> {
    return super.create(
      data as Record<string, unknown>,
      trx
    );
  }

  static async updateById(
    id: number,
    data: Partial<IPracticeRanking>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  static async updateStatus(
    id: number,
    status: string,
    statusDetail?: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    const updateData: Record<string, unknown> = { status };
    if (statusDetail !== undefined) {
      updateData.status_detail = statusDetail;
    }
    return super.updateById(id, updateData, trx);
  }

  static async deleteById(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return super.deleteById(id, trx);
  }

  static async deleteByBatchId(
    batchId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ batch_id: batchId }).del();
  }

  static async listByOrganization(
    organizationId: number,
    filters: RankingFilters,
    pagination: PaginationParams,
    trx?: QueryContext
  ): Promise<PaginatedResult<IPracticeRanking>> {
    const buildQuery = (qb: Knex.QueryBuilder) => {
      qb = qb.where("organization_id", organizationId);
      if (filters.status) {
        qb = qb.where("status", filters.status);
      }
      if (filters.gbp_location_id) {
        qb = qb.where("gbp_location_id", filters.gbp_location_id);
      }
      if (filters.batch_id) {
        qb = qb.where("batch_id", filters.batch_id);
      }
      if (filters.location_id) {
        qb = qb.where("location_id", filters.location_id);
      }
      return qb.orderBy("created_at", "desc");
    };
    return this.paginate<IPracticeRanking>(buildQuery, pagination, trx);
  }

  static async findLatestByOrganizationAndLocation(
    organizationId: number,
    gbpLocationId: string,
    trx?: QueryContext
  ): Promise<IPracticeRanking | undefined> {
    const row = await this.table(trx)
      .where({
        organization_id: organizationId,
        gbp_location_id: gbpLocationId,
        status: "completed",
      })
      .orderBy("created_at", "desc")
      .first();
    return row
      ? this.deserializeJsonFields(row)
      : undefined;
  }

  static async findLatestBatchByOrganization(
    organizationId: number,
    trx?: QueryContext
  ): Promise<IPracticeRanking | undefined> {
    const row = await this.table(trx)
      .where({ organization_id: organizationId })
      .orderBy("created_at", "desc")
      .first();
    return row
      ? this.deserializeJsonFields(row)
      : undefined;
  }

  static async findRecentInFlightByLocation(
    organizationId: number,
    locationId: number,
    since: Date,
    trx?: QueryContext
  ): Promise<IPracticeRanking | undefined> {
    const row = await this.table(trx)
      .where({ organization_id: organizationId, location_id: locationId })
      .whereIn("status", ["pending", "processing"])
      .where("created_at", ">=", since)
      .orderBy("created_at", "desc")
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findLatestCompletedByOrganizationLocations(
    organizationId: number,
    trx?: QueryContext
  ): Promise<IPracticeRanking[]> {
    const rows = await this.table(trx)
      .where({
        organization_id: organizationId,
        status: "completed",
      })
      .orderBy("created_at", "desc");
    return rows.map((row: IPracticeRanking) =>
      this.deserializeJsonFields(row)
    );
  }

  static async findPreviousByOrganizationLocation(
    organizationId: number,
    gbpLocationId: string,
    beforeDate: Date,
    trx?: QueryContext
  ): Promise<IPracticeRanking[]> {
    const rows = await this.table(trx)
      .where({
        organization_id: organizationId,
        gbp_location_id: gbpLocationId,
        status: "completed",
      })
      .where("created_at", "<", beforeDate)
      .orderBy("created_at", "desc");
    return rows.map((row: IPracticeRanking) =>
      this.deserializeJsonFields(row)
    );
  }
}
