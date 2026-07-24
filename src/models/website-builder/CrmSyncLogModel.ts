import { BaseModel, PaginatedResult, PaginationParams, QueryContext } from "../BaseModel";
import {
  CRM_SYNC_LOG_PRUNE_BATCH_SIZE,
  CRM_SYNC_LOG_PRUNE_MAX_BATCHES,
} from "../../config/crmSyncLog";

export type CrmSyncOutcome =
  | "success"
  | "skipped_flagged"
  | "failed"
  | "no_mapping";

export interface ICrmSyncLog {
  id: string;
  integration_id: string | null;
  mapping_id: string | null;
  submission_id: string | null;
  /** Denormalized from integration; preserved when integration row is deleted. */
  platform: string | null;
  /** Denormalized from mapping; preserved when mapping row is deleted. */
  vendor_form_id: string | null;
  outcome: CrmSyncOutcome;
  vendor_response_status: number | null;
  vendor_response_body: string | null;
  error: string | null;
  attempted_at: Date;
}

export class CrmSyncLogModel extends BaseModel {
  protected static tableName = "website_builder.crm_sync_logs";

  static async create(
    data: {
      integration_id?: string | null;
      mapping_id?: string | null;
      submission_id?: string | null;
      platform?: string | null;
      vendor_form_id?: string | null;
      outcome: CrmSyncOutcome;
      vendor_response_status?: number | null;
      vendor_response_body?: string | null;
      error?: string | null;
    },
    trx?: QueryContext,
  ): Promise<ICrmSyncLog> {
    const [result] = await this.table(trx)
      .insert({
        integration_id: data.integration_id ?? null,
        mapping_id: data.mapping_id ?? null,
        submission_id: data.submission_id ?? null,
        platform: data.platform ?? null,
        vendor_form_id: data.vendor_form_id ?? null,
        outcome: data.outcome,
        vendor_response_status: data.vendor_response_status ?? null,
        vendor_response_body: data.vendor_response_body ?? null,
        error: data.error ?? null,
        attempted_at: new Date(),
      })
      .returning("*");
    return result as ICrmSyncLog;
  }

  static async findByIntegrationId(
    integrationId: string,
    pagination: PaginationParams,
    trx?: QueryContext,
  ): Promise<PaginatedResult<ICrmSyncLog>> {
    return this.paginate<ICrmSyncLog>(
      (qb) =>
        qb
          .where({ integration_id: integrationId })
          .orderBy("attempted_at", "desc"),
      pagination,
      trx,
    );
  }

  static async findBySubmissionId(
    submissionId: string,
    trx?: QueryContext,
  ): Promise<ICrmSyncLog[]> {
    return this.table(trx)
      .where({ submission_id: submissionId })
      .orderBy("attempted_at", "desc");
  }

  /**
   * Retention housekeeping. Deletes log rows strictly older than the given
   * date and returns how many were removed.
   *
   * The comparison is strict `<`: a row whose `attempted_at` is exactly the
   * cutoff — and every newer row — is inside the retention window and must
   * survive. Do not relax this to `<=`.
   *
   * Deletion runs in bounded batches (§10.4 / lock safety) rather than one
   * unbounded statement, so the first run against a never-pruned table cannot
   * hold row locks on millions of rows for the length of a single transaction.
   * Each batch is its own statement; a run that hits the batch ceiling leaves
   * the remainder for the next scheduled run.
   */
  static async pruneOlderThan(
    cutoff: Date,
    trx?: QueryContext,
  ): Promise<number> {
    let totalDeleted = 0;

    for (let batch = 0; batch < CRM_SYNC_LOG_PRUNE_MAX_BATCHES; batch += 1) {
      const deleted = await this.table(trx)
        .whereIn(
          "id",
          this.table(trx)
            .select("id")
            .where("attempted_at", "<", cutoff)
            .limit(CRM_SYNC_LOG_PRUNE_BATCH_SIZE),
        )
        .del();

      totalDeleted += deleted;

      if (deleted < CRM_SYNC_LOG_PRUNE_BATCH_SIZE) {
        break;
      }
    }

    return totalDeleted;
  }
}
