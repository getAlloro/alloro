import { PmsJobModel } from "../../../models/PmsJobModel";
import { PmsColumnMappingModel } from "../../../models/PmsColumnMappingModel";
import { resolveLocationId } from "../../../utils/locationResolver";
import { OrganizationModel } from "../../../models/OrganizationModel";
import type { MonthlyRollupForJob } from "../../../utils/pms/applyColumnMapping";
import { finalizePmsJob } from "./pms-finalize.service";
import { OrganizationLifecycleService } from "../../../services/OrganizationLifecycleService";
import { uploadToS3, deleteFromS3 } from "../../../utils/core/s3";
import { buildPmsFileS3Key } from "../pms-utils/pms-file-storage.util";
import { PmsJobEventModel } from "../../../models/PmsJobEventModel";
import { assertNoActivePmsAutomation } from "./pms-mutation-guard.service";
import { BaseModel } from "../../../models/BaseModel";
import { diffMonthFields } from "../pms-utils/pms-response-log-diff.util";
import { PmsParserRouterService } from "../feature-services/PmsParserRouterService";
import { buildPersistedPmsParserMetadata } from "../pms-utils/pms-parser-persistence.util";
import logger from "../../../lib/logger";

/**
 * Process a manual PMS data entry.
 * Skips parsing and approvals, auto-triggers monthly agents.
 * @param authOrganizationId - Organization ID from JWT/RBAC (authoritative). Falls back to domain lookup if null.
 */
export async function processManualEntry(
  domain: string,
  parsedManualData: any[],
  authOrganizationId?: number | null,
  passedLocationId?: number | null,
  actorUserId?: number | null
) {
  // Use authenticated org ID if available, fall back to domain lookup for backward compat
  let organizationId = authOrganizationId ?? null;
  if (!organizationId) {
    const org = await OrganizationModel.findByDomain(domain);
    organizationId = org?.id ?? null;
  }

  logger.info(
    `[PMS] Manual entry received for domain: ${domain}, orgId: ${organizationId}, months: ${parsedManualData.length}`
  );

  if (organizationId) {
    await OrganizationLifecycleService.assertActive(organizationId);
  }

  // Use passed locationId if available, otherwise resolve from org
  const locationId = passedLocationId ?? await resolveLocationId(organizationId);
  await assertNoActivePmsAutomation(organizationId, locationId);

  const responseLog = {
    monthly_rollup: parsedManualData,
    entry_type: "manual",
  };

  const job = await BaseModel.transaction(async (trx) => {
    const created = await PmsJobModel.create(
      {
        time_elapsed: 0,
        status: "approved",
        response_log: responseLog,
        original_response_log: responseLog,
        organization_id: organizationId,
        location_id: locationId,
        uploaded_by_user_id: actorUserId ?? null,
        is_approved: true,
        is_client_approved: true,
      } as any,
      trx
    );

    await PmsJobEventModel.create(
      {
        pms_job_id: created.id,
        actor_user_id: actorUserId ?? null,
        event_type: "manual_entry_created",
        metadata: {
          months: parsedManualData.map((entry) => entry?.month).filter(Boolean),
          monthCount: parsedManualData.length,
        },
      },
      trx
    );

    return created;
  });

  const jobId = job.id;

  if (!jobId) {
    throw new Error("Failed to create PMS job record");
  }

  await finalizePmsJob(jobId, {
    organizationId,
    locationId,
    domain,
    pmsParserStatus: "skipped",
    pmsParserSkipMessage: "Manual entry - no parsing required",
  });

  return {
    recordsProcessed: parsedManualData.length,
    recordsStored: parsedManualData.length,
    entryType: "manual" as const,
    jobId,
  };
}

/**
 * Process a file upload (CSV, XLS, XLSX).
 *
 * Pipeline:
 *   1. Resolve the authenticated organization's PMS parser.
 *   2. Parse the full file into the shared `monthly_rollup` contract.
 *   3. Persist parser/count semantics and the raw rows.
 *   4. For the default parser only, clone the resolved mapping into the
 *      organization's cache so subsequent uploads are silent.
 *   5. Create an approved `pms_jobs` row with raw rows + parsed rollup
 *      pre-attached.
 *   6. Hand off to `finalizePmsJob` — skips admin/client approval
 *      (the client already reviewed via the column-mapping drawer)
 *      and fires monthly_agents immediately.
 *
 * @param authOrganizationId - Organization ID from JWT/RBAC (authoritative).
 *   Falls back to domain lookup if null.
 */
export async function processFileUpload(
  file: Express.Multer.File,
  domain: string,
  authOrganizationId?: number | null,
  passedLocationId?: number | null,
  actorUserId?: number | null,
  overrideMonthlyRollup?: MonthlyRollupForJob | null,
  targetMonth?: string,
) {
  // Use authenticated org ID if available, fall back to domain lookup for backward compat
  let organizationId = authOrganizationId ?? null;
  if (!organizationId) {
    const org = await OrganizationModel.findByDomain(domain);
    organizationId = org?.id ?? null;
  }
  // Use passed locationId if available, otherwise resolve from org
  const locationId =
    passedLocationId ?? (await resolveLocationId(organizationId));

  if (organizationId) {
    await OrganizationLifecycleService.assertActive(organizationId);
  }

  await assertNoActivePmsAutomation(organizationId, locationId);

  if (!organizationId) {
    throw Object.assign(new Error("Organization context is required."), {
      statusCode: 401,
    });
  }

  const parsed = await PmsParserRouterService.parseFile({
    organizationId,
    file,
    targetMonth,
  });
  const recordsProcessed = parsed.rawRows.length;
  const monthlyRollup = parsed.monthlyRollup;
  const headers = Object.keys(parsed.rawRows[0] ?? {});
  const signature = parsed.mappingMetadata?.signature;
  const mappingSource = parsed.mappingMetadata?.source ?? parsed.parserType;
  const parserMetadata = buildPersistedPmsParserMetadata(parsed);

  // Clone-on-confirm: upsert mapping into the org's cache so subsequent
  // default-parser uploads of the same signature from this org are silent.
  // Custom parsers deliberately do not create column mappings.
  let columnMappingId: number | null = null;
  if (parsed.mappingMetadata) {
    try {
      const upserted = await PmsColumnMappingModel.upsertOrgMapping(
        organizationId,
        parsed.mappingMetadata.signature,
        parsed.mappingMetadata.mapping,
      );
      columnMappingId = upserted.id;
    } catch {
      columnMappingId = null;
    }
  }

  const originalResponseLog = {
    monthly_rollup: monthlyRollup,
    mapping_source: mappingSource,
    ...(signature ? { header_signature: signature } : {}),
    parser_metadata: parserMetadata,
    selected_sheet_names: parsed.selectedSheetNames,
    parser_warnings: parsed.warnings,
  };
  const responseLog = overrideMonthlyRollup
    ? {
        ...originalResponseLog,
        monthly_rollup: overrideMonthlyRollup,
        mapping_source: "user-edited-file",
        original_mapping_source: mappingSource,
      }
    : originalResponseLog;
  const uploadChanges = overrideMonthlyRollup
    ? diffMonthFields(originalResponseLog, responseLog)
    : [];
  const s3Key = buildPmsFileS3Key(
    organizationId,
    locationId,
    file.originalname || "pms-upload",
  );
  const mimeType = file.mimetype || "application/octet-stream";

  await uploadToS3(s3Key, file.buffer, mimeType);

  let job;
  try {
    job = await BaseModel.transaction(async (trx) => {
      const created = await PmsJobModel.create(
        {
          time_elapsed: 0,
          status: "approved",
          response_log: responseLog,
          original_response_log: originalResponseLog,
          raw_input_data: {
            rows: parsed.rawRows,
            headers,
            ...(signature ? { signature } : {}),
            parser_type: parsed.parserType,
            selected_sheet_names: parsed.selectedSheetNames,
            ...(targetMonth ? { target_month: targetMonth } : {}),
          } as Record<string, unknown>,
          organization_id: organizationId,
          location_id: locationId,
          column_mapping_id: columnMappingId,
          original_file_name: file.originalname,
          original_file_mime_type: mimeType,
          original_file_size_bytes: file.size,
          original_file_s3_key: s3Key,
          uploaded_by_user_id: actorUserId ?? null,
          is_approved: true,
          is_client_approved: true,
        } as any,
        trx,
      );

      await PmsJobEventModel.create(
        {
          pms_job_id: created.id,
          actor_user_id: actorUserId ?? null,
          event_type: "file_uploaded",
          metadata: {
            filename: file.originalname,
            mimeType,
            sizeBytes: file.size,
            s3Key,
            months: (responseLog.monthly_rollup as MonthlyRollupForJob)
              .map((entry) => entry.month)
              .filter(Boolean),
            monthCount: (responseLog.monthly_rollup as MonthlyRollupForJob)
              .length,
            parserType: parsed.parserType,
            mappingSource,
            ...(signature ? { headerSignature: signature } : {}),
            selectedSheetNames: parsed.selectedSheetNames,
          },
        },
        trx,
      );

      if (uploadChanges.length > 0) {
        await PmsJobEventModel.create(
          {
            pms_job_id: created.id,
            actor_user_id: actorUserId ?? null,
            event_type: "data_edited",
            metadata: {
              changes: uploadChanges,
              touchedMonths: [
                ...new Set(uploadChanges.map((change) => change.month)),
              ],
              source: "upload_modal",
            },
          },
          trx,
        );
      }

      return created;
    });
  } catch (error) {
    await deleteFromS3(s3Key).catch(() => undefined);
    throw error;
  }

  const jobId = job.id;

  if (!jobId) {
    throw new Error("Failed to create PMS job record");
  }

  await finalizePmsJob(jobId, {
    organizationId,
    locationId,
    domain,
    pmsParserStatus: "completed",
  });

  return {
    recordsProcessed,
    recordsStored: recordsProcessed,
    entryType: "csv" as const,
    parserType: parsed.parserType,
    jobId,
    originalName: file.originalname,
  };
}
