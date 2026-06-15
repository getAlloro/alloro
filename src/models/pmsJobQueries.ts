/* eslint-disable @typescript-eslint/no-explicit-any */
import { Knex } from "knex";
import { db } from "../database/connection";
import { QueryContext } from "./BaseModel";
import { IPmsJob } from "./PmsJobModel";

/**
 * Query-builder bodies for {@link PmsJobModel}, extracted verbatim so the model
 * stays under the file-size ceiling while its public static surface — and every
 * caller of it (plus the `vi.mock("../models/PmsJobModel")` seam in the smoke
 * test) — is unchanged. The model retains the BaseModel passthroughs (findById /
 * deleteById), the `create`/`updateById` overrides (which own JSON
 * serialization for the `timestamp`-column quirk), the thin `updateById`-based
 * approval/status wrappers, and the `paginate` callers.
 *
 * Behavior-preserving contract: every function builds the SAME query as the
 * original inline body in PmsJobModel — identical columns, filters, joins,
 * ordering, limits, return shapes, raw SQL (jsonb expressions, interval
 * literals), and timestamp clocks. The table is referenced through the same
 * literal the model used (`PMS_JOBS_TABLE` === PmsJobModel.tableName), so the
 * SQL is byte-identical.
 *
 * JSON (de)serialization stays owned by the model/BaseModel: the read helpers
 * that previously called `this.deserializeJsonFields` return RAW rows here, and
 * PmsJobModel applies `deserializeJsonFields` after delegation. The
 * `paginate`-driven lists expose only their buildQuery callback so the model's
 * `this.paginate` keeps doing the count/limit/offset + deserialize.
 */

const PMS_JOBS_TABLE = "pms_jobs";

/** Mirror of BaseModel.table(trx) for the pms_jobs table. */
function table(trx?: QueryContext): Knex.QueryBuilder {
  return (trx || db)(PMS_JOBS_TABLE);
}

export function countByOrganizationIdQuery(
  organizationId: number,
  trx?: QueryContext,
): Promise<{ count: string } | undefined> {
  return table(trx)
    .where({ organization_id: organizationId })
    .count<{ count: string }[]>("* as count")
    .first();
}

export function deleteByOrganizationIdQuery(
  organizationId: number,
  trx?: QueryContext,
): Promise<number> {
  return table(trx).where({ organization_id: organizationId }).del();
}

/**
 * buildQuery callback for the admin list-view pagination. Mirrors the inline
 * filter chain in PmsJobModel.listAdmin verbatim; the model still calls
 * `this.paginate` so the count/limit/offset + deserialize behavior is unchanged.
 */
export function listAdminBuildQuery(filters: {
  organization_id?: number;
  status?: string;
  statuses?: string[];
  is_approved?: boolean;
}): (qb: Knex.QueryBuilder) => Knex.QueryBuilder {
  return (qb: Knex.QueryBuilder) => {
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
}

export function updateAutomationStatusDetailRawQuery(
  id: number,
  statusDetailJson: string,
  trx?: QueryContext,
): Promise<number> {
  return table(trx)
    .where({ id })
    .update({ automation_status_detail: statusDetailJson });
}

/** Raw rows for findActiveAutomationJobs (caller deserializes). */
export function findActiveAutomationJobsQuery(
  organizationId?: number,
  locationId?: number,
  trx?: QueryContext,
): Promise<any[]> {
  let query = table(trx)
    .whereNotNull("automation_status_detail")
    .whereRaw(
      "automation_status_detail::jsonb->>'status' IN ('pending', 'processing', 'awaiting_approval')",
    )
    .select(
      "id",
      "organization_id",
      "location_id",
      "status",
      "is_approved",
      "is_client_approved",
      "automation_status_detail",
      "timestamp",
    )
    .orderBy("timestamp", "desc");

  if (organizationId) {
    query = query.where("organization_id", organizationId);
  }
  if (locationId) {
    query = query.where("location_id", locationId);
  }

  return query;
}

export function findActiveMonthlyAgentsAutomationQuery(
  organizationId: number,
  locationId: number | null,
  trx?: QueryContext,
): Promise<any> {
  const query = table(trx)
    .where({ organization_id: organizationId })
    .whereRaw(
      `automation_status_detail::jsonb->>'status' = 'processing'
         AND automation_status_detail::jsonb->>'currentStep' = 'monthly_agents'`,
    );
  if (locationId) {
    query.where("location_id", locationId);
  }
  return query.first();
}

/**
 * buildQuery callback for listByOrganization pagination. Mirrors the inline
 * filter chain in PmsJobModel.listByOrganization verbatim; the model still
 * calls `this.paginate`.
 */
export function listByOrganizationBuildQuery(
  organizationId: number,
  options?: {
    locationId?: number | null;
    status?: string;
    isApproved?: boolean;
  },
): (qb: Knex.QueryBuilder) => Knex.QueryBuilder {
  return (qb: Knex.QueryBuilder) => {
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
}

/** Raw rows for findJobsForKeyDataByOrganization (caller deserializes). */
export function findJobsForKeyDataByOrganizationQuery(
  organizationId: number,
  locationId?: number | null,
  trx?: QueryContext,
): Promise<any[]> {
  let query = table(trx)
    .select(
      "id",
      "timestamp",
      "status",
      "response_log",
      "is_approved",
      "is_client_approved",
    )
    .where("organization_id", organizationId)
    .whereNull("deleted_at")
    .orderBy("timestamp", "asc");

  if (locationId) {
    query = query.where("location_id", locationId);
  }

  return query;
}

/** Raw row (or undefined) for findLatestJobForKeyDataByOrganization. */
export function findLatestJobForKeyDataByOrganizationQuery(
  organizationId: number,
  locationId?: number | null,
  trx?: QueryContext,
): Promise<any> {
  let query = table(trx)
    .select(
      "id",
      "timestamp",
      "status",
      "is_approved",
      "is_client_approved",
      "response_log",
    )
    .where("organization_id", organizationId)
    .whereNull("deleted_at")
    .orderBy("timestamp", "desc");

  if (locationId) {
    query = query.where("location_id", locationId);
  }

  return query.first();
}

/** Raw rows for findApprovedJobsForPmsAggregation (caller deserializes). */
export function findApprovedJobsForPmsAggregationQuery(
  organizationId: number,
  locationId?: number | null,
  trx?: QueryContext,
): Promise<any[]> {
  let query = table(trx)
    .select(
      "id",
      "timestamp",
      "response_log",
      "raw_input_data",
      "column_mapping_id",
    )
    .where({ organization_id: organizationId, is_approved: 1 })
    .whereNull("deleted_at")
    .orderBy("timestamp", "asc");

  if (locationId) {
    query = query.where("location_id", locationId);
  }

  return query;
}

/** Raw row (or undefined) for findForOrganizationLocation. */
export function findForOrganizationLocationQuery(
  id: number,
  organizationId: number,
  locationId?: number | null,
  trx?: QueryContext,
): Promise<any> {
  let query = table(trx)
    .where("id", id)
    .where("organization_id", organizationId);

  if (locationId) {
    query = query.where("location_id", locationId);
  }

  return query.first();
}

/** Raw rows for listForFileManager (caller deserializes). */
export function listForFileManagerQuery(
  organizationId: number,
  locationId?: number | null,
  trx?: QueryContext,
): Promise<any[]> {
  let query = table(trx)
    .leftJoin(
      "users as uploaded_users",
      "uploaded_users.id",
      "pms_jobs.uploaded_by_user_id",
    )
    .leftJoin(
      "users as deleted_users",
      "deleted_users.id",
      "pms_jobs.deleted_by_user_id",
    )
    .where("pms_jobs.organization_id", organizationId)
    .orderBy("pms_jobs.timestamp", "desc")
    .select(
      "pms_jobs.*",
      "uploaded_users.email as uploaded_by_email",
      "deleted_users.email as deleted_by_email",
      db.raw(
        "COALESCE(uploaded_users.name, NULLIF(CONCAT_WS(' ', uploaded_users.first_name, uploaded_users.last_name), ''), uploaded_users.email) AS uploaded_by_name",
      ),
      db.raw(
        "COALESCE(deleted_users.name, NULLIF(CONCAT_WS(' ', deleted_users.first_name, deleted_users.last_name), ''), deleted_users.email) AS deleted_by_name",
      ),
    );

  if (locationId) {
    query = query.where("pms_jobs.location_id", locationId);
  }

  return query;
}

/** Raw row (or undefined) for findLatestActiveJobForLocation. */
export function findLatestActiveJobForLocationQuery(
  organizationId: number,
  locationId: number,
  trx?: QueryContext,
): Promise<any> {
  return table(trx)
    .select(
      "id",
      "organization_id",
      "location_id",
      "timestamp",
      "status",
      "is_approved",
      "automation_status_detail",
    )
    .where("organization_id", organizationId)
    .where("location_id", locationId)
    .where("is_approved", 1)
    .whereNull("deleted_at")
    .orderBy("timestamp", "desc")
    .first();
}

export async function getInsightsRunSummaryForLocationQuery(
  organizationId: number,
  locationId: number,
  trx?: QueryContext,
): Promise<{ lastCompletedAt: string | null; hasActiveRun: boolean }> {
  const row = await table(trx)
    .where("organization_id", organizationId)
    .where("location_id", locationId)
    .whereNull("deleted_at")
    .whereNotNull("automation_status_detail")
    .select(
      db.raw(
        "MAX((automation_status_detail::jsonb->>'completedAt')::timestamptz) FILTER (WHERE automation_status_detail::jsonb->>'status' = 'completed') AS last_completed_at",
      ),
      db.raw(
        "BOOL_OR(automation_status_detail::jsonb->>'status' IN ('pending', 'processing', 'awaiting_approval')) AS has_active_run",
      ),
    )
    .first();

  return {
    lastCompletedAt: row?.last_completed_at
      ? new Date(row.last_completed_at).toISOString()
      : null,
    hasActiveRun: Boolean(row?.has_active_run),
  };
}

export async function countJobsForListQuery(
  filters: {
    statuses?: string[];
    approvedFilter?: boolean;
    organizationFilter?: number;
    locationFilter?: number;
  },
  trx?: QueryContext,
): Promise<number> {
  let countQuery = table(trx);
  if (filters.statuses && filters.statuses.length > 0) {
    countQuery = countQuery.whereIn("status", filters.statuses);
  }
  if (filters.approvedFilter !== undefined) {
    countQuery = countQuery.where("is_approved", filters.approvedFilter ? 1 : 0);
  }
  if (filters.organizationFilter) {
    countQuery = countQuery.where(
      "organization_id",
      filters.organizationFilter,
    );
  }
  if (filters.locationFilter) {
    countQuery = countQuery.where("location_id", filters.locationFilter);
  }
  const totalResult = await countQuery.count({ total: "*" });
  return Number(totalResult?.[0]?.total ?? 0);
}

export function listJobsWithLocationNameQuery(
  filters: {
    statuses?: string[];
    approvedFilter?: boolean;
    organizationFilter?: number;
    locationFilter?: number;
  },
  pagination: { limit: number; offset: number },
  trx?: QueryContext,
): Promise<any[]> {
  let dataQuery = table(trx)
    .leftJoin("locations", "pms_jobs.location_id", "locations.id")
    .select("pms_jobs.*", "locations.name as location_name");
  if (filters.statuses && filters.statuses.length > 0) {
    dataQuery = dataQuery.whereIn("pms_jobs.status", filters.statuses);
  }
  if (filters.approvedFilter !== undefined) {
    dataQuery = dataQuery.where(
      "pms_jobs.is_approved",
      filters.approvedFilter ? 1 : 0,
    );
  }
  if (filters.organizationFilter) {
    dataQuery = dataQuery.where(
      "pms_jobs.organization_id",
      filters.organizationFilter,
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

export function updateResponseLogRawQuery(
  id: number,
  responseLogValue: string | null,
  trx?: QueryContext,
): Promise<number> {
  return table(trx).where({ id }).update({ response_log: responseLogValue });
}

export function findResponseSummaryByIdQuery(
  id: number,
  trx?: QueryContext,
): Promise<any> {
  return table(trx)
    .select(
      "id",
      "time_elapsed",
      "status",
      "response_log",
      "timestamp",
      "is_approved",
      "is_client_approved",
    )
    .where({ id })
    .first();
}

export function findForAdminApprovalByIdQuery(
  id: number,
  trx?: QueryContext,
): Promise<any> {
  return table(trx)
    .select(
      "id",
      "time_elapsed",
      "status",
      "response_log",
      "timestamp",
      "is_approved",
      "organization_id",
      "location_id",
    )
    .where({ id })
    .first();
}

export function applyApprovalUpdateQuery(
  id: number,
  updatePayload: Record<string, unknown>,
  trx?: QueryContext,
): Promise<number> {
  return table(trx).where({ id }).update(updatePayload);
}

export function findAdminApprovalSummaryByIdQuery(
  id: number,
  trx?: QueryContext,
): Promise<any> {
  return table(trx)
    .select(
      "id",
      "time_elapsed",
      "status",
      "response_log",
      "timestamp",
      "is_approved",
    )
    .where({ id })
    .first();
}

export function findForClientApprovalByIdQuery(
  id: number,
  trx?: QueryContext,
): Promise<any> {
  return table(trx)
    .select(
      "id",
      "time_elapsed",
      "status",
      "response_log",
      "timestamp",
      "is_approved",
      "is_client_approved",
      "organization_id",
    )
    .where({ id })
    .first();
}

export function setClientApprovalFlagQuery(
  id: number,
  clientApproval: boolean,
  trx?: QueryContext,
): Promise<number> {
  return table(trx)
    .where({ id })
    .update({ is_client_approved: clientApproval ? 1 : 0 });
}

export function findClientApprovalResultByIdQuery(
  id: number,
  trx?: QueryContext,
): Promise<any> {
  return table(trx)
    .select(
      "id",
      "time_elapsed",
      "status",
      "response_log",
      "timestamp",
      "is_approved",
      "is_client_approved",
      "organization_id",
      "location_id",
    )
    .where({ id })
    .first();
}

export function findForAutomationStatusByIdQuery(
  id: number,
  trx?: QueryContext,
): Promise<any> {
  return table(trx)
    .where({ id })
    .select(
      "id",
      "organization_id",
      "status",
      "is_approved",
      "is_client_approved",
      "automation_status_detail",
      "timestamp",
      "response_log",
    )
    .first();
}

export function findAutomationStatusDetailByIdQuery(
  id: number,
  trx?: QueryContext,
): Promise<any> {
  return table(trx)
    .where({ id })
    .select("automation_status_detail")
    .first();
}

export function findForRetryByIdQuery(
  id: number,
  trx?: QueryContext,
): Promise<any> {
  return table(trx)
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
      "is_client_approved",
    )
    .first();
}

export function resetForPmsParserRetryQuery(
  id: number,
  trx?: QueryContext,
): Promise<number> {
  return table(trx).where({ id }).update({
    status: "pending",
    response_log: null,
    is_approved: 0,
    is_client_approved: 0,
  });
}

export function findForRestartByIdQuery(
  id: number,
  trx?: QueryContext,
): Promise<any> {
  return table(trx)
    .where({ id })
    .select("id", "organization_id", "location_id", "automation_status_detail")
    .first();
}

export function findLastApprovedUploadTimestampQuery(
  organizationId: number,
  locationId: number | null,
  trx?: QueryContext,
): Promise<{ timestamp: Date | string } | undefined> {
  const where: Record<string, unknown> =
    locationId !== null
      ? {
          organization_id: organizationId,
          location_id: locationId,
          is_approved: 1,
        }
      : { organization_id: organizationId, is_approved: 1 };
  return table(trx)
    .where(where)
    .orderBy("timestamp", "desc")
    .select("timestamp")
    .first();
}

export function findZombieProcessingJobsQuery(
  thresholdMinutes: number,
  trx?: QueryContext,
): Promise<any[]> {
  return table(trx)
    .whereRaw(
      `automation_status_detail::jsonb->>'status' = 'processing'
         AND automation_status_detail::jsonb->>'startedAt' IS NOT NULL
         AND (NOW() - (automation_status_detail::jsonb->>'startedAt')::timestamptz) > interval '${thresholdMinutes} minutes'`,
    )
    .select("id", "organization_id", "location_id", "automation_status_detail");
}

export function markZombieFailedQuery(
  id: number,
  trx?: QueryContext,
): Promise<number> {
  return table(trx)
    .where("id", id)
    .update({
      automation_status_detail: db.raw(
        `jsonb_set(jsonb_set(automation_status_detail::jsonb, '{status}', '"failed"'), '{message}', '"Server restarted — run interrupted and marked failed on startup"')`,
      ),
    });
}
