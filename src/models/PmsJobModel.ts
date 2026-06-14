import { Knex } from "knex";
import { BaseModel, PaginatedResult, PaginationParams, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

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
    return this.table(trx)
      .where({ organization_id: organizationId })
      .count<{ count: string }[]>("* as count")
      .first();
  }

  /** Hard-delete all jobs for an org (admin reset). Returns rows deleted. */
  static async deleteByOrganizationId(
    organizationId: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ organization_id: organizationId }).del();
  }

  static async listAdmin(
    filters: PmsJobFilters,
    pagination: PaginationParams,
    trx?: QueryContext
  ): Promise<PaginatedResult<IPmsJob>> {
    const buildQuery = (qb: Knex.QueryBuilder) => {
      if (filters.organization_id) {
        qb = qb.where("organization_id", filters.organization_id);
      }
      if (filters.status) {
        qb = qb.where("status", filters.status);
      }
      if (filters.statuses && filters.statuses.length > 0) {
        qb = qb.whereIn("status", filters.statuses);
      }
      if (filters.is_approved !== undefined) {
        qb = qb.where("is_approved", filters.is_approved);
      }
      return qb.orderBy("timestamp", "desc");
    };
    return this.paginate<IPmsJob>(buildQuery, pagination, trx);
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
    return this.table(trx)
      .where({ id })
      .update({ automation_status_detail: statusDetailJson });
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
    let query = this.table(trx)
      .whereNotNull("automation_status_detail")
      .whereRaw(
        "automation_status_detail::jsonb->>'status' IN ('pending', 'processing', 'awaiting_approval')"
      )
      .select(
        "id",
        "organization_id",
        "location_id",
        "status",
        "is_approved",
        "is_client_approved",
        "automation_status_detail",
        "timestamp"
      )
      .orderBy("timestamp", "desc");

    if (organizationId) {
      query = query.where("organization_id", organizationId);
    }
    if (locationId) {
      query = query.where("location_id", locationId);
    }

    const rows = await query;
    return rows.map((row: IPmsJob) => this.deserializeJsonFields(row));
  }

  /**
   * Find an in-flight monthly-agents automation job for an org (optional
   * location), i.e. automation_status_detail.status = 'processing' and
   * .currentStep = 'monthly_agents'. Returns the raw first matching row.
   * Mirrors the inline getLatestReferralEngineOutput active-automation check.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findActiveMonthlyAgentsAutomation(
    organizationId: number,
    locationId: number | null,
    trx?: QueryContext
  ): Promise<any> {
    const query = this.table(trx)
      .where({ organization_id: organizationId })
      .whereRaw(
        `automation_status_detail::jsonb->>'status' = 'processing'
         AND automation_status_detail::jsonb->>'currentStep' = 'monthly_agents'`
      );
    if (locationId) {
      query.where("location_id", locationId);
    }
    return query.first();
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
    const buildQuery = (qb: Knex.QueryBuilder) => {
      qb = qb.where("organization_id", organizationId);
      if (options?.locationId) {
        qb = qb.where("location_id", options.locationId);
      }
      if (options?.status) {
        qb = qb.where("status", options.status);
      }
      if (options?.isApproved !== undefined) {
        qb = qb.where("is_approved", options.isApproved);
      }
      return qb.orderBy("timestamp", "desc");
    };
    return this.paginate<IPmsJob>(buildQuery, pagination, trx);
  }

  /**
   * Fetch jobs for key data aggregation by organization.
   */
  static async findJobsForKeyDataByOrganization(
    organizationId: number,
    locationId?: number | null,
    trx?: QueryContext
  ): Promise<IPmsJob[]> {
    let query = this.table(trx)
      .select(
        "id",
        "timestamp",
        "status",
        "response_log",
        "is_approved",
        "is_client_approved"
      )
      .where("organization_id", organizationId)
      .whereNull("deleted_at")
      .orderBy("timestamp", "asc");

    if (locationId) {
      query = query.where("location_id", locationId);
    }

    const rows = await query;
    return rows.map((row: IPmsJob) => this.deserializeJsonFields(row));
  }

  static async findLatestJobForKeyDataByOrganization(
    organizationId: number,
    locationId?: number | null,
    trx?: QueryContext
  ): Promise<IPmsJob | undefined> {
    let query = this.table(trx)
      .select(
        "id",
        "timestamp",
        "status",
        "is_approved",
        "is_client_approved",
        "response_log"
      )
      .where("organization_id", organizationId)
      .whereNull("deleted_at")
      .orderBy("timestamp", "desc");

    if (locationId) {
      query = query.where("location_id", locationId);
    }

    const row = await query.first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findApprovedJobsForPmsAggregation(
    organizationId: number,
    locationId?: number | null,
    trx?: QueryContext
  ): Promise<IPmsJob[]> {
    let query = this.table(trx)
      .select(
        "id",
        "timestamp",
        "response_log",
        "raw_input_data",
        "column_mapping_id"
      )
      .where({ organization_id: organizationId, is_approved: 1 })
      .whereNull("deleted_at")
      .orderBy("timestamp", "asc");

    if (locationId) {
      query = query.where("location_id", locationId);
    }

    const rows = await query;
    return rows.map((row: IPmsJob) => this.deserializeJsonFields(row));
  }

  static async findForOrganizationLocation(
    id: number,
    organizationId: number,
    locationId?: number | null,
    trx?: QueryContext
  ): Promise<IPmsJob | undefined> {
    let query = this.table(trx)
      .where("id", id)
      .where("organization_id", organizationId);

    if (locationId) {
      query = query.where("location_id", locationId);
    }

    const row = await query.first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async listForFileManager(
    organizationId: number,
    locationId?: number | null,
    trx?: QueryContext
  ): Promise<IPmsJob[]> {
    let query = this.table(trx)
      .leftJoin(
        "users as uploaded_users",
        "uploaded_users.id",
        "pms_jobs.uploaded_by_user_id"
      )
      .leftJoin(
        "users as deleted_users",
        "deleted_users.id",
        "pms_jobs.deleted_by_user_id"
      )
      .where("pms_jobs.organization_id", organizationId)
      .orderBy("pms_jobs.timestamp", "desc")
      .select(
        "pms_jobs.*",
        "uploaded_users.email as uploaded_by_email",
        "deleted_users.email as deleted_by_email",
        db.raw(
          "COALESCE(uploaded_users.name, NULLIF(CONCAT_WS(' ', uploaded_users.first_name, uploaded_users.last_name), ''), uploaded_users.email) AS uploaded_by_name"
        ),
        db.raw(
          "COALESCE(deleted_users.name, NULLIF(CONCAT_WS(' ', deleted_users.first_name, deleted_users.last_name), ''), deleted_users.email) AS deleted_by_name"
        )
      );

    if (locationId) {
      query = query.where("pms_jobs.location_id", locationId);
    }

    const rows = await query;
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
    const row = await this.table(trx)
      .select(
        "id",
        "organization_id",
        "location_id",
        "timestamp",
        "status",
        "is_approved",
        "automation_status_detail"
      )
      .where("organization_id", organizationId)
      .where("location_id", locationId)
      .where("is_approved", 1)
      .whereNull("deleted_at")
      .orderBy("timestamp", "desc")
      .first();

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
    const row = await this.table(trx)
      .where("organization_id", organizationId)
      .where("location_id", locationId)
      .whereNull("deleted_at")
      .whereNotNull("automation_status_detail")
      .select(
        db.raw(
          "MAX((automation_status_detail::jsonb->>'completedAt')::timestamptz) FILTER (WHERE automation_status_detail::jsonb->>'status' = 'completed') AS last_completed_at"
        ),
        db.raw(
          "BOOL_OR(automation_status_detail::jsonb->>'status' IN ('pending', 'processing', 'awaiting_approval')) AS has_active_run"
        )
      )
      .first();

    return {
      lastCompletedAt: row?.last_completed_at
        ? new Date(row.last_completed_at).toISOString()
        : null,
      hasActiveRun: Boolean(row?.has_active_run),
    };
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
    let countQuery = this.table(trx);
    if (filters.statuses && filters.statuses.length > 0) {
      countQuery = countQuery.whereIn("status", filters.statuses);
    }
    if (filters.approvedFilter !== undefined) {
      countQuery = countQuery.where("is_approved", filters.approvedFilter ? 1 : 0);
    }
    if (filters.organizationFilter) {
      countQuery = countQuery.where("organization_id", filters.organizationFilter);
    }
    if (filters.locationFilter) {
      countQuery = countQuery.where("location_id", filters.locationFilter);
    }
    const totalResult = await countQuery.count({ total: "*" });
    return Number(totalResult?.[0]?.total ?? 0);
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
    let dataQuery = this.table(trx)
      .leftJoin("locations", "pms_jobs.location_id", "locations.id")
      .select("pms_jobs.*", "locations.name as location_name");
    if (filters.statuses && filters.statuses.length > 0) {
      dataQuery = dataQuery.whereIn("pms_jobs.status", filters.statuses);
    }
    if (filters.approvedFilter !== undefined) {
      dataQuery = dataQuery.where(
        "pms_jobs.is_approved",
        filters.approvedFilter ? 1 : 0
      );
    }
    if (filters.organizationFilter) {
      dataQuery = dataQuery.where(
        "pms_jobs.organization_id",
        filters.organizationFilter
      );
    }
    if (filters.locationFilter) {
      dataQuery = dataQuery.where("pms_jobs.location_id", filters.locationFilter);
    }
    return dataQuery
      .orderBy("pms_jobs.timestamp", "desc")
      .limit(pagination.limit)
      .offset(pagination.offset);
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
    return this.table(trx).where({ id }).update({ response_log: responseLogValue });
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
    return this.table(trx)
      .select(
        "id",
        "time_elapsed",
        "status",
        "response_log",
        "timestamp",
        "is_approved",
        "is_client_approved"
      )
      .where({ id })
      .first();
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
    return this.table(trx)
      .select(
        "id",
        "time_elapsed",
        "status",
        "response_log",
        "timestamp",
        "is_approved",
        "organization_id",
        "location_id"
      )
      .where({ id })
      .first();
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
    return this.table(trx).where({ id }).update(updatePayload);
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
    return this.table(trx)
      .select(
        "id",
        "time_elapsed",
        "status",
        "response_log",
        "timestamp",
        "is_approved"
      )
      .where({ id })
      .first();
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
    return this.table(trx)
      .select(
        "id",
        "time_elapsed",
        "status",
        "response_log",
        "timestamp",
        "is_approved",
        "is_client_approved",
        "organization_id"
      )
      .where({ id })
      .first();
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
    return this.table(trx)
      .where({ id })
      .update({ is_client_approved: clientApproval ? 1 : 0 });
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
    return this.table(trx)
      .select(
        "id",
        "time_elapsed",
        "status",
        "response_log",
        "timestamp",
        "is_approved",
        "is_client_approved",
        "organization_id",
        "location_id"
      )
      .where({ id })
      .first();
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
    return this.table(trx)
      .where({ id })
      .select(
        "id",
        "organization_id",
        "status",
        "is_approved",
        "is_client_approved",
        "automation_status_detail",
        "timestamp",
        "response_log"
      )
      .first();
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
    return this.table(trx)
      .where({ id })
      .select("automation_status_detail")
      .first();
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
    return this.table(trx)
      .where({ id })
      .select(
        "id",
        "organization_id",
        "location_id",
        "status",
        "raw_input_data",
        "response_log",
        "automation_status_detail",
        "is_approved",
        "is_client_approved"
      )
      .first();
  }

  /**
   * Reset a job to pending before re-running the PMS parser. Mirrors the inline
   * update in pms-retry.service.retryPmsParser.
   */
  static async resetForPmsParserRetry(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).update({
      status: "pending",
      response_log: null,
      is_approved: 0,
      is_client_approved: 0,
    });
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
    return this.table(trx)
      .where({ id })
      .select("id", "organization_id", "location_id", "automation_status_detail")
      .first();
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
    const where: Record<string, unknown> =
      locationId !== null
        ? {
            organization_id: organizationId,
            location_id: locationId,
            is_approved: 1,
          }
        : { organization_id: organizationId, is_approved: 1 };
    return this.table(trx)
      .where(where)
      .orderBy("timestamp", "desc")
      .select("timestamp")
      .first();
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
    return this.table(trx)
      .whereRaw(
        `automation_status_detail::jsonb->>'status' = 'processing'
         AND automation_status_detail::jsonb->>'startedAt' IS NOT NULL
         AND (NOW() - (automation_status_detail::jsonb->>'startedAt')::timestamptz) > interval '${thresholdMinutes} minutes'`,
      )
      .select("id", "organization_id", "location_id", "automation_status_detail");
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
    return this.table(trx)
      .where("id", id)
      .update({
        automation_status_detail: db.raw(
          `jsonb_set(jsonb_set(automation_status_detail::jsonb, '{status}', '"failed"'), '{message}', '"Server restarted — run interrupted and marked failed on startup"')`,
        ),
      });
  }
}
