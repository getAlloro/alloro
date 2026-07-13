import { PmsJobModel } from "../../../models/PmsJobModel";
import { PmsJobEventModel } from "../../../models/PmsJobEventModel";
import { PmsColumnMappingModel } from "../../../models/PmsColumnMappingModel";
import { BaseModel } from "../../../models/BaseModel";
import { resolveMapping } from "../../../utils/pms/resolveColumnMapping";
import {
  applyMapping,
  type MonthlyRollupForJob,
} from "../../../utils/pms/applyColumnMapping";
import { signHeaders } from "../../../utils/pms/headerSignature";
import { resolveLocationId } from "../../../utils/locationResolver";
import type { ColumnMapping } from "../../../types/pmsMapping";
import * as pasteParseService from "./pms-paste-parse.service";
import { finalizePmsJob } from "./pms-finalize.service";
import { assertNoActivePmsAutomation } from "./pms-mutation-guard.service";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { resolvePmsParserType } from "../../../config/pmsParserRegistry";
import logger from "../../../lib/logger";

/** A 400-mapped validation/business-rule failure. */
function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}

async function assertDefaultParser(organizationId: number): Promise<void> {
  const organization = await OrganizationModel.findPmsTypeById(organizationId);
  if (!organization) {
    throw Object.assign(new Error("Organization not found."), {
      statusCode: 404,
    });
  }

  if (
    resolvePmsParserType(organization.pms_type, organizationId) !== "default"
  ) {
    throw Object.assign(
      new Error(
        "Column mapping is unavailable because this organization uses a custom PMS parser."
      ),
      { statusCode: 409, code: "PMS_CUSTOM_PARSER_MAPPING_DISABLED" }
    );
  }
}

/**
 * Shape returned by the preview endpoint. `parsedPreview` is wrapped in the
 * frontend's `{ monthly_rollup: [...] }` envelope (or null on apply failure);
 * `mappingError` is surfaced inline (HTTP 200) so the side drawer can render
 * its warning state rather than treating it as a request failure.
 */
export interface PreviewMappingResult {
  mapping: ColumnMapping;
  source: "org-cache" | "global-library" | "ai-inference";
  confidence: number;
  signature: string;
  requireConfirmation: boolean;
  parsedPreview: { monthly_rollup: MonthlyRollupForJob } | null;
  dataQualityFlags?: string[];
  mappingError?: string;
}

/**
 * Resolve a column-mapping preview for the given file shape.
 *
 * Two paths:
 *   - Override: the user edited the mapping in the drawer and re-processed.
 *     Skip the resolver chain, apply the supplied mapping directly, and (on
 *     success) clone-on-confirm it into the org cache so the next upload of
 *     the same signature applies silently.
 *   - Default: run the three-tier resolver chain (org-cache → global-library
 *     → AI inference) and apply the resolved mapping to the sample rows.
 *
 * Mapping-apply failures are returned via `mappingError` (caller responds 200),
 * not thrown. Hard validation failures throw with `statusCode`.
 */
export async function buildPreviewMapping(args: {
  headers: string[];
  sampleRows: Record<string, unknown>[];
  organizationId: number;
  overrideMapping?: unknown;
}): Promise<PreviewMappingResult> {
  const { headers, sampleRows, organizationId, overrideMapping } = args;
  await assertDefaultParser(organizationId);

  // Override path: user edited the mapping in the drawer and clicked Re-process.
  // Skip the resolver chain — apply the supplied mapping directly to sample rows.
  if (overrideMapping) {
    if (
      typeof overrideMapping !== "object" ||
      !Array.isArray((overrideMapping as ColumnMapping).headers) ||
      !Array.isArray((overrideMapping as ColumnMapping).assignments)
    ) {
      throw badRequest(
        "overrideMapping must be a ColumnMapping with headers[] and assignments[]"
      );
    }

    let parsedPreview: MonthlyRollupForJob | null = null;
    let mappingError: string | undefined;
    const dataQualityFlags: string[] = [];
    try {
      parsedPreview = applyMapping(
        sampleRows,
        overrideMapping as ColumnMapping,
        dataQualityFlags
      );
    } catch (err) {
      mappingError =
        err instanceof Error
          ? err.message
          : "Could not apply mapping to preview rows";
    }

    // Clone-on-confirm: when the user re-processes their edited mapping
    // and applyMapping succeeds, persist it to the org's cache. Subsequent
    // uploads of the same file shape will hit org-cache (Tier 1) and
    // silently apply the saved mapping. Matches the spec D2 intent for
    // "save" semantics on the Re-process button.
    const signature = signHeaders(headers);
    let cacheSource: "org-cache" | "ai-inference" = "ai-inference";
    if (parsedPreview !== null && !mappingError) {
      try {
        await PmsColumnMappingModel.upsertOrgMapping(
          organizationId,
          signature,
          overrideMapping as ColumnMapping
        );
        cacheSource = "org-cache";
        logger.info(
          {
            detail: JSON.stringify({
              event: "org-cache-write",
              orgId: organizationId,
              signatureHash: signature,
              source: "user-override",
            }),
          },
          "[pms-mapping]"
        );
      } catch (cacheErr: any) {
        logger.warn(
          { detail: cacheErr?.message || cacheErr },
          "[pms-mapping] org-cache write failed:"
        );
        // Non-fatal — preview still works, user just won't get silent apply
        // on the next upload.
      }
    }

    return {
      mapping: overrideMapping as ColumnMapping,
      source: cacheSource,
      confidence: 1.0,
      signature,
      requireConfirmation: false,
      parsedPreview:
        parsedPreview === null ? null : { monthly_rollup: parsedPreview },
      ...(dataQualityFlags.length ? { dataQualityFlags } : {}),
      ...(mappingError ? { mappingError } : {}),
    };
  }

  const resolved = await resolveMapping(organizationId, headers, sampleRows);

  let parsedPreview: MonthlyRollupForJob | null = null;
  let mappingError: string | undefined;
  const dataQualityFlags: string[] = [];
  try {
    parsedPreview = applyMapping(sampleRows, resolved.mapping, dataQualityFlags);
  } catch (err) {
    mappingError =
      err instanceof Error
        ? err.message
        : "Could not apply mapping to preview rows";
    parsedPreview = null;
  }

  return {
    mapping: resolved.mapping,
    source: resolved.source,
    confidence: resolved.confidence,
    signature: resolved.signature,
    requireConfirmation: resolved.requireConfirmation ?? false,
    parsedPreview:
      parsedPreview === null ? null : { monthly_rollup: parsedPreview },
    ...(dataQualityFlags.length ? { dataQualityFlags } : {}),
    ...(mappingError ? { mappingError } : {}),
  };
}

/**
 * Persist a user-confirmed mapping and create an approved `pms_jobs` row from
 * the supplied rows (or pasted text). Clone-on-confirm upserts the mapping into
 * the org cache, applies it to produce `monthly_rollup`, creates the job + an
 * audit event inside a transaction, then hands off to `finalizePmsJob` (skips
 * admin/client approval; fires monthly_agents immediately).
 */
export async function createMappedUpload(args: {
  mapping: ColumnMapping;
  organizationId: number;
  actorUserId: number | null;
  rows?: unknown;
  pasteText?: unknown;
  month?: string;
  domain?: string;
  locationId?: unknown;
}): Promise<{ jobId: number; mappingId: number; monthlyRollup: MonthlyRollupForJob }> {
  const { mapping, organizationId, actorUserId, month, domain } = args;
  await assertDefaultParser(organizationId);

  let rows: Record<string, unknown>[] = [];
  if (Array.isArray(args.rows)) {
    rows = args.rows as Record<string, unknown>[];
  } else if (typeof args.pasteText === "string" && args.pasteText.length > 0) {
    const tokenized = pasteParseService.pasteTextToRecords(args.pasteText);
    rows = tokenized.rows as unknown as Record<string, unknown>[];
  } else {
    throw badRequest("Either `rows` (array) or `pasteText` (string) is required");
  }

  if (rows.length === 0) {
    throw badRequest("No data rows provided");
  }

  const headers =
    Array.isArray(mapping.headers) && mapping.headers.length > 0
      ? mapping.headers
      : Object.keys(rows[0] ?? {});
  const signature = signHeaders(headers);

  let monthlyRollup: MonthlyRollupForJob;
  try {
    monthlyRollup = applyMapping(rows, mapping);
  } catch (err) {
    throw badRequest(
      err instanceof Error ? err.message : "Could not apply mapping to rows"
    );
  }

  // Clone-on-confirm: persist this mapping into the org cache.
  const upserted = await PmsColumnMappingModel.upsertOrgMapping(
    organizationId,
    signature,
    mapping
  );
  const mappingId = upserted.id;

  const passedLocationId =
    typeof args.locationId === "number"
      ? args.locationId
      : typeof args.locationId === "string" && args.locationId
        ? parseInt(args.locationId, 10)
        : null;
  const locationId =
    passedLocationId && !isNaN(passedLocationId)
      ? passedLocationId
      : await resolveLocationId(organizationId);

  await assertNoActivePmsAutomation(organizationId, locationId);

  const responseLog = {
    monthly_rollup: monthlyRollup,
    mapping_source: "user-confirmed",
    header_signature: signature,
  };

  const job = await BaseModel.transaction(async (trx) => {
    const created = await PmsJobModel.create(
      {
        time_elapsed: 0,
        status: "approved",
        organization_id: organizationId,
        location_id: locationId,
        is_approved: true,
        is_client_approved: true,
        uploaded_by_user_id: actorUserId,
        raw_input_data: {
          rows,
          headers,
          signature,
          ...(month ? { month } : {}),
        } as Record<string, unknown>,
        response_log: responseLog,
        original_response_log: responseLog,
        column_mapping_id: mappingId,
      } as any,
      trx
    );

    await PmsJobEventModel.create(
      {
        pms_job_id: created.id,
        actor_user_id: actorUserId,
        event_type: "mapped_upload_created",
        metadata: {
          months: monthlyRollup.map((entry) => entry.month).filter(Boolean),
          monthCount: monthlyRollup.length,
          mappingSource: "user-confirmed",
          headerSignature: signature,
        },
      },
      trx
    );

    return created;
  });

  if (!job.id) {
    throw new Error("Failed to create PMS job record");
  }

  await finalizePmsJob(job.id, {
    organizationId,
    locationId,
    domain,
    pmsParserStatus: "completed",
  });

  return {
    jobId: job.id,
    mappingId,
    monthlyRollup,
  };
}

/**
 * Re-apply a new mapping to an existing job's raw rows, upsert the mapping into
 * the org cache, and update the job in place (no new `pms_jobs` row). Enforces
 * org ownership and rejects pre-mapping-system jobs that lack stored raw rows.
 * Throws `statusCode`-tagged errors (404 not-found, 403 access-denied, 400).
 */
export async function reprocessJobWithMapping(args: {
  jobId: number;
  mapping: ColumnMapping;
  organizationId: number;
}): Promise<{ jobId: number; mappingId: number; monthlyRollup: MonthlyRollupForJob }> {
  const { jobId, mapping, organizationId } = args;
  await assertDefaultParser(organizationId);

  const job = await PmsJobModel.findById(jobId);
  if (!job) {
    throw Object.assign(new Error("PMS job not found"), { statusCode: 404 });
  }

  if (job.organization_id && job.organization_id !== organizationId) {
    throw Object.assign(new Error("No access to this job"), { statusCode: 403 });
  }

  const raw = job.raw_input_data as
    | { rows?: Record<string, unknown>[]; headers?: string[]; signature?: string }
    | null;
  const rawRows = Array.isArray(raw?.rows)
    ? (raw!.rows as Record<string, unknown>[])
    : null;
  if (!rawRows || rawRows.length === 0) {
    throw badRequest(
      "This job pre-dates the mapping system and cannot be re-processed."
    );
  }

  let monthlyRollup: MonthlyRollupForJob;
  try {
    monthlyRollup = applyMapping(rawRows, mapping);
  } catch (err) {
    throw badRequest(
      err instanceof Error ? err.message : "Could not apply mapping to job rows"
    );
  }

  const headers =
    raw?.headers && raw.headers.length > 0
      ? raw.headers
      : Array.isArray(mapping.headers) && mapping.headers.length > 0
        ? mapping.headers
        : Object.keys(rawRows[0] ?? {});
  const signature = raw?.signature ?? signHeaders(headers);

  const upserted = await PmsColumnMappingModel.upsertOrgMapping(
    organizationId,
    signature,
    mapping
  );
  const mappingId = upserted.id;

  await PmsJobModel.updateById(jobId, {
    response_log: {
      monthly_rollup: monthlyRollup,
      mapping_source: "user-reprocessed",
      header_signature: signature,
    },
    column_mapping_id: mappingId,
  } as any);

  return {
    jobId,
    mappingId,
    monthlyRollup,
  };
}

/**
 * Return the org's cached mapping for a header signature, falling through to
 * the global library on a miss. Returns null when neither tier has a hit.
 */
export async function getCachedMappingForSignature(args: {
  signature: string;
  organizationId: number;
}): Promise<
  | {
      mapping: ColumnMapping;
      source: "org-cache" | "global-library";
      requireConfirmation: boolean | undefined;
    }
  | null
> {
  const { signature, organizationId } = args;
  await assertDefaultParser(organizationId);

  const orgHit = await PmsColumnMappingModel.findByOrgAndSignature(
    organizationId,
    signature
  );
  if (orgHit) {
    return {
      mapping: orgHit.mapping,
      source: "org-cache",
      requireConfirmation: orgHit.require_confirmation,
    };
  }

  const globalHit = await PmsColumnMappingModel.findGlobalBySignature(signature);
  if (globalHit) {
    return {
      mapping: globalHit.mapping,
      source: "global-library",
      requireConfirmation: globalHit.require_confirmation,
    };
  }

  return null;
}
