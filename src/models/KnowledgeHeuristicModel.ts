import { db } from "../database/connection";
import { BaseModel, QueryContext } from "./BaseModel";

export interface IKnowledgeHeuristic {
  insight: string;
  actionable: unknown;
  sample_size: number;
}

/**
 * Owns the `knowledge_heuristics` table (collective-intelligence patterns
 * mined across all Alloro accounts). The table has no migration owner, so the
 * `hasTable` guard the original service performed inline is encapsulated here
 * (mirrors CompetitorCacheModel.ensureTable). Methods mirror the inline query
 * in services/ozMoment.ts verbatim.
 */
export class KnowledgeHeuristicModel extends BaseModel {
  protected static tableName = "knowledge_heuristics";

  /**
   * Top collective-intelligence heuristics (confidence >= 0.5), highest
   * confidence first, capped at 3, projected to (insight, actionable,
   * sample_size). Returns [] when the table does not exist — preserving the
   * inline `hasTable` short-circuit in ozMoment.generateOzMoments.
   */
  static async findTopCollectiveIntelligence(
    trx?: QueryContext
  ): Promise<IKnowledgeHeuristic[]> {
    const hasTable = await db.schema.hasTable("knowledge_heuristics");
    if (!hasTable) return [];

    return this.table(trx)
      .where("source", "collective_intelligence")
      .where("confidence", ">=", 0.5)
      .orderBy("confidence", "desc")
      .limit(3)
      .select("insight", "actionable", "sample_size");
  }
}
