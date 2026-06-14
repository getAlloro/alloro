import { BaseModel, QueryContext } from "./BaseModel";

export class PmAiSynthBatchTaskModel extends BaseModel {
  protected static tableName = "pm_ai_synth_batch_tasks";
  protected static jsonFields: string[] = [];

  static async create(data: Record<string, unknown>, trx?: QueryContext): Promise<any> {
    const [result] = await this.table(trx).insert(data).returning("*");
    return result;
  }

  // GET /api/pm/ai-synth/batches/:batchId — proposed tasks in creation order.
  static async listByBatch(
    batchId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where({ batch_id: batchId })
      .orderBy("created_at", "asc");
  }

  // Patch arbitrary fields on a batch task (status, created_task_id, target).
  static async updateFields(
    taskId: string,
    fields: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id: taskId }).update(fields);
  }

  // Count of still-pending tasks in a batch (drives batch auto-completion).
  static async countPending(
    batchId: string,
    trx?: QueryContext
  ): Promise<number> {
    const [result] = await this.table(trx)
      .where({ batch_id: batchId, status: "pending" })
      .count("* as count");
    return parseInt(result.count as string, 10) || 0;
  }
}
