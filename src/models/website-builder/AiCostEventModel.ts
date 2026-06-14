import { BaseModel, QueryContext } from "../BaseModel";

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
}
