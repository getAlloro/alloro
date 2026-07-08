import { Knex } from "knex";
import { db } from "../database/connection";
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

/**
 * A location that has tracked ranking keywords, with the geo context needed to
 * build a DataForSEO market-demand query. Projected from the latest completed
 * ranking row per location (see findLocationsWithKeywords).
 */
export interface RankingKeywordLocation {
  organization_id: number;
  location_id: number;
  rank_keywords: string;
  search_city: string | null;
  search_state: string | null;
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

  // ===================================================================
  // Raw-passthrough write helpers
  //
  // These preserve the exact write semantics that previously lived
  // inline in the practice-ranking controller/feature-services: callers
  // build the full column payload (including pre-stringified JSON and,
  // where relevant, deliberately omitting `updated_at`), and the row is
  // written verbatim. They intentionally do NOT route through BaseModel's
  // serialize/`updated_at` injection so behavior is byte-identical to the
  // original inline queries.
  // ===================================================================

  /** Insert a ranking row with a fully-formed payload, returning its id. */
  static async insertReturningId(
    data: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    const [row] = await this.table(trx).insert(data).returning("id");
    return typeof row === "object" ? row.id : row;
  }

  /** Update a single ranking by id with a verbatim payload. */
  static async updateByIdRaw(
    id: number,
    data: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).update(data);
  }

  /** Update every ranking in a batch with a verbatim payload. */
  static async updateByBatchId(
    batchId: string,
    data: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ batch_id: batchId }).update(data);
  }

  /** Update a set of rankings (by id) with a verbatim payload. */
  static async updateManyByIds(
    ids: number[],
    data: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).whereIn("id", ids).update(data);
  }

  // ===================================================================
  // Exact-query read helpers (raw passthrough, no JSON deserialization —
  // callers parse JSONB fields themselves via parseJsonField/formatters).
  // ===================================================================

  /**
   * Full row by numeric id, returned as a raw row (untyped) to match the
   * controller's original `db(...).first()` consumption — these rows flow
   * into formatters and pipeline calls that were written against the raw
   * Knex result, so we preserve that loose shape rather than impose a
   * stricter type at the call sites.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findRawById(id: number, trx?: QueryContext): Promise<any> {
    return this.table(trx).where({ id }).first();
  }

  /** location_id-only projection for a ranking row. */
  static async findLocationIdById(
    id: number,
    trx?: QueryContext
  ): Promise<{ location_id: number | null } | undefined> {
    return this.table(trx).where({ id }).select("location_id").first();
  }

  /** Batch-status projection for a batch, ordered oldest-first. Raw rows. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findBatchStatusRows(batchId: string, trx?: QueryContext): Promise<any[]> {
    return this.table(trx)
      .where({ batch_id: batchId })
      .select(
        "id",
        "gbp_location_id",
        "gbp_location_name",
        "status",
        "status_detail",
        "rank_score",
        "rank_position",
        "error_message",
        "created_at",
        "updated_at"
      )
      .orderBy("created_at", "asc");
  }

  /** Minimal (id, status) projection for an entire batch. */
  static async findIdStatusByBatchId(
    batchId: string,
    trx?: QueryContext
  ): Promise<Array<{ id: number; status: string }>> {
    return this.table(trx).where({ batch_id: batchId }).select("id", "status");
  }

  /**
   * All rows for a batch (no projection), returned as raw rows (untyped) to
   * match the controller's original consumption — these rows are passed into
   * pipeline calls written against the raw Knex result.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findAllByBatchId(batchId: string, trx?: QueryContext): Promise<any[]> {
    return this.table(trx).where({ batch_id: batchId });
  }

  /**
   * Admin list view: rankings joined to organizations + locations for
   * display names, paginated by limit/offset, optionally scoped by
   * organization and/or location.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async listWithOrgAndLocation(
    filters: { organizationId?: number; locationId?: number },
    pagination: { limit: number; offset: number },
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = (trx || db)("practice_rankings as pr")
      .leftJoin("organizations as o", "pr.organization_id", "o.id")
      .leftJoin("locations as l", "pr.location_id", "l.id")
      .select(
        "pr.id",
        "pr.organization_id",
        "pr.location_id",
        "o.name as organization_name",
        "l.name as location_name",
        "pr.specialty",
        "pr.location",
        "pr.rank_keywords",
        "pr.gbp_location_id",
        "pr.gbp_location_name",
        "pr.batch_id",
        "pr.status",
        "pr.rank_score",
        "pr.rank_position",
        "pr.total_competitors",
        "pr.search_city",
        "pr.search_state",
        "pr.search_county",
        "pr.search_postal_code",
        "pr.created_at",
        "pr.updated_at"
      )
      .orderBy("pr.created_at", "desc")
      .limit(pagination.limit)
      .offset(pagination.offset);

    if (filters.organizationId) {
      query = query.where({ "pr.organization_id": filters.organizationId });
    }
    if (filters.locationId) {
      query = query.where({ "pr.location_id": filters.locationId });
    }

    return query;
  }

  /**
   * Latest batch_id for a set of base filters (org/status[/location]),
   * restricted to rows that carry a batch_id. Returns the projected
   * `batch_id` only.
   */
  static async findLatestBatchIdRow(
    baseFilters: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<{ batch_id: string | null } | undefined> {
    return this.table(trx)
      .where(baseFilters)
      .whereNotNull("batch_id")
      .orderBy("created_at", "desc")
      .first()
      .select("batch_id");
  }

  /** Latest legacy (no batch_id) row for a set of base filters. Raw row. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findLegacyLatestByFilters(
    baseFilters: Record<string, unknown>,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return this.table(trx)
      .where(baseFilters)
      .whereNull("batch_id")
      .orderBy("created_at", "desc")
      .first();
  }

  /** All rows for a set of base filters + a specific batch, oldest-first. Raw rows. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByFiltersAndBatch(
    baseFilters: Record<string, unknown>,
    batchId: string,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> {
    return this.table(trx)
      .where({ ...baseFilters, batch_id: batchId })
      .orderBy("created_at", "asc");
  }

  /**
   * Previous completed ranking for an org+location, excluding a given batch.
   * Used for trend comparison on the latest-rankings dashboard. Raw row.
   */
  static async findPreviousCompletedExcludingBatch(
    organizationId: number,
    gbpLocationId: string | null,
    excludeBatchId: string,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return this.table(trx)
      .where({
        organization_id: organizationId,
        gbp_location_id: gbpLocationId,
        status: "completed",
      })
      .whereNot({ batch_id: excludeBatchId })
      .orderBy("created_at", "desc")
      .first();
  }

  /**
   * Completed-ranking history within an interval literal (e.g. "3 months"),
   * ordered by observed_at ascending, optionally scoped to a location.
   * The interval is emitted via whereRaw exactly as before (caller controls
   * the validated literal).
   */
  static async findHistoryWithinInterval(
    organizationId: number,
    intervalLiteral: string,
    locationId: number | null,
    trx?: QueryContext
  ): Promise<IPracticeRanking[]> {
    let query = this.table(trx)
      .where({
        organization_id: organizationId,
        status: "completed",
      })
      .andWhereRaw(`observed_at >= NOW() - INTERVAL '${intervalLiteral}'`)
      .orderBy("observed_at", "asc")
      .select(
        "observed_at",
        "rank_score",
        "rank_position",
        "search_position",
        "ranking_factors"
      );

    if (locationId !== null) {
      query = query.andWhere({ location_id: locationId });
    }

    return query;
  }

  /**
   * Latest completed ranking for an org (optional location), projected to the
   * dashboard ranking columns. Mirrors the inline query in
   * utils/dashboard-metrics/service.dashboard-metrics.buildRankingMetrics
   * verbatim. Returns the raw row (or undefined).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findLatestCompletedRankingMetrics(
    organizationId: number,
    locationId: number | null,
    trx?: QueryContext
  ): Promise<any> {
    let query = this.table(trx).where({
      organization_id: organizationId,
      status: "completed",
    });
    if (locationId !== null) {
      query = query.where({ location_id: locationId });
    }
    return query
      .orderBy("created_at", "desc")
      .select(
        "rank_position",
        "search_position",
        "rank_score",
        "total_competitors",
        "ranking_factors"
      )
      .first();
  }

  /** Latest completed ranking for an org + GBP location. Raw row. */
  static async findLatestCompletedByOrgAndGbpLocation(
    organizationId: number,
    gbpLocationId: string,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return this.table(trx)
      .where({
        organization_id: organizationId,
        gbp_location_id: gbpLocationId,
        status: "completed",
      })
      .orderBy("created_at", "desc")
      .first();
  }

  /**
   * Most-recent in-flight (pending/processing) ranking for an org, optionally
   * scoped to a location. Projected for the in-flight progress banner.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findInFlightStatusRow(
    filters: Record<string, unknown>,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return this.table(trx)
      .where(filters)
      .whereIn("status", ["pending", "processing"])
      .orderBy("created_at", "desc")
      .select(
        "id",
        "batch_id",
        "status",
        "status_detail",
        "gbp_location_name",
        "created_at",
        "updated_at"
      )
      .first();
  }

  /**
   * Recent rows for a location (excluding one ranking id) observed on/after a
   * cutoff, projected to (observed_at, raw_data), newest-first, capped at 20.
   * Powers the selected-competitor velocity cache in the ranking pipeline.
   */
  static async findRecentRawDataByLocation(
    locationId: number,
    excludeRankingId: number,
    minObservedAt: Date,
    trx?: QueryContext
  ): Promise<Array<{ observed_at: Date; raw_data: unknown }>> {
    return this.table(trx)
      .where("location_id", locationId)
      .whereNot("id", excludeRankingId)
      .where("observed_at", ">=", minObservedAt)
      .orderBy("observed_at", "desc")
      .select("observed_at", "raw_data")
      .limit(20);
  }

  /**
   * Ranking-run context joined to its location: discovery radii (ranking +
   * location level) and the location's organization_id.
   */
  static async findRankingRunContext(
    rankingId: number,
    trx?: QueryContext
  ): Promise<
    | {
        location_id: number | null;
        ranking_discovery_radius: number | null;
        organization_id: number | null;
        location_discovery_radius: number | null;
      }
    | undefined
  > {
    return (trx || db)("practice_rankings as pr")
      .leftJoin("locations as l", "l.id", "pr.location_id")
      .where("pr.id", rankingId)
      .select(
        "pr.location_id",
        "pr.competitor_discovery_radius_meters as ranking_discovery_radius",
        "l.organization_id",
        "l.competitor_discovery_radius_meters as location_discovery_radius"
      )
      .first();
  }

  /**
   * Latest valid client-place resolution source row for a location: most
   * recent search_status='ok' row that carries search_results, projected to
   * (search_results, search_lat, search_lng).
   */
  static async findLatestResolvedSearchResultsByLocation(
    locationId: number,
    trx?: QueryContext
  ): Promise<
    | {
        search_results: unknown;
        search_lat: number | null;
        search_lng: number | null;
      }
    | undefined
  > {
    return this.table(trx)
      .where({ location_id: locationId })
      .where("search_status", "ok")
      .whereNotNull("search_results")
      .orderBy("created_at", "desc")
      .select("search_results", "search_lat", "search_lng")
      .first();
  }

  /**
   * Most recent (specialty, location) pair for a location where both are set.
   * Used to reuse prior identification during onboarding finalize.
   */
  static async findLatestSpecialtyAndLocation(
    locationId: number,
    trx?: QueryContext
  ): Promise<{ specialty: string | null; location: string | null } | undefined> {
    return this.table(trx)
      .where({ location_id: locationId })
      .whereNotNull("specialty")
      .whereNotNull("location")
      .orderBy("created_at", "desc")
      .select("specialty", "location")
      .first();
  }

  /**
   * llm_analysis from the latest completed, summary-eligible ranking for an
   * org and optional location, newest-first. Used by the agents Summary v2
   * input builder to pull ranking recommendations. Mirrors the inline
   * fetchLatestRankingRecommendations query
   * (where organization_id + status='completed' +
   * include_in_summary_recommendations=true, optional location_id,
   * orderBy created_at desc, select llm_analysis, first). Returned raw — the
   * caller parses the jsonb llm_analysis field itself.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findLatestLlmAnalysisForSummary(
    organizationId: number,
    locationId: number | null,
    trx?: QueryContext
  ): Promise<any> {
    let query = this.table(trx).where({
      organization_id: organizationId,
      status: "completed",
      include_in_summary_recommendations: true,
    });
    if (locationId !== null) {
      query = query.where({ location_id: locationId });
    }
    return query.orderBy("created_at", "desc").select("llm_analysis").first();
  }

  /**
   * Distinct locations that have tracked ranking keywords, each projected to the
   * geo + keyword context the search-volume harvest needs (its latest completed
   * ranking row per location). Used by the monthly DataForSEO search-volume job
   * to iterate the fleet. One row per location_id, newest-first via DISTINCT ON.
   *
   * Only completed rows with a non-empty `rank_keywords` and a real `location_id`
   * are considered — those are the locations we can build a market-demand query
   * for. The harvest service owns ALL DB access through this method (§7.4): the
   * worker/service never runs an inline db() query of its own.
   */
  static async findLocationsWithKeywords(
    trx?: QueryContext
  ): Promise<RankingKeywordLocation[]> {
    const rows = await this.table(trx)
      .distinctOn("location_id")
      .whereNotNull("location_id")
      .whereNotNull("rank_keywords")
      .whereRaw("btrim(rank_keywords) <> ''")
      .where("status", "completed")
      .orderBy("location_id")
      .orderBy("created_at", "desc")
      .select(
        "organization_id",
        "location_id",
        "rank_keywords",
        "search_city",
        "search_state"
      );
    return rows.map((row: RankingKeywordLocation) => ({
      organization_id: row.organization_id,
      location_id: row.location_id,
      rank_keywords: row.rank_keywords,
      search_city: row.search_city,
      search_state: row.search_state,
    }));
  }
}
