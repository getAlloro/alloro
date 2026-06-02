import { PmsJobModel } from "../../../models/PmsJobModel";
import { PmsColumnMappingModel } from "../../../models/PmsColumnMappingModel";
import { convertFileToJson } from "../pms-utils/file-converter.util";
import { resolveLocationId } from "../../../utils/locationResolver";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { resolveMapping } from "../../../utils/pms/resolveColumnMapping";
import { applyMapping } from "../../../utils/pms/applyColumnMapping";
import { signHeaders } from "../../../utils/pms/headerSignature";
import { finalizePmsJob } from "./pms-finalize.service";
import { OrganizationLifecycleService } from "../../../services/OrganizationLifecycleService";

/**
 * Process a manual PMS data entry.
 * Skips parsing and approvals, auto-triggers monthly agents.
 * @param authOrganizationId - Organization ID from JWT/RBAC (authoritative). Falls back to domain lookup if null.
 */
export async function processManualEntry(
  domain: string,
  parsedManualData: any[],
  authOrganizationId?: number | null,
  passedLocationId?: number | null
) {
  // Use authenticated org ID if available, fall back to domain lookup for backward compat
  let organizationId = authOrganizationId ?? null;
  if (!organizationId) {
    const org = await OrganizationModel.findByDomain(domain);
    organizationId = org?.id ?? null;
  }

  console.log(
    `[PMS] Manual entry received for domain: ${domain}, orgId: ${organizationId}, months: ${parsedManualData.length}`
  );

  if (organizationId) {
    await OrganizationLifecycleService.assertActive(organizationId);
  }

  // Use passed locationId if available, otherwise resolve from org
  const locationId = passedLocationId ?? await resolveLocationId(organizationId);

  // Create job record with manual entry data
  const job = await PmsJobModel.create({
    time_elapsed: 0,
    status: "approved",
    response_log: {
      monthly_rollup: parsedManualData,
      entry_type: "manual",
    },
    organization_id: organizationId,
    location_id: locationId,
    is_approved: true,
    is_client_approved: true,
  } as any);

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
 * Process a file upload (CSV, XLS, XLSX, TXT).
 *
 * Pipeline (post-mapping-system):
 *   1. Convert file → JSON rows (records keyed by header).
 *   2. Resolve a column mapping via the resolver chain
 *      (org-cache → global-library → AI inference).
 *   3. Apply the mapping inline to produce `monthly_rollup`.
 *   4. Persist the mapping into the org's cache (clone-on-confirm) so
 *      subsequent uploads of the same signature are silent.
 *   5. Create an approved `pms_jobs` row with raw rows + parsed rollup
 *      pre-attached.
 *   6. Hand off to `finalizePmsJob` — skips admin/client approval
 *      (the client already reviewed via the column-mapping drawer)
 *      and fires monthly_agents immediately.
 *
 * NOTE: n8n PMS parsing webhook removed — parsing now handled inline via
 * resolveMapping + applyMapping. See plan
 * 04272026-no-ticket-pms-column-mapping-ai-inference.
 *
 * @param authOrganizationId - Organization ID from JWT/RBAC (authoritative).
 *   Falls back to domain lookup if null.
 */
export async function processFileUpload(
  file: Express.Multer.File,
  domain: string,
  authOrganizationId?: number | null,
  passedLocationId?: number | null
) {
  const jsonData = await convertFileToJson(file);
  const recordsProcessed = jsonData.length;

  // Use authenticated org ID if available, fall back to domain lookup for backward compat
  let organizationId = authOrganizationId ?? null;
  if (!organizationId) {
    const org = await OrganizationModel.findByDomain(domain);
    organizationId = org?.id ?? null;
  }
  // Use passed locationId if available, otherwise resolve from org
  const locationId =
    passedLocationId ?? (await resolveLocationId(organizationId));

  if (!Array.isArray(jsonData) || jsonData.length === 0) {
    throw Object.assign(new Error("Uploaded file produced no rows"), {
      statusCode: 400,
    });
  }

  if (organizationId) {
    await OrganizationLifecycleService.assertActive(organizationId);
  }

  const headers = Object.keys(jsonData[0] ?? {});
  if (headers.length === 0) {
    throw Object.assign(new Error("Uploaded file has no columns"), {
      statusCode: 400,
    });
  }

  const signature = signHeaders(headers);

  // -----------------------------------------------------------------
  // Resolve mapping (org-cache → global-library → AI inference).
  // Resolver expects a numeric orgId; if we couldn't determine one we
  // pass a sentinel that misses every org-cache and proceeds to library + AI.
  // -----------------------------------------------------------------
  const effectiveOrgId = organizationId ?? -1;
  const resolved = await resolveMapping(
    effectiveOrgId,
    headers,
    jsonData.slice(0, 10) as Record<string, unknown>[]
  );

  // Apply mapping inline → monthly_rollup.
  let monthlyRollup;
  try {
    monthlyRollup = applyMapping(
      jsonData as Record<string, unknown>[],
      resolved.mapping
    );
  } catch (err) {
    // Invalid mapping (both/neither of source/referring_practice mapped).
    // Surface a 400 so the UI can prompt the user to fix the mapping via
    // /pms/jobs/:id/reprocess (after they've confirmed the upload) — but
    // since we haven't created a job yet, we just bail here.
    throw Object.assign(
      new Error(
        err instanceof Error
          ? err.message
          : "Could not apply column mapping to uploaded file."
      ),
      { statusCode: 400 }
    );
  }

  // Clone-on-confirm: upsert mapping into the org's cache so subsequent
  // uploads of the same signature from this org are silent. Only run when
  // we have a real org context.
  let columnMappingId: number | null = null;
  if (organizationId) {
    try {
      const upserted = await PmsColumnMappingModel.upsertOrgMapping(
        organizationId,
        signature,
        resolved.mapping
      );
      columnMappingId = upserted.id;
    } catch (err) {
      console.warn(
        `[PMS] Failed to upsert org mapping for org=${organizationId} signature=${signature}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // Create the approved job record with parsed rollup already attached.
  const job = await PmsJobModel.create({
    time_elapsed: 0,
    status: "approved",
    response_log: {
      monthly_rollup: monthlyRollup,
      mapping_source: resolved.source,
      header_signature: signature,
    },
    raw_input_data: {
      rows: jsonData,
      headers,
      signature,
    } as Record<string, unknown>,
    organization_id: organizationId,
    location_id: locationId,
    column_mapping_id: columnMappingId,
    is_approved: true,
    is_client_approved: true,
  } as any);

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
    jobId,
    originalName: file.originalname,
  };
}
