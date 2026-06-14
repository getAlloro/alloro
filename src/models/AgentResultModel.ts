import { Knex } from "knex";
import { BaseModel, PaginatedResult, PaginationParams, QueryContext } from "./BaseModel";

export interface IAgentResult {
  id: number;
  organization_id: number;
  location_id: number | null;
  agent_type: string;
  date_start: string | null;
  date_end: string | null;
  data: Record<string, unknown> | null;
  agent_input: Record<string, unknown> | null;
  agent_output: Record<string, unknown> | null;
  status: "success" | "pending" | "error" | "archived";
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AgentResultFilters {
  organization_id?: number;
  location_id?: number;
  agent_type?: string;
  status?: string;
  exclude_status?: string;
  date_from?: string;
  date_to?: string;
}

export class AgentResultModel extends BaseModel {
  protected static tableName = "agent_results";
  protected static jsonFields = ["data", "agent_input", "agent_output"];

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<IAgentResult | undefined> {
    return super.findById(id, trx);
  }

  static async create(
    data: Partial<IAgentResult>,
    trx?: QueryContext
  ): Promise<IAgentResult> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: number,
    data: Partial<IAgentResult>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  static async archive(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, { status: "archived" }, trx);
  }

  static async deleteById(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return super.deleteById(id, trx);
  }

  static async listAdmin(
    filters: AgentResultFilters,
    pagination: PaginationParams,
    trx?: QueryContext,
    columns?: string[]
  ): Promise<PaginatedResult<IAgentResult>> {
    const buildQuery = (qb: Knex.QueryBuilder) => {
      if (columns && columns.length > 0) {
        qb = qb.select(columns);
      }
      if (filters.organization_id) {
        qb = qb.where("organization_id", filters.organization_id);
      }
      if (filters.location_id) {
        qb = qb.where("location_id", filters.location_id);
      }
      if (filters.agent_type) {
        qb = qb.where("agent_type", filters.agent_type);
      }
      if (filters.status) {
        qb = qb.where("status", filters.status);
      }
      if (filters.exclude_status) {
        qb = qb.whereNot("status", filters.exclude_status);
      }
      if (filters.date_from) {
        qb = qb.where("created_at", ">=", filters.date_from);
      }
      if (filters.date_to) {
        qb = qb.where("created_at", "<=", filters.date_to);
      }
      return qb.orderBy("created_at", "desc");
    };
    return this.paginate<IAgentResult>(buildQuery, pagination, trx);
  }

  static async findByIdWithDetails(
    id: number,
    trx?: QueryContext
  ): Promise<IAgentResult | undefined> {
    const row = await this.table(trx).where("id", id).first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  /**
   * Find latest agent results for an organization, optionally filtered by location.
   * Returns the most recent result per agent_type.
   */
  static async findLatestByOrganization(
    organizationId: number,
    options?: {
      locationId?: number | null;
      accessibleLocationIds?: number[];
      excludeAgentTypes?: string[];
    },
    trx?: QueryContext
  ): Promise<IAgentResult[]> {
    let query = this.table(trx)
      .where("organization_id", organizationId)
      .whereNot("status", "archived");

    if (options?.locationId) {
      query = query.where("location_id", options.locationId);
    } else if (options?.accessibleLocationIds && options.accessibleLocationIds.length > 0) {
      query = query.where(function () {
        this.whereIn("location_id", options!.accessibleLocationIds!).orWhereNull("location_id");
      });
    }

    if (options?.excludeAgentTypes && options.excludeAgentTypes.length > 0) {
      query = query.whereNotIn("agent_type", options.excludeAgentTypes);
    }

    // Get latest per agent_type using a subquery
    const rows = await query
      .orderBy("created_at", "desc");

    // Deduplicate: keep only the latest per agent_type
    const seen = new Set<string>();
    const results: IAgentResult[] = [];
    for (const row of rows) {
      if (!seen.has(row.agent_type)) {
        seen.add(row.agent_type);
        results.push(this.deserializeJsonFields(row));
      }
    }
    return results;
  }

  /**
   * Find latest result for a specific agent type within an organization.
   */
  static async findLatestByOrganizationAndAgent(
    organizationId: number,
    agentType: string,
    locationId?: number | null,
    trx?: QueryContext
  ): Promise<IAgentResult | undefined> {
    let query = this.table(trx)
      .where({ organization_id: organizationId, agent_type: agentType })
      .whereNot("status", "archived")
      .orderBy("created_at", "desc");

    if (locationId) {
      query = query.where("location_id", locationId);
    }

    const row = await query.first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async unarchive(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, { status: "success" }, trx);
  }

  static async bulkArchive(
    ids: number[],
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .whereIn("id", ids)
      .whereNot("status", "archived")
      .update({
        status: "archived",
        updated_at: new Date(),
      });
  }

  static async bulkUnarchive(
    ids: number[],
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .whereIn("id", ids)
      .where("status", "archived")
      .update({
        status: "success",
        updated_at: new Date(),
      });
  }

  static async bulkDelete(
    ids: number[],
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).whereIn("id", ids).del();
  }

  static async getStatsByStatus(
    trx?: QueryContext
  ): Promise<Record<string, number>> {
    const rows = await this.table(trx)
      .select("status")
      .count("* as count")
      .groupBy("status");

    const result: Record<string, number> = {};
    rows.forEach((row: any) => {
      result[row.status] = parseInt(row.count, 10);
    });
    return result;
  }

  static async getStatsByAgentType(
    excludeArchived = true,
    trx?: QueryContext
  ): Promise<Record<string, number>> {
    let query = this.table(trx)
      .select("agent_type")
      .count("* as count")
      .groupBy("agent_type");

    if (excludeArchived) {
      query = query.whereNot("status", "archived");
    }

    const rows = await query;
    const result: Record<string, number> = {};
    rows.forEach((row: any) => {
      result[row.agent_type] = parseInt(row.count, 10);
    });
    return result;
  }

  static async getRecentCount(
    days: number,
    excludeArchived = true,
    trx?: QueryContext
  ): Promise<number> {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);

    let query = this.table(trx)
      .where("created_at", ">=", dateThreshold)
      .count("* as count");

    if (excludeArchived) {
      query = query.whereNot("status", "archived");
    }

    const result = await query.first();
    return parseInt((result as any)?.count || "0", 10);
  }

  static async listAgentTypes(trx?: QueryContext): Promise<string[]> {
    const rows = await this.table(trx)
      .distinct("agent_type")
      .whereNotNull("agent_type")
      .orderBy("agent_type", "asc");
    return rows.map((row: { agent_type: string }) => row.agent_type);
  }

  /**
   * Find an existing agent_results row matching an exact set of equality
   * conditions and a status whitelist. Mirrors the inline duplicate-check
   * pattern used before running daily/monthly/optimizer agents:
   *   .where({ organization_id, agent_type, date_start, date_end })
   *   .whereIn("status", [...]).first()
   * Returns the raw row (untyped) to match the original `.first()` consumption.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findExistingByConditions(
    conditions: Record<string, unknown>,
    statuses: string[],
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx).where(conditions).whereIn("status", statuses).first();
  }

  /**
   * Find an existing system-level guardian result (organization_id IS NULL)
   * for a given date range and status whitelist. Mirrors the inline
   * guardian/governance duplicate check in the governance validator.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findExistingSystemResult(
    conditions: Record<string, unknown>,
    statuses: string[],
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where(conditions)
      .whereNull("organization_id")
      .whereIn("status", statuses)
      .first();
  }

  /**
   * Fetch all successful agent results within a created_at window, excluding
   * a set of agent types, ordered by agent_type then created_at. Used by the
   * governance validator to gather the month's results for guardian review.
   * Returns raw rows (select *) to preserve the original consumption.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findSuccessfulInWindowExcludingTypes(
    createdAtStart: Date,
    createdAtEnd: Date,
    excludeAgentTypes: string[],
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .whereBetween("created_at", [createdAtStart, createdAtEnd])
      .where("status", "success")
      .whereNotIn("agent_type", excludeAgentTypes)
      .orderBy("agent_type")
      .orderBy("created_at")
      .select("*");
  }

  /**
   * Insert an agent_results row verbatim and return its id. The caller
   * supplies the full payload (including created_at/updated_at and any
   * optional run_id), matching the original inline
   * db("agent_results").insert(...).returning("id") calls. Trx-aware so it
   * can participate in a caller-owned transaction.
   */
  static async insertReturningId(
    data: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    const [row] = await this.table(trx).insert(data).returning("id");
    return typeof row === "object" ? row.id : row;
  }

  /**
   * Insert an agent_results row verbatim (no return value). Used for the
   * error-result path which discards the inserted id.
   */
  static async insertRaw(
    data: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<void> {
    await this.table(trx).insert(data);
  }

  /**
   * Fetch the date_start/date_end for the first of a set of agent result ids.
   * Mirrors the inline date-range lookup in pms-retry.cleanupMonthlyRunData
   * (used to scope google_data_store cleanup). Returns the raw first row.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findDateRangeByIds(
    ids: number[],
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .whereIn("id", ids)
      .select("date_start", "date_end")
      .first();
  }

  /**
   * Fallback lookup for a monthly-agents run's results when no result ids were
   * recorded in the job summary: matches org (+ optional location), the
   * monthly agent_type whitelist, and a created_at window. Mirrors the inline
   * fallback query in pms-retry.cleanupMonthlyRunData. Returns raw rows
   * (id, date_start, date_end).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findForMonthlyCleanupFallback(
    organizationId: number,
    locationId: number | null | undefined,
    agentTypes: string[],
    createdAtStart: string,
    createdAtEnd: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where({ organization_id: organizationId })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .where((qb: any) => {
        if (locationId) qb.where({ location_id: locationId });
      })
      .whereIn("agent_type", agentTypes)
      .whereBetween("created_at", [createdAtStart, createdAtEnd])
      .select("id", "date_start", "date_end");
  }

  /**
   * Delete agent results by id set. Mirrors the inline delete in
   * pms-retry.cleanupMonthlyRunData's transaction. Trx-aware.
   */
  static async deleteByIds(
    ids: number[],
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).whereIn("id", ids).del();
  }

  /**
   * Delete agent results by agent type array and date range.
   * Used by the clear-month-data endpoint to remove guardian and
   * governance_sentinel results for a specific month.
   */
  static async deleteByAgentTypesAndDateRange(
    agentTypes: string[],
    startDate: string,
    endDateTime: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .whereIn("agent_type", agentTypes)
      .where("created_at", ">=", startDate)
      .where("created_at", "<=", endDateTime)
      .del();
  }
}
