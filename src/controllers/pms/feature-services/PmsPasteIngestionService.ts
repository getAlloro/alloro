import { BaseModel } from "../../../models/BaseModel";
import { PmsColumnMappingModel } from "../../../models/PmsColumnMappingModel";
import { PmsJobEventModel } from "../../../models/PmsJobEventModel";
import { PmsJobModel } from "../../../models/PmsJobModel";
import { OrganizationLifecycleService } from "../../../services/OrganizationLifecycleService";
import type { MonthlyRollupForJob } from "../../../utils/pms/applyColumnMapping";
import { resolveLocationId } from "../../../utils/locationResolver";
import { PmsParserRouterService } from "./PmsParserRouterService";
import { buildPersistedPmsParserMetadata } from "../pms-utils/pms-parser-persistence.util";
import { assertNoActivePmsAutomation } from "../pms-services/pms-mutation-guard.service";
import { finalizePmsJob } from "../pms-services/pms-finalize.service";
import { diffMonthFields } from "../pms-utils/pms-response-log-diff.util";

interface PreviewPasteInput {
  organizationId: number;
  rawText: string;
  fallbackMonth: string;
  targetMonth?: string;
}

interface CreatePasteUploadInput extends PreviewPasteInput {
  actorUserId: number | null;
  domain?: string;
  locationId?: number | null;
  monthlyDataOverride?: MonthlyRollupForJob;
}

export async function previewPaste(input: PreviewPasteInput) {
  return PmsParserRouterService.parsePaste({
    organizationId: input.organizationId,
    rawText: input.rawText,
    fallbackMonth: input.fallbackMonth,
    targetMonth: input.targetMonth,
  });
}

export async function createPasteUpload(input: CreatePasteUploadInput) {
  await OrganizationLifecycleService.assertActive(input.organizationId);
  const locationId =
    input.locationId ?? (await resolveLocationId(input.organizationId));
  await assertNoActivePmsAutomation(input.organizationId, locationId);

  const parsed = await previewPaste(input);
  const originalMonthlyRollup = parsed.monthlyRollup;
  const monthlyRollup = input.monthlyDataOverride ?? originalMonthlyRollup;
  assertTargetMonthScope(monthlyRollup, input.targetMonth);

  let columnMappingId: number | null = null;
  if (parsed.mappingMetadata) {
    const mapping = await PmsColumnMappingModel.upsertOrgMapping(
      input.organizationId,
      parsed.mappingMetadata.signature,
      parsed.mappingMetadata.mapping,
    );
    columnMappingId = mapping.id;
  }

  const parserMetadata = buildPersistedPmsParserMetadata(parsed);
  const parserSource = parsed.mappingMetadata?.source ?? parsed.parserType;
  const originalResponseLog = {
    monthly_rollup: originalMonthlyRollup,
    entry_type: "paste",
    mapping_source: parserSource,
    ...(parsed.mappingMetadata
      ? { header_signature: parsed.mappingMetadata.signature }
      : {}),
    parser_metadata: parserMetadata,
    parser_warnings: parsed.warnings,
  };
  const responseLog = input.monthlyDataOverride
    ? {
        ...originalResponseLog,
        monthly_rollup: monthlyRollup,
        mapping_source: "user-edited-paste",
        original_mapping_source: parserSource,
      }
    : originalResponseLog;
  const uploadChanges = input.monthlyDataOverride
    ? diffMonthFields(originalResponseLog, responseLog)
    : [];

  const job = await BaseModel.transaction(async (trx) => {
    const created = await PmsJobModel.create(
      {
        time_elapsed: 0,
        status: "approved",
        response_log: responseLog,
        original_response_log: originalResponseLog,
        raw_input_data: {
          rows: parsed.rawRows,
          parser_type: parsed.parserType,
          ...(input.targetMonth ? { target_month: input.targetMonth } : {}),
        },
        organization_id: input.organizationId,
        location_id: locationId,
        column_mapping_id: columnMappingId,
        uploaded_by_user_id: input.actorUserId,
        is_approved: true,
        is_client_approved: true,
      },
      trx,
    );

    await PmsJobEventModel.create(
      {
        pms_job_id: created.id,
        actor_user_id: input.actorUserId,
        event_type: "paste_uploaded",
        metadata: {
          parserType: parsed.parserType,
          rowsProcessed: parsed.rawRows.length,
          months: monthlyRollup.map((entry) => entry.month).filter(Boolean),
          monthCount: monthlyRollup.length,
          mappingSource: parserSource,
        },
      },
      trx,
    );

    if (uploadChanges.length > 0) {
      await PmsJobEventModel.create(
        {
          pms_job_id: created.id,
          actor_user_id: input.actorUserId,
          event_type: "data_edited",
          metadata: {
            changes: uploadChanges,
            touchedMonths: [
              ...new Set(uploadChanges.map((change) => change.month)),
            ],
            source: "paste_modal",
          },
        },
        trx,
      );
    }

    return created;
  });

  await finalizePmsJob(job.id, {
    organizationId: input.organizationId,
    locationId,
    domain: input.domain,
    pmsParserStatus: "completed",
  });

  return {
    jobId: job.id,
    recordsProcessed: parsed.rawRows.length,
    recordsStored: parsed.rawRows.length,
    entryType: "paste" as const,
    parserType: parsed.parserType,
  };
}

function assertTargetMonthScope(
  monthlyRollup: MonthlyRollupForJob,
  targetMonth?: string,
): void {
  if (!targetMonth) return;
  if (
    monthlyRollup.length === 0 ||
    monthlyRollup.some((entry) => entry.month !== targetMonth)
  ) {
    throw Object.assign(
      new Error(
        `Paste data must contain only the selected month ${targetMonth}.`,
      ),
      { statusCode: 400 },
    );
  }
}
