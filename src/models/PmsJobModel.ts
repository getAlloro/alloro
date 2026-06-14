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
}
