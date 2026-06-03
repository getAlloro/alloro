import { db } from "../../../database/connection";
import { PmsJobModel, type IPmsJob } from "../../../models/PmsJobModel";
import { PmsJobEventModel } from "../../../models/PmsJobEventModel";
import { generatePresignedUrl } from "../../../utils/core/s3";
import { finalizePmsJob } from "./pms-finalize.service";
import { restartMonthlyAgents } from "./pms-retry.service";
import { assertNoActivePmsAutomation } from "./pms-mutation-guard.service";
import { convertFileToJson } from "../pms-utils/file-converter.util";
import { extractMonthEntriesFromResponse } from "../pms-utils/pms-normalizer.util";
import { diffMonthFields } from "../pms-utils/pms-response-log-diff.util";
import { resolveMapping } from "../../../utils/pms/resolveColumnMapping";
import { applyMapping } from "../../../utils/pms/applyColumnMapping";
import { signHeaders } from "../../../utils/pms/headerSignature";
import {
  presentPmsFile,
  presentPmsFileDetail,
  type PmsFileMonthSlot,
} from "../pms-utils/pms-file-manager-presenter";

type FileManagerContext = {
  organizationId: number; locationId?: number | null; actorUserId?: number | null;
};

type MonthOwner = {
  month: string;
  jobId: number;
  fileName: string | null;
  timestamp: Date | string;
};

export async function listFiles(context: FileManagerContext) {
  const jobs = await PmsJobModel.listForFileManager(
    context.organizationId,
    context.locationId
  );
  const activeByMonth = buildActiveMonthMap(jobs);
  const activeMonthsByJob = groupActiveMonthsByJob(activeByMonth);

  return {
    files: jobs.map((job) =>
      presentPmsFile(job, activeMonthsByJob.get(job.id) ?? new Set())
    ),
    monthSlots: buildMonthSlots(activeByMonth),
  };
}

export async function getFileDetail(jobId: number, context: FileManagerContext) {
  const job = await findScopedJob(jobId, context);
  const events = await PmsJobEventModel.listForJob(jobId);
  const jobs = await PmsJobModel.listForFileManager(
    context.organizationId,
    context.locationId
  );
  const activeMonthsByJob = groupActiveMonthsByJob(buildActiveMonthMap(jobs));

  return {
    file: presentPmsFileDetail(
      job,
      events,
      activeMonthsByJob.get(job.id) ?? new Set()
    ),
  };
}

export async function previewConflicts(
  months: string[],
  context: FileManagerContext
) {
  const jobs = await PmsJobModel.listForFileManager(
    context.organizationId,
    context.locationId
  );
  const activeByMonth = buildActiveMonthMap(jobs);
  const uniqueIncoming = [...new Set(months.filter(Boolean))].sort();

  return {
    incomingMonths: uniqueIncoming,
    supersededMonths: uniqueIncoming
      .map((month) => activeByMonth.get(month))
      .filter((owner): owner is MonthOwner => Boolean(owner)),
    monthSlots: buildMonthSlots(activeByMonth),
  };
}

export async function previewUploadFile(
  file: Express.Multer.File,
  context: FileManagerContext
) {
  const rows = await convertFileToJson(file);
  if (!Array.isArray(rows) || rows.length === 0) {
    throw Object.assign(new Error("Uploaded file produced no rows."), {
      statusCode: 400,
    });
  }

  const headers = Object.keys(rows[0] ?? {});
  if (headers.length === 0) {
    throw Object.assign(new Error("Uploaded file has no columns."), {
      statusCode: 400,
    });
  }

  const headerSignature = signHeaders(headers);
  const resolved = await resolveMapping(
    context.organizationId,
    headers,
    rows.slice(0, 10) as Record<string, unknown>[]
  );
  const monthlyRollup = applyMapping(
    rows as Record<string, unknown>[],
    resolved.mapping
  );
  const months = monthlyRollup.map((entry) => entry.month).filter(Boolean);
  const conflicts = await previewConflicts(months, context);

  return {
    originalFileName: file.originalname,
    recordsProcessed: rows.length,
    mappingSource: resolved.source,
    headerSignature,
    monthlyRollup,
    ...conflicts,
  };
}

export async function getDownloadUrl(jobId: number, context: FileManagerContext) {
  const job = await findScopedJob(jobId, context);

  if (!job.original_file_s3_key || !job.original_file_name) {
    throw Object.assign(new Error("This PMS job has no original file saved."), {
      statusCode: 404,
    });
  }

  const expiresInSeconds = 3600;
  const url = await generatePresignedUrl(
    job.original_file_s3_key,
    expiresInSeconds,
    job.original_file_name
  );

  return { url, expiresInSeconds };
}

export async function updateFileData(
  jobId: number,
  responseLog: Record<string, unknown>,
  context: FileManagerContext
) {
  const job = await findScopedJob(jobId, context);
  await assertNoActivePmsAutomation(context.organizationId, job.location_id);

  const changes = diffMonthFields(job.response_log, responseLog);
  await db.transaction(async (trx) => {
    await PmsJobModel.updateById(jobId, { response_log: responseLog }, trx);
    await PmsJobEventModel.create(
      {
        pms_job_id: jobId,
        actor_user_id: context.actorUserId ?? null,
        event_type: "data_edited",
        metadata: {
          changes,
          touchedMonths: [...new Set(changes.map((change) => change.month))],
        },
      },
      trx
    );
  });

  await rerunMonthlyAgents(job);
  return getFileDetail(jobId, context);
}

export async function softDeleteFile(
  jobId: number,
  reason: string | null,
  context: FileManagerContext
) {
  const job = await findScopedJob(jobId, context);
  await assertNoActivePmsAutomation(context.organizationId, job.location_id);

  await db.transaction(async (trx) => {
    await PmsJobModel.updateById(
      jobId,
      {
        deleted_at: new Date(),
        deleted_by_user_id: context.actorUserId ?? null,
        deleted_reason: reason,
      },
      trx
    );
    await PmsJobEventModel.create(
      {
        pms_job_id: jobId,
        actor_user_id: context.actorUserId ?? null,
        event_type: "file_deleted",
        metadata: { reason },
      },
      trx
    );
  });

  await rerunMonthlyAgents({ ...job, deleted_at: new Date() });
  return { deleted: true };
}

async function findScopedJob(jobId: number, context: FileManagerContext) {
  const job = await PmsJobModel.findForOrganizationLocation(
    jobId,
    context.organizationId,
    context.locationId
  );
  if (!job) {
    throw Object.assign(new Error("PMS file not found."), { statusCode: 404 });
  }
  return job;
}

function buildActiveMonthMap(jobs: IPmsJob[]) {
  const activeByMonth = new Map<string, MonthOwner>();

  for (const job of jobs) {
    if (job.deleted_at || !job.is_approved) continue;

    for (const entry of extractMonthEntriesFromResponse(job.response_log)) {
      const month = entry.month?.trim();
      if (!month) continue;

      const existing = activeByMonth.get(month);
      if (!existing || new Date(job.timestamp) > new Date(existing.timestamp)) {
        activeByMonth.set(month, {
          month,
          jobId: job.id,
          fileName: job.original_file_name ?? null,
          timestamp: job.timestamp,
        });
      }
    }
  }

  return activeByMonth;
}

function groupActiveMonthsByJob(activeByMonth: Map<string, MonthOwner>) {
  const grouped = new Map<number, Set<string>>();
  for (const owner of activeByMonth.values()) {
    const months = grouped.get(owner.jobId) ?? new Set<string>();
    months.add(owner.month);
    grouped.set(owner.jobId, months);
  }
  return grouped;
}

function buildMonthSlots(activeByMonth: Map<string, MonthOwner>): PmsFileMonthSlot[] {
  const sortedMonths = [...activeByMonth.keys()].filter(isValidYm).sort();
  if (sortedMonths.length === 0) return [];

  const latestMonth = sortedMonths[sortedMonths.length - 1];
  const firstCandidate =
    sortedMonths.length > 12 ? addMonths(latestMonth, -11) : sortedMonths[0];

  const slots: PmsFileMonthSlot[] = [];
  for (let month = firstCandidate; month <= latestMonth; month = addMonths(month, 1)) {
    const owner = activeByMonth.get(month);
    slots.push({
      month,
      status: owner ? "active" : "missing",
      jobId: owner?.jobId ?? null,
      fileName: owner?.fileName ?? null,
    });
  }
  return slots.slice(-12);
}

async function rerunMonthlyAgents(job: IPmsJob) {
  const detail = job.automation_status_detail as { status?: string } | null;
  if (detail?.status === "completed") {
    await restartMonthlyAgents(job.id);
    return;
  }

  await finalizePmsJob(job.id, {
    organizationId: job.organization_id,
    locationId: job.location_id,
    pmsParserStatus: "completed",
  });
}

function isValidYm(month: string) {
  return /^\d{4}-\d{2}$/.test(month);
}

function addMonths(ym: string, delta: number): string {
  const [year, month] = ym.split("-").map(Number);
  const totalMonths = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = (totalMonths % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}
