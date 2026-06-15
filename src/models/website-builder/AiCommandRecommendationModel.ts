import { BaseModel, QueryContext } from "../BaseModel";

interface RecommendationStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  executed: number;
  failed: number;
}

/**
 * Owns the `website_builder.ai_command_recommendations` table. Exposes the
 * methods the agentic HTML pipeline needs plus every read/write the
 * admin-websites AI command pipeline performs against this table. All queries
 * mirror the inline builders previously held in
 * controllers/admin-websites/feature-services/service.ai-command verbatim
 * (same columns, filters, ordering). Recommendation rows carry a
 * pre-stringified `target_meta` / `execution_result` from the caller, so inserts
 * and updates are raw passthroughs.
 */
export class AiCommandRecommendationModel extends BaseModel {
  protected static tableName = "website_builder.ai_command_recommendations";

  /**
   * Set the (already-stringified) execution_result for a recommendation by id.
   * Mirrors agenticHtmlPipeline.updateRecStatus.
   */
  static async updateExecutionResult(
    id: string,
    executionResultJson: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where("id", id)
      .update({ execution_result: executionResultJson });
  }

  /**
   * Insert a single recommendation row verbatim (raw passthrough — the caller
   * pre-builds the column payload including pre-stringified target_meta).
   * Mirrors the many `db(RECS_TABLE).insert(...)` sites in analyzeBatch /
   * analyzeSpecializedBatch.
   */
  static async insertRow(
    row: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<void> {
    await this.table(trx).insert(row);
  }

  /**
   * Approved recommendations for a batch, ordered by sort_order asc (full raw
   * rows). Mirrors the approved-recommendations fetch in executeBatch.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findApprovedByBatchId(
    batchId: string,
    trx?: QueryContext
  ): Promise<any[]> {
    return this.table(trx)
      .where({ batch_id: batchId, status: "approved" })
      .orderBy("sort_order", "asc");
  }

  /**
   * All recommendations for a batch, ordered by sort_order asc, with optional
   * status / target_type filters (full raw rows). Mirrors
   * getBatchRecommendations and the buildExecutionSummary fetch (called with no
   * filters).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByBatchId(
    batchId: string,
    filters?: { status?: string; target_type?: string },
    trx?: QueryContext
  ): Promise<any[]> {
    let query = this.table(trx)
      .where("batch_id", batchId)
      .orderBy("sort_order", "asc");

    if (filters?.status) {
      query = query.where("status", filters.status);
    }
    if (filters?.target_type) {
      query = query.where("target_type", filters.target_type);
    }

    return query;
  }

  /**
   * Fetch a single recommendation (full raw row) by id. Mirrors the existing-row
   * read in updateRecommendationStatus.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findRawById(id: string, trx?: QueryContext): Promise<any> {
    return this.table(trx).where("id", id).first();
  }

  /**
   * Apply a column update to a recommendation by id (raw passthrough — caller
   * pre-builds the payload, including pre-stringified execution_result /
   * target_meta). Mirrors the many `db(RECS_TABLE).where("id").update(...)`
   * sites across the execution handlers.
   */
  static async updateById(
    id: string,
    data: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where("id", id).update(data);
  }

  /**
   * Apply a column update to a recommendation by id and return the updated row.
   * Mirrors the status update in updateRecommendationStatus.
   */
  static async updateByIdReturning(
    id: string,
    data: Record<string, unknown>,
    trx?: QueryContext
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const [rec] = await this.table(trx)
      .where("id", id)
      .update(data)
      .returning("*");
    return rec;
  }

  /**
   * Bulk-update status of all pending recommendations in a batch, optionally
   * narrowed to a target_type, returning the affected row count. Mirrors
   * bulkUpdateStatus.
   */
  static async bulkUpdatePendingStatus(
    batchId: string,
    status: "approved" | "rejected",
    filters?: { target_type?: string },
    trx?: QueryContext
  ): Promise<number> {
    let query = this.table(trx).where({ batch_id: batchId, status: "pending" });

    if (filters?.target_type) {
      query = query.where("target_type", filters.target_type);
    }

    return query.update({ status });
  }

  /**
   * Compute the per-status counts for a batch's recommendations. Mirrors the
   * `select("status")` + reduce in refreshStats verbatim (same select + same
   * accumulator shape) so the stats payload is byte-identical.
   */
  static async computeStats(
    batchId: string,
    trx?: QueryContext
  ): Promise<RecommendationStats> {
    return this.table(trx)
      .where("batch_id", batchId)
      .select("status")
      .then((rows) =>
        rows.reduce(
          (acc: RecommendationStats, row: { status: string }) => {
            acc.total++;
            const s = row.status as keyof RecommendationStats;
            if (s in acc) (acc[s] as number)++;
            return acc;
          },
          { total: 0, pending: 0, approved: 0, rejected: 0, executed: 0, failed: 0 }
        )
      );
  }
}
