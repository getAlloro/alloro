import { BaseModel, PaginatedResult, PaginationParams, QueryContext } from "./BaseModel";
import * as q from "./pmsJobQueries";

export interface IPmsJob {
  id: number;
  organization_id: number | null;
  location_id: number | null;
  status: string;
  time_elapsed: number | null;
  is_approved: boolean;
  is_client_approved: boolean;
  response_log: Record<string, unknown> | null;
  original_response_log: Record<string, unknown> | null;
  raw_input_data: Record<string, unknown> | null;
  automation_status_detail: Record<string, unknown> | null;
  column_mapping_id?: number | null;
  original_file_name?: string | null;
  original_file_mime_type?: string | null;
  original_file_size_bytes?: number | string | null;
  original_file_s3_key?: string | null;
  uploaded_by_user_id?: number | null;
  uploaded_by_name?: string | null;
  uploaded_by_email?: string | null;
  deleted_at?: Date | string | null;
  deleted_by_user_id?: number | null;
  deleted_by_name?: string | null;
  deleted_by_email?: string | null;
  deleted_reason?: string | null;
  timestamp: Date;
}

export interface PmsJobFilters {
  organization_id?: number;
  status?: string;
  statuses?: string[];
  is_approved?: boolean;
}

/**
 * DB-correctness layer for `pms_jobs`.
 *
 * This class is a thin public facade: every non-trivial method delegates to a
 * query-builder body in {@link import("./pmsJobQueries")}, keeping this file
 * under the size ceiling while the public surface — and every caller of it,
 * plus the `vi.mock("../models/PmsJobModel")` smoke-test seam — stays
 * unchanged. The BaseModel passthroughs (findById / deleteById), the
 * `create`/`updateById` overrides (which own JSON serialization for the
 * `timestamp`-column quirk), the `updateById`-based approval/status wrappers,
 * and the `paginate`-driven list methods remain here.
 *
 * Behavior is preserved: each delegate builds the SAME query as the original
 * inline body (identical columns/filters/joins/ordering/limits/return-shapes,
 * trx threading, raw SQL, and timestamp clocks). JSON (de)serialization stays
 * owned here via BaseModel: the read methods that deserialize fetch raw rows
 * from the helper and map through `this.deserializeJsonFields`.
 */
export class PmsJobModel extends BaseModel {
  protected static tableName = "pms_jobs";
  protected static jsonFields = [
    "response_log",
    "original_response_log",
    "raw_input_data",
    "automation_status_detail",
  ];

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<IPmsJob | undefined> {
    return super.findById(id, trx);
  }

  /**
   * Override BaseModel.create() — pms_jobs uses `timestamp` column, not created_at/updated_at.
   */
  static async create(
    data: Partial<IPmsJob>,
    trx?: QueryContext
  ): Promise<IPmsJob> {
    const serialized = this.serializeJsonFields({
      ...data,
      timestamp: new Date(),
    } as Record<string, unknown>);
    const [result] = await this.table(trx).insert(serialized).returning("*");
    return this.deserializeJsonFields(result);
  }

  /**
   * Override BaseModel.updateById() — pms_jobs has no updated_at column.
   */
  static async updateById(
    id: number,
    data: Partial<IPmsJob>,
    trx?: QueryContext
  ): Promise<number> {
    const serialized = this.serializeJsonFields(data as Record<string, unknown>);
    return this.table(trx).where({ id }).update(serialized);
  }

  static async deleteById(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return super.deleteById(id, trx);
  }

  /** COUNT(*) of jobs for an org (admin reset preview). */
  static async countByOrganizationId(
    organizationId: number,
    trx?: QueryContext
  ): Promise<{ count: string } | undefined> {
    return q.countByOrganizationIdQuery(organizationId, trx);
  }

  /** Hard-delete all jobs for an org (admin reset). Returns rows deleted. */
  static async deleteByOrganizationId(
    organizationId: number,
    trx?: QueryContext
  ): Promise<number> {
    return q.deleteByOrganizationIdQuery(organizationId, trx);
  }

  static async listAdmin(
    filters: PmsJobFilters,
    pagination: PaginationParams,
    trx?: QueryContext
  ): Promise<PaginatedResult<IPmsJob>> {
    return this.paginate<IPmsJob>(
      q.listAdminBuildQuery(filters),
      pagination,
      trx
    );
  }

  static async updateApproval(
    id: number,
    isApproved: boolean,
    trx?: QueryContext
  ): Promise<number> {
    return this.updateById(id, { is_approved: isApproved } as Partial<IPmsJob>, trx);
  }

  static async updateClientApproval(
    id: number,
    isClientApproved: boolean,
    trx?: QueryContext
  ): Promise<number> {
    return this.updateById(id, { is_client_approved: isClientApproved } as Partial<IPmsJob>, trx);
  }

  static async updateAutomationStatus(
    id: number,
    statusDetail: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return this.updateById(
      id,
      { automation_status_detail: statusDetail } as Partial<IPmsJob>,
      trx
    );
  }

  /**
   * Persist an already-stringified automation_status_detail value (raw
   * passthrough). Mirrors the inline updates in
   * utils/pms/pmsAutomationStatus.ts, which store a pre-stringified JSON string
   * rather than letting the model serialize.
   */
  static async updateAutomationStatusDetailRaw(
    id: number,
    statusDetailJson: string,
    trx?: QueryContext
  ): Promise<number> {
    return q.updateAutomationStatusDetailRawQuery(id, statusDetailJson, trx);
  }

  /**
   * Find all active automation jobs (status is pending, processing, or awaiting_approval).
   * Optionally filter by organization.
   */
  static async findActiveAutomationJobs(
    organizationId?: number,
    locationId?: number,
    trx?: QueryContext
  ): Promise<IPmsJob[]> {
    const rows = await q.findActiveAutomationJobsQuery(
      organizationId,
      locationId,
      trx
    );
    return rows.map((row: IPmsJob) => this.deserializeJsonFields(row));
  }

  /**
   * Find an in-flight monthly-agents automation job for an org (optional
   * location), i.e. automation_status_detail.status = 'processing' and
   * .currentStep = 'monthly_agents'. Returns the raw first matching row.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findActiveMonthlyAgentsAutomation(
    organizationId: number,
    locationId: number | null,
    trx?: QueryContext
  ): Promise<any> {
    return q.findActiveMonthlyAgentsAutomationQuery(
      organizationId,
      locationId,
      trx
    );
  }

  /**
   * List jobs for an organization, optionally filtered by location.
   */
  static async listByOrganization(
    organizationId: number,
    pagination: PaginationParams,
    options?: {
      locationId?: number | null;
      status?: string;
      isApproved?: boolean;
    },
    trx?: QueryContext
  ): Promise<PaginatedResult<IPmsJob>> {
    return this.paginate<IPmsJob>(
      q.listByOrganizationBuildQuery(organizationId, options),
      pagination,
      trx
    );
  }

  /**
   * Fetch jobs for key data aggregation by organization.
   */
  static async findJobsForKeyDataByOrganization(
    organizationId: number,
    locationId?: number | null,
    trx?: QueryContext
  ): Promise<IPmsJob[]> {
    const rows = await q.findJobsForKeyDataByOrganizationQuery(
      organizationId,
      locationId,
      trx
    );
    return rows.map((row: IPmsJob) => this.deserializeJsonFields(row));
  }

  static async findLatestJobForKeyDataByOrganization(
    organizationId: number,
    locationId?: number | null,
    trx?: QueryContext
  ): Promise<IPmsJob | undefined> {
    const row = await q.findLatestJobForKeyDataByOrganizationQuery(
      organizationId,
      locationId,
      trx
    );
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findApprovedJobsForPmsAggregation(
    organizationId: number,
    locationId?: number | null,
    trx?: QueryContext
  ): Promise<IPmsJob[]> {
    const rows = await q.findApprovedJobsForPmsAggregationQuery(
      organizationId,
      locationId,
      trx
    );
    return rows.map((row: IPmsJob) => this.deserializeJsonFields(row));
  }

  static async findForOrganizationLocation(
    id: number,
    organizationId: number,
    locationId?: number | null,
    trx?: QueryContext
  ): Promise<IPmsJob | undefined> {
    const row = await q.findForOrganizationLocationQuery(
      id,
      organizationId,
      locationId,
      trx
    );
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async listForFileManager(
    organizationId: number,
    locationId?: number | null,
    trx?: QueryContext
  ): Promise<IPmsJob[]> {
    const rows = await q.listForFileManagerQuery(
      organizationId,
      locationId,
      trx
    );
    return rows.map((row: IPmsJob) => this.deserializeJsonFields(row));
  }

  /**
   * Latest approved, non-deleted job for a location. Used as the trigger job
   * when a user explicitly re-runs insights from the file manager.
   */
  static async findLatestActiveJobForLocation(
    organizationId: number,
    locationId: number,
    trx?: QueryContext
  ): Promise<IPmsJob | undefined> {
    const row = await q.findLatestActiveJobForLocationQuery(
      organizationId,
      locationId,
      trx
    );
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  /**
   * Summarize the monthly-agent run state for a location: when the most recent
   * run completed, and whether any run is currently active. Used to detect
   * whether displayed insights are stale relative to the underlying PMS data.
   */
  static async getInsightsRunSummaryForLocation(
    organizationId: number,
    locationId: number,
    trx?: QueryContext
  ): Promise<{ lastCompletedAt: string | null; hasActiveRun: boolean }> {
    return q.getInsightsRunSummaryForLocationQuery(
      organizationId,
      locationId,
      trx
    );
  }

  /**
   * Count jobs matching the admin list filters. Mirrors the inline count query
   * in pms-data.service.listJobsPaginated (status whitelist, is_approved 1/0,
   * org, location).
   */
  static async countJobsForList(
    filters: {
      statuses?: string[];
      approvedFilter?: boolean;
      organizationFilter?: number;
      locationFilter?: number;
    },
    trx?: QueryContext
  ): Promise<number> {
    return q.countJobsForListQuery(filters, trx);
  }

  /**
   * List jobs (joined to locations for location_name) matching the admin list
   * filters, ordered by timestamp desc with limit/offset. Mirrors the inline
   * data query in pms-data.service.listJobsPaginated. Returns raw rows
   * (select pms_jobs.* + locations.name) to preserve original consumption.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async listJobsWithLocationName(
    filters: {
      statuses?: string[];
      approvedFilter?: boolean;
      organizationFilter?: number;
      locationFilter?: number;
    },
    pagination: { limit: number; offset: number },
    trx?: QueryContext
  ): Promise<any[]> {
    return q.listJobsWithLocationNameQuery(filters, pagination, trx);
  }

  /**
   * Persist a raw response_log value (already serialized to a string or null)
   * for a job. Mirrors the inline update in pms-data.service.updateJobResponse,
   * which stores a pre-stringified value rather than letting the model
   * serialize.
   */
  static async updateResponseLogRaw(
    id: number,
    responseLogValue: string | null,
    trx?: QueryContext
  ): Promise<number> {
    return q.updateResponseLogRawQuery(id, responseLogValue, trx);
  }

  /**
   * Fetch the response-summary columns for a job. Mirrors the post-update
   * select in pms-data.service.updateJobResponse. Returns the raw row.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findResponseSummaryById(
    id: number,
    trx?: QueryContext
  ): Promise<any> {
    return q.findResponseSummaryByIdQuery(id, trx);
  }

  /**
   * Fetch the admin-approval columns for a job. Mirrors the lead select in
   * pms-approval.service.approveByAdmin. Returns the raw row.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findForAdminApprovalById(
    id: number,
    trx?: QueryContext
  ): Promise<any> {
    return q.findForAdminApprovalByIdQuery(id, trx);
  }

  /**
   * Apply an arbitrary approval update payload (is_approved and optionally
   * status). Mirrors the inline update in pms-approval.service.approveByAdmin.
   */
  static async applyApprovalUpdate(
    id: number,
    updatePayload: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return q.applyApprovalUpdateQuery(id, updatePayload, trx);
  }

  /**
   * Fetch the post-admin-approval summary columns. Mirrors the trailing select
   * in pms-approval.service.approveByAdmin. Returns the raw row.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findAdminApprovalSummaryById(
    id: number,
    trx?: QueryContext
  ): Promise<any> {
    return q.findAdminApprovalSummaryByIdQuery(id, trx);
  }

  /**
   * Fetch the client-approval columns for a job. Mirrors the lead select in
   * pms-approval.service.approveByClient. Returns the raw row.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findForClientApprovalById(
    id: number,
    trx?: QueryContext
  ): Promise<any> {
    return q.findForClientApprovalByIdQuery(id, trx);
  }

  /**
   * Set the is_client_approved flag (1/0). Mirrors the inline update in
   * pms-approval.service.approveByClient.
   */
  static async setClientApprovalFlag(
    id: number,
    clientApproval: boolean,
    trx?: QueryContext
  ): Promise<number> {
    return q.setClientApprovalFlagQuery(id, clientApproval, trx);
  }

  /**
   * Fetch the post-client-approval summary columns (includes org + location for
   * the monthly-agents trigger). Mirrors the trailing select in
   * pms-approval.service.approveByClient. Returns the raw row.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findClientApprovalResultById(
    id: number,
    trx?: QueryContext
  ): Promise<any> {
    return q.findClientApprovalResultByIdQuery(id, trx);
  }

  /**
   * Fetch the automation-status columns for a job. Mirrors the lead select in
   * pms-automation.service.getJobAutomationStatus. Returns the raw row.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findForAutomationStatusById(
    id: number,
    trx?: QueryContext
  ): Promise<any> {
    return q.findForAutomationStatusByIdQuery(id, trx);
  }

  /**
   * Fetch just the automation_status_detail column for a job. Mirrors the
   * refresh select in pms-automation.service.getJobAutomationStatus. Returns
   * the raw row.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findAutomationStatusDetailById(
    id: number,
    trx?: QueryContext
  ): Promise<any> {
    return q.findAutomationStatusDetailByIdQuery(id, trx);
  }

  /**
   * Fetch the columns needed to retry a failed step. Mirrors the lead select in
   * pms-retry.service.retryFailedStep. Returns the raw row.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findForRetryById(
    id: number,
    trx?: QueryContext
  ): Promise<any> {
    return q.findForRetryByIdQuery(id, trx);
  }

  /**
   * Reset a job to pending before re-running the PMS parser. Mirrors the inline
   * update in pms-retry.service.retryPmsParser.
   */
  static async resetForPmsParserRetry(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return q.resetForPmsParserRetryQuery(id, trx);
  }

  /**
   * Fetch the columns needed to restart a completed monthly-agents run. Mirrors
   * the lead select in pms-retry.service.restartMonthlyAgents. Returns the raw
   * row.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findForRestartById(
    id: number,
    trx?: QueryContext
  ): Promise<any> {
    return q.findForRestartByIdQuery(id, trx);
  }

  /**
   * timestamp of the most-recent approved (is_approved=1) job for an org
   * (optional location). Mirrors the last-upload query in
   * utils/dashboard-metrics/service.dashboard-metrics.buildPmsMetrics verbatim.
   * Returns the raw row (or undefined).
   */
  static async findLastApprovedUploadTimestamp(
    organizationId: number,
    locationId: number | null,
    trx?: QueryContext
  ): Promise<{ timestamp: Date | string } | undefined> {
    return q.findLastApprovedUploadTimestampQuery(
      organizationId,
      locationId,
      trx
    );
  }

  /**
   * Jobs stuck in automation_status_detail.status = 'processing' whose
   * startedAt is older than `thresholdMinutes`. Mirrors the inline whereRaw in
   * utils/startup/zombieJobCleanup.cleanupZombieJobs verbatim (the threshold is
   * interpolated into the interval literal exactly as before). Raw rows.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findZombieProcessingJobs(
    thresholdMinutes: number,
    trx?: QueryContext
  ): Promise<any[]> {
    return q.findZombieProcessingJobsQuery(thresholdMinutes, trx);
  }

  /**
   * Flip a zombie job's automation_status_detail status→failed with the
   * server-restart message, via a jsonb_set raw expression. Mirrors the inline
   * update in utils/startup/zombieJobCleanup.cleanupZombieJobs verbatim.
   */
  static async markZombieFailed(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return q.markZombieFailedQuery(id, trx);
  }
}
