import type { IPmsJob } from "../../../models/PmsJobModel";
import type { PmsJobEvent } from "../../../models/PmsJobEventModel";
import { extractMonthEntriesFromResponse } from "./pms-normalizer.util";

export type PmsFileMonthSlot = {
  month: string;
  status: "active" | "missing";
  jobId: number | null;
  fileName: string | null;
};

export function presentPmsFile(job: IPmsJob, activeMonths: Set<string>) {
  const months = extractMonthEntriesFromResponse(job.response_log)
    .map((entry) => entry.month)
    .filter((month): month is string => Boolean(month));
  const originalMonths = extractMonthEntriesFromResponse(job.original_response_log)
    .map((entry) => entry.month)
    .filter((month): month is string => Boolean(month));
  const activeMonthList = months.filter((month) => activeMonths.has(month));

  return {
    id: job.id,
    organization_id: job.organization_id,
    location_id: job.location_id,
    status: job.status,
    timestamp: job.timestamp,
    is_approved: job.is_approved,
    is_client_approved: job.is_client_approved,
    is_deleted: Boolean(job.deleted_at),
    deleted_at: job.deleted_at ?? null,
    deleted_reason: job.deleted_reason ?? null,
    deleted_by_user_id: job.deleted_by_user_id ?? null,
    deleted_by_name: job.deleted_by_name ?? null,
    original_file_name: job.original_file_name ?? null,
    original_file_mime_type: job.original_file_mime_type ?? null,
    original_file_size_bytes: job.original_file_size_bytes ?? null,
    has_original_file: Boolean(job.original_file_s3_key),
    uploaded_by_user_id: job.uploaded_by_user_id ?? null,
    uploaded_by_name: job.uploaded_by_name ?? null,
    uploaded_by_email: job.uploaded_by_email ?? null,
    months,
    original_months: originalMonths,
    active_months: activeMonthList,
    superseded_months: months.filter((month) => !activeMonths.has(month)),
    automation_status_detail: job.automation_status_detail ?? null,
  };
}

export function presentPmsFileDetail(
  job: IPmsJob,
  events: PmsJobEvent[],
  activeMonths: Set<string>
) {
  return {
    ...presentPmsFile(job, activeMonths),
    response_log: job.response_log,
    original_response_log: job.original_response_log,
    raw_input_data: job.raw_input_data,
    events: events.map((event) => ({
      id: event.id,
      pms_job_id: event.pms_job_id,
      actor_user_id: event.actor_user_id,
      actor_name: event.actor_name ?? null,
      actor_email: event.actor_email ?? null,
      event_type: event.event_type,
      metadata: event.metadata,
      created_at: event.created_at,
    })),
  };
}
