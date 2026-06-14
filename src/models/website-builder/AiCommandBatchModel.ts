import { BaseModel, QueryContext } from "../BaseModel";
import { db } from "../../database/connection";

/**
 * Owns the `website_builder.ai_command_batches` table. Mirrors the inline
 * queries previously held in
 * controllers/admin-websites/feature-services/service.ai-command verbatim
 * (same columns, filters, ordering, and `db.fn.now()` timestamp sources). The
 * AI command pipeline reads arbitrary batch columns off the raw row (prompt,
 * targets, status, project_id, summary), so the read methods return the raw
 * row rather than a typed projection — preserving original consumption.
 */
export class AiCommandBatchModel extends BaseModel {
  protected static tableName = "website_builder.ai_command_batches";

  /**
   * Insert a new batch row and return it. Mirrors createBatch.
   */
  static async insertReturning(
    data: Record<string, unknown>,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const [batch] = await this.table(trx).insert(data).returning("*");
    return batch;
  }

  /**
   * Fetch a batch (full raw row) by id. Mirrors getBatch / the analyzeBatch +
   * executeBatch lookups.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findRawById(batchId: string, trx?: QueryContext): Promise<any> {
    return this.table(trx).where("id", batchId).first();
  }

  /**
   * List a project's batches newest-first (full raw rows). Mirrors listBatches.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async listByProjectId(
    projectId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where("project_id", projectId)
      .orderBy("created_at", "desc");
  }

  /**
   * Delete a batch by id. Mirrors deleteBatch.
   */
  static async deleteById(batchId: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where("id", batchId).del();
  }

  /**
   * Apply a partial column update to a batch, stamping updated_at via the DB
   * clock. Mirrors the status/summary update blocks in analyzeBatch,
   * analyzeSpecializedBatch, and executeBatch (verbatim — caller passes the
   * pre-built column payload, e.g. status/summary).
   */
  static async updateById(
    batchId: string,
    data: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where("id", batchId)
      .update({ ...data, updated_at: db.fn.now() });
  }

  /**
   * Set status (+ updated_at via the DB clock) for a batch. Mirrors the
   * "executing" transition in executeBatch.
   */
  static async updateStatus(
    batchId: string,
    status: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where("id", batchId)
      .update({ status, updated_at: db.fn.now() });
  }

  /**
   * Set summary (+ updated_at via the DB clock) and return the updated row.
   * Mirrors updateBatchSummary.
   */
  static async updateSummaryReturning(
    batchId: string,
    summary: string,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const [batch] = await this.table(trx)
      .where("id", batchId)
      .update({ summary, updated_at: db.fn.now() })
      .returning("*");
    return batch;
  }

  /**
   * Set the (already-stringified) stats payload (+ updated_at via the DB clock)
   * for a batch. Mirrors refreshStats.
   */
  static async updateStats(
    batchId: string,
    statsJson: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where("id", batchId)
      .update({ stats: statsJson, updated_at: db.fn.now() });
  }
}
