import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

export class PmAiSynthBatchModel extends BaseModel {
  protected static tableName = "pm_ai_synth_batches";
  protected static jsonFields: string[] = [];

  static async create(data: Record<string, unknown>, trx?: QueryContext): Promise<any> {
    const [result] = await this.table(trx).insert(data).returning("*");
    return result;
  }

  // Count + page of batches for a project (GET /api/pm/ai-synth/batches).
  static async countByProject(
    projectId: string,
    trx?: QueryContext
  ): Promise<number> {
    const [countResult] = await this.table(trx)
      .where({ project_id: projectId })
      .count("* as count");
    return parseInt(countResult.count as string, 10) || 0;
  }

  static async listByProject(
    projectId: string,
    limit: number,
    offset: number,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where({ project_id: projectId })
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset);
  }

  // Count + page of cross-project batches (project_id IS NULL).
  static async countCrossProject(trx?: QueryContext): Promise<number> {
    const [countResult] = await this.table(trx)
      .whereNull("project_id")
      .count("* as count");
    return parseInt(countResult.count as string, 10) || 0;
  }

  static async listCrossProject(
    limit: number,
    offset: number,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .whereNull("project_id")
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset);
  }

  // Patch arbitrary fields on a batch by id (status, totals).
  static async updateFields(
    batchId: string,
    fields: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id: batchId }).update(fields);
  }

  // Increment a counter column on a batch (total_approved / total_rejected).
  static async incrementCounter(
    batchId: string,
    column: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id: batchId }).increment(column, 1);
  }

  // Best-effort cleanup of orphaned "synthesizing" batches for a user created
  // in the last 5 minutes — mark them failed after an extraction error.
  static async markRecentSynthesizingFailed(
    userId: number | undefined,
    trx?: QueryContext
  ): Promise<number> {
    const ctx = trx || db;
    return this.table(trx)
      .where({ status: "synthesizing", created_by: userId })
      .where("created_at", ">", ctx.raw("NOW() - INTERVAL '5 minutes'"))
      .update({ status: "failed" });
  }
}
