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

  static async deleteByAgentResultId(
    agentResultId: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ agent_result_id: agentResultId })
      .del();
  }

  /**
   * Delete every recommendation whose parent agent_result belongs to an org
   * with the given agent type. Raw subquery preserved verbatim from the admin
   * reset service (no FK cascade — recommendations go before results). Returns
   * the raw driver result so the caller reads `.rowCount` exactly as before.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async deleteByOrganizationAndAgentType(
    organizationId: number,
    agentType: string,
    trx?: QueryContext
  ): Promise<any> {
    return (trx || db).raw(
      `DELETE FROM agent_recommendations
         WHERE agent_result_id IN (
           SELECT id FROM agent_results
           WHERE organization_id = ? AND agent_type = ?
         )`,
      [organizationId, agentType]
    );
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

}
