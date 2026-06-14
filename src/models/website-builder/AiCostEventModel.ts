import { BaseModel, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";

/**
 * Owns the `website_builder.ai_cost_events` table (one row per LLM request).
 * The insert mirrors services/ai-cost/service.ai-cost.logAiCostEvent verbatim:
 * the caller passes a fully-formed row (including a pre-stringified `metadata`
 * payload) and the persisted row is returned via `.returning("*")` (raw
 * passthrough).
 */
export class AiCostEventModel extends BaseModel {
  protected static tableName = "website_builder.ai_cost_events";

  /** Insert a cost-event row verbatim, returning the persisted row. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async insertReturning(
    row: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<any> {
    const [persisted] = await this.table(trx).insert(row).returning("*");
    return persisted;
  }

  /**
   * Most-recent cost events for a project, newest first, capped to `limit`
   * (full raw rows). Mirrors the inline events query in
   * AdminWebsitesController.getProjectCosts verbatim.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findRecentByProjectId(
    projectId: string,
    limit: number,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where("project_id", projectId)
      .orderBy("created_at", "desc")
      .limit(limit);
  }

  /**
   * Aggregated cost/token totals across a project's whole cost history. Mirrors
   * the inline SUM/COUNT aggregation in
   * AdminWebsitesController.getProjectCosts verbatim (same raw cast expressions
   * and aliases). Returns the single totals row (or undefined).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async getTotalsByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where("project_id", projectId)
      .select(
        db.raw("COALESCE(SUM(estimated_cost_usd), 0)::float AS total_cost_usd"),
        db.raw("COALESCE(SUM(input_tokens), 0)::int AS total_input"),
        db.raw("COALESCE(SUM(output_tokens), 0)::int AS total_output"),
        db.raw(
          "COALESCE(SUM(cache_creation_tokens), 0)::int AS total_cache_creation",
        ),
        db.raw("COALESCE(SUM(cache_read_tokens), 0)::int AS total_cache_read"),
        db.raw("COUNT(*)::int AS total_events"),
      )
      .first();
  }
}
