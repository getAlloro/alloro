import { Knex } from "knex";
import { db } from "../database/connection";
import { BaseModel, PaginatedResult, PaginationParams, QueryContext } from "./BaseModel";

export interface IAgentRecommendation {
  id: number;
  agent_result_id: number;
  source_agent_type: string;
  agent_under_test: string;
  title: string;
  explanation: string | null;
  type: string | null;
  category: string | null;
  urgency: string | null;
  severity: string | null;
  verdict: "PASS" | "FAIL";
  confidence: number | null;
  status: "PASS" | "REJECT" | "PENDING";
  evidence_links: string[] | null;
  rule_reference: string | null;
  suggested_action: string | null;
  escalation_required: boolean;
  observed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface AgentSummary {
  agent_under_test: string;
  total_recommendations: number;
  pass_count: number;
  fail_count: number;
  avg_confidence: number;
}

export interface AgentSummaryWithCounts extends AgentSummary {
  fixed_count: number;
}

export interface RecommendationFilters {
  source?: string;
  status?: string;
  month?: string;
}

export interface StatusUpdatePayload {
  status: string | null;
  completed_at: Date | null;
  updated_at: Date;
}

export interface AgentDetailFilters {
  verdict?: string;
  status?: string;
  category?: string;
  source_agent_type?: string;
}

export class AgentRecommendationModel extends BaseModel {
  protected static tableName = "agent_recommendations";
  protected static jsonFields = ["evidence_links"];

  static async bulkInsert(
    recommendations: Partial<IAgentRecommendation>[],
    trx?: QueryContext
  ): Promise<void> {
    const serialized = recommendations.map((rec) =>
      this.serializeJsonFields({
        ...rec,
        created_at: new Date(),
        updated_at: new Date(),
      })
    );
    await this.table(trx).insert(serialized);
  }

  /**
   * Bulk-insert pre-built recommendation rows verbatim. The recommendation
   * parser constructs each row with its own created_at/updated_at/observed_at
   * timestamps and an already-stringified evidence_links field, so this insert
   * is a passthrough (no timestamp injection, no JSON re-serialization) to
   * preserve the original inline db("agent_recommendations").insert(rows) call.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async bulkInsertRaw(
    recommendations: Record<string, unknown>[],
    trx?: QueryContext
  ): Promise<void> {
    await this.table(trx).insert(recommendations);
  }

  /**
   * Fetch historical recommendations for an agent filtered by status,
   * projecting the context columns the guardian/governance payload builder
   * needs, ordered newest-first and capped. Mirrors the inline historical
   * PASS/REJECT context queries in the governance validator.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findHistoricalByAgentAndStatus(
    agentUnderTest: string,
    status: string,
    limit: number,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where("agent_under_test", agentUnderTest)
      .where("status", status)
      .select(
        "id",
        "title",
        "explanation",
        "verdict",
        "confidence",
        "created_at"
      )
      .orderBy("created_at", "desc")
      .limit(limit);
  }

  static async findByAgentResultId(
    agentResultId: number,
    trx?: QueryContext
  ): Promise<IAgentRecommendation[]> {
    const rows = await this.table(trx)
      .where({ agent_result_id: agentResultId });
    return rows.map((row: IAgentRecommendation) =>
      this.deserializeJsonFields(row)
    );
  }

  static async updateStatus(
    id: number,
    status: string,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, { status }, trx);
  }

  static async deleteByIds(
    ids: number[],
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).whereIn("id", ids).del();
  }

  static async deleteByAgentResultId(
    agentResultId: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ agent_result_id: agentResultId })
      .del();
  }

  static async getSummaryByAgent(
    startDate: string,
    endDate: string,
    pagination: PaginationParams,
    trx?: QueryContext
  ): Promise<PaginatedResult<AgentSummary>> {
    const { limit = 50, offset = 0 } = pagination;

    const baseQuery = (trx || db)("agent_recommendations")
      .where("created_at", ">=", startDate)
      .where("created_at", "<=", endDate);

    const countResult = await baseQuery
      .clone()
      .countDistinct("agent_under_test as count")
      .first();
    const total = parseInt(countResult?.count as string, 10) || 0;

    const data = await baseQuery
      .clone()
      .select("agent_under_test")
      .count("* as total_recommendations")
      .select(
        (trx || db).raw(
          "SUM(CASE WHEN verdict = 'PASS' THEN 1 ELSE 0 END) as pass_count"
        )
      )
      .select(
        (trx || db).raw(
          "SUM(CASE WHEN verdict = 'FAIL' THEN 1 ELSE 0 END) as fail_count"
        )
      )
      .select(
        (trx || db).raw("AVG(confidence) as avg_confidence")
      )
      .groupBy("agent_under_test")
      .orderBy("total_recommendations", "desc")
      .limit(limit)
      .offset(offset);

    return { data: data as unknown as AgentSummary[], total };
  }

  static async getDetailsByAgent(
    agentUnderTest: string,
    startDate: string,
    endDate: string,
    filters: AgentDetailFilters,
    pagination: PaginationParams,
    trx?: QueryContext
  ): Promise<PaginatedResult<IAgentRecommendation>> {
    const buildQuery = (qb: Knex.QueryBuilder) => {
      qb = qb
        .where("agent_under_test", agentUnderTest)
        .where("created_at", ">=", startDate)
        .where("created_at", "<=", endDate);

      if (filters.verdict) {
        qb = qb.where("verdict", filters.verdict);
      }
      if (filters.status) {
        qb = qb.where("status", filters.status);
      }
      if (filters.category) {
        qb = qb.where("category", filters.category);
      }
      if (filters.source_agent_type) {
        qb = qb.where("source_agent_type", filters.source_agent_type);
      }
      return qb.orderBy("created_at", "desc");
    };
    return this.paginate<IAgentRecommendation>(buildQuery, pagination, trx);
  }

  // =====================================================================
  // Admin Agent Insights Methods
  // =====================================================================

  /**
   * Get summary with counts including fixed_count (status = 'PASS').
   * Returns ALL agent types (no SQL-level pagination) — pagination
   * is applied in-memory by the caller to preserve original behavior.
   */
  static async getSummaryWithCounts(
    startDate: string,
    endDateTime: string,
    trx?: QueryContext
  ): Promise<AgentSummaryWithCounts[]> {
    const data = await (trx || db)("agent_recommendations")
      .select("agent_under_test")
      .count("* as total_recommendations")
      .select(
        (trx || db).raw(
          "SUM(CASE WHEN verdict = 'PASS' THEN 1 ELSE 0 END) as pass_count"
        )
      )
      .select(
        (trx || db).raw(
          "SUM(CASE WHEN verdict = 'FAIL' THEN 1 ELSE 0 END) as fail_count"
        )
      )
      .select(
        (trx || db).raw(
          "SUM(CASE WHEN status = 'PASS' THEN 1 ELSE 0 END) as fixed_count"
        )
      )
      .avg("confidence as avg_confidence")
      .where("created_at", ">=", startDate)
      .where("created_at", "<=", endDateTime)
      .whereNotNull("agent_under_test")
      .groupBy("agent_under_test")
      .orderBy("agent_under_test");

    return data as unknown as AgentSummaryWithCounts[];
  }

  /**
   * Find recommendations for an agent with optional filters and pagination.
   * Builds the query dynamically based on provided filters.
   */
  static async findByAgentWithFilters(
    agentType: string,
    dateRange: { startDate: string; endDateTime: string } | null,
    filters: RecommendationFilters,
    pagination: { limit: number; offset: number },
    trx?: QueryContext
  ): Promise<{ data: any[]; total: number }> {
    let query = this.table(trx).where("agent_under_test", agentType);

    if (dateRange) {
      query = query
        .where("created_at", ">=", dateRange.startDate)
        .where("created_at", "<=", dateRange.endDateTime);
    }

    if (filters.source && filters.source !== "all") {
      query = query.where("source_agent_type", filters.source);
    }

    if (filters.status && filters.status !== "all") {
      query = query.where("status", filters.status);
    }

    // Get total count
    const countQuery = query.clone();
    const [{ count }] = await countQuery.count("* as count");
    const total = parseInt(String(count), 10);

    // Get paginated results
    const data = await query
      .orderBy("created_at", "desc")
      .limit(pagination.limit)
      .offset(pagination.offset)
      .select("*");

    return { data, total };
  }

  /**
   * Update a recommendation with status logic payload
   * (status, completed_at, updated_at).
   */
  static async updateWithStatusLogic(
    id: number,
    payload: StatusUpdatePayload,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where("id", id).update(payload);
  }

  /**
   * Mark all REJECT recommendations for an agent as PASS.
   * Optionally filter by source_agent_type.
   */
  static async markAllAsPassForAgent(
    agentType: string,
    sourceFilter?: string,
    trx?: QueryContext
  ): Promise<number> {
    let query = this.table(trx)
      .where("agent_under_test", agentType)
      .where("status", "REJECT");

    if (sourceFilter && sourceFilter !== "all") {
      query = query.where("source_agent_type", sourceFilter);
    }

    return query.update({
      status: "PASS",
      completed_at: new Date(),
      updated_at: new Date(),
    });
  }

  /**
   * Delete all recommendations within a date range.
   */
  static async deleteByDateRange(
    startDate: string,
    endDateTime: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where("created_at", ">=", startDate)
      .where("created_at", "<=", endDateTime)
      .del();
  }

  /**
   * Find recommendation IDs for an agent filtered by status.
   * Returns only the id column for efficiency.
   */
  static async findIdsByAgentAndStatus(
    agentType: string,
    status: "PASS" | "REJECT",
    trx?: QueryContext
  ): Promise<number[]> {
    const rows = await this.table(trx)
      .where("agent_under_test", agentType)
      .where("status", status)
      .select("id");

    return rows.map((r: { id: number }) => r.id);
  }

  /**
   * Find recommendations by an array of IDs with optional column selection.
   * Defaults to id, title, explanation, status.
   */
  static async findByIds(
    ids: number[],
    columns?: string[],
    trx?: QueryContext
  ): Promise<any[]> {
    if (ids.length === 0) return [];

    const selectCols = columns || ["id", "title", "explanation", "status"];
    return this.table(trx).whereIn("id", ids).select(...selectCols);
  }
}
