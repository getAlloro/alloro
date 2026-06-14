import { Request, Response } from "express";
import * as uploadService from "./pms-services/pms-upload.service";
import * as approvalService from "./pms-services/pms-approval.service";
import * as automationService from "./pms-services/pms-automation.service";
import * as dataService from "./pms-services/pms-data.service";
import * as retryService from "./pms-services/pms-retry.service";
import * as pasteParseService from "./pms-services/pms-paste-parse.service";
import * as sanitizationService from "./pms-services/pms-paste-analysis.service";
import { finalizePmsJob } from "./pms-services/pms-finalize.service";
import { coerceBoolean } from "./pms-utils/pms-validator.util";
import { validateJobId } from "./pms-utils/pms-validator.util";
import { PmsStatus } from "./pms-utils/pms-constants";
import { RBACRequest } from "../../middleware/rbac";
import { PmsJobModel } from "../../models/PmsJobModel";
import { PmsJobEventModel } from "../../models/PmsJobEventModel";
import { PmsColumnMappingModel } from "../../models/PmsColumnMappingModel";
import { resolveMapping } from "../../utils/pms/resolveColumnMapping";
import {
  applyMapping,
  type MonthlyRollupForJob,
} from "../../utils/pms/applyColumnMapping";
import { signHeaders } from "../../utils/pms/headerSignature";
import type { ColumnMapping } from "../../types/pmsMapping";
import { resolveLocationId } from "../../utils/locationResolver";
import { db } from "../../database/connection";
import { assertNoActivePmsAutomation } from "./pms-services/pms-mutation-guard.service";
import logger from "../../lib/logger";

function handleError(res: Response, error: any, operation: string): Response {
  const statusCode = error.statusCode || 500;
  logger.error({ err: error?.message || error }, `[PMS] ${operation} Error:`);
  return res.status(statusCode).json({
    success: false,
    error: `Failed to ${operation.toLowerCase()}`,
    message: error?.message || "Unknown error occurred",
  });
}

function parseMonthlyRollupPayload(
  value: unknown,
  fieldName: string
): MonthlyRollupForJob {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw new Error(`Invalid ${fieldName} format - must be valid JSON`);
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`${fieldName} must be a non-empty array of month entries`);
  }

  return parsed as MonthlyRollupForJob;
}

/**
 * POST /pms/upload
 * Upload and process PMS data from CSV, XLS, or XLSX files
 * OR accept manually entered data (JSON body with entryType: 'manual')
 */
export async function uploadPmsData(req: Request, res: Response) {
  try {
    const { domain, pmsType, manualData, entryType, locationId: reqLocationId } = req.body;
    const rbacReq = req as RBACRequest;
    const organizationId = rbacReq.organizationId ?? null;
    const actorUserId = rbacReq.userId ?? rbacReq.user?.userId ?? null;
    const locationId = reqLocationId ? Number(reqLocationId) : null;

    if (!domain) {
      return res.status(400).json({
        success: false,
        error: "Missing domain parameter",
      });
    }

    // MANUAL ENTRY PATH
    if (entryType === "manual" && manualData) {
      let parsedManualData: MonthlyRollupForJob;
      try {
        parsedManualData = parseMonthlyRollupPayload(manualData, "manualData");
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          error:
            parseError instanceof Error
              ? parseError.message
              : "Invalid manualData format",
        });
      }

      const result = await uploadService.processManualEntry(
        domain,
        parsedManualData,
        organizationId,
        locationId,
        actorUserId
      );

      return res.json({
        success: true,
        data: {
          recordsProcessed: result.recordsProcessed,
          recordsStored: result.recordsStored,
          entryType: result.entryType,
          jobId: result.jobId,
        },
        message: `Manual entry received - ${result.recordsProcessed} month(s) processed. Insights are being generated.`,
      });
    }

    // FILE UPLOAD PATH
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No data file or manual entry provided",
      });
    }

    let overrideMonthlyRollup: MonthlyRollupForJob | null = null;
    if (manualData) {
      try {
        overrideMonthlyRollup = parseMonthlyRollupPayload(
          manualData,
          "manualData"
        );
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          error:
            parseError instanceof Error
              ? parseError.message
              : "Invalid manualData format",
        });
      }
    }

    const result = await uploadService.processFileUpload(
      req.file,
      domain,
      organizationId,
      locationId,
      actorUserId,
      overrideMonthlyRollup
    );

    return res.json({
      success: true,
      data: {
        recordsProcessed: result.recordsProcessed,
        recordsStored: result.recordsStored,
        entryType: result.entryType,
        jobId: result.jobId,
      },
      message: `Successfully processed file ${result.originalName} with ${result.recordsProcessed} records`,
    });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "Error in /pms/upload:");
    return res.status(error.statusCode || 500).json({
      success: false,
      error: `Failed to process PMS upload: ${error.message}`,
      code: error.code,
      data: error.activeJob ? { activeJob: error.activeJob } : undefined,
    });
  }
}

/**
 * POST /pms/summary
 * Placeholder for PMS data summary
 */
export async function getPmsSummary(req: Request, res: Response) {
  try {
    const { clientId } = req.body;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: "Missing clientId",
      });
    }

    // Placeholder response
    return res.json({
      success: true,
      data: {
        summary: {
          totalRecords: 0,
          totalProduction: 0,
          avgProduction: 0,
          earliestDate: null,
          latestDate: null,
          uniqueReferralTypes: 0,
        },
      },
      message: "Summary endpoint placeholder",
    });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "Error in /pms/summary:");
    return res.status(500).json({
      success: false,
      error: `Failed to fetch PMS summary: ${error.message}`,
    });
  }
}

/**
 * GET /pms/keyData
 * Aggregate PMS key metrics for an organization across all processed jobs.
 */
export async function getKeyData(req: Request, res: Response) {
  try {
    const organizationId = parseInt(String(req.query.organization_id), 10);

    if (!organizationId || isNaN(organizationId)) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid organization_id parameter",
      });
    }

    const locationIdRaw = req.query.location_id
      ? parseInt(String(req.query.location_id), 10)
      : undefined;
    const locationId =
      locationIdRaw !== undefined && !isNaN(locationIdRaw)
        ? locationIdRaw
        : undefined;

    const data = await dataService.aggregateKeyData(organizationId, locationId);

    return res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "Error in /pms/keyData:");
    return res.status(500).json({
      success: false,
      error: `Failed to fetch PMS key data: ${error.message}`,
    });
  }
}

/**
 * GET /pms/jobs
 * Fetch paginated PMS job records with optional filtering.
 */
export async function listJobs(req: Request, res: Response) {
  try {
    const {
      page: pageParam,
      status: statusParam,
      isApproved,
      organization_id,
      location_id,
    } = req.query;

    const page = Math.max(parseInt(String(pageParam || "1"), 10) || 1, 1);
    const statuses: PmsStatus[] = Array.isArray(statusParam)
      ? (statusParam as string[])
      : statusParam
      ? String(statusParam)
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];

    const approvedFilter = coerceBoolean(isApproved);
    const organizationFilter =
      typeof organization_id === "string" && organization_id.trim().length > 0
        ? parseInt(organization_id.trim(), 10)
        : undefined;
    const locationFilter =
      typeof location_id === "string" && location_id.trim().length > 0
        ? parseInt(location_id.trim(), 10)
        : undefined;

    const data = await dataService.listJobsPaginated(
      { statuses, approvedFilter, organizationFilter, locationFilter },
      page
    );

    return res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "Error in /pms/jobs:");
    return res.status(500).json({
      success: false,
      error: `Failed to fetch PMS jobs: ${error.message}`,
    });
  }
}

/**
 * PATCH /pms/jobs/:id/approval
 * Toggle or set the approval status of a PMS job.
 */
export async function approveJob(req: Request, res: Response) {
  try {
    const jobId = validateJobId(req.params.id);

    const requestedApproval = coerceBoolean(req.body?.isApproved);

    if (requestedApproval === undefined) {
      return res.status(400).json({
        success: false,
        error: "isApproved must be provided as a boolean value",
      });
    }

    const result = await approvalService.approveByAdmin(
      jobId,
      requestedApproval
    );

    if (!result.changed) {
      return res.json({
        success: true,
        data: { job: result.job },
        message: "PMS job approval status unchanged",
      });
    }

    return res.json({
      success: true,
      data: { job: result.job },
      message: `PMS job ${
        result.nextApprovalValue ? "approved" : "updated"
      } successfully`,
    });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "Error in /pms/jobs/:id/approval:");
    return res.status(error.statusCode || 500).json({
      success: false,
      error: `Failed to update PMS job approval: ${error.message}`,
    });
  }
}

/**
 * PATCH /pms/jobs/:id/client-approval
 * Update the client approval flag for a PMS job.
 */
export async function clientApproveJob(req: Request, res: Response) {
  try {
    const jobId = validateJobId(req.params.id);

    const clientApproval = coerceBoolean(req.body?.isClientApproved);

    if (clientApproval === undefined) {
      return res.status(400).json({
        success: false,
        error: "isClientApproved must be provided as a boolean",
      });
    }

    const result = await approvalService.approveByClient(
      jobId,
      clientApproval
    );

    return res.json({
      success: true,
      data: { job: result.job },
      message: `PMS job client approval ${
        result.clientApproval ? "confirmed" : "reset"
      } successfully`,
      toastMessage: result.clientApproval
        ? "We're now processing and setting up your action items. You'll be notified when ready!"
        : undefined,
    });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "Error in /pms/jobs/:id/client-approval:");
    return res.status(error.statusCode || 500).json({
      success: false,
      error: `Failed to update PMS job client approval: ${error.message}`,
    });
  }
}

/**
 * PATCH /pms/jobs/:id/response
 * Update the stored response log JSON for a PMS job.
 */
export async function updateResponseLog(req: Request, res: Response) {
  try {
    const jobId = validateJobId(req.params.id);

    const { responseLog } = req.body ?? {};

    if (responseLog === undefined) {
      return res.status(400).json({
        success: false,
        error: "responseLog body value is required",
      });
    }

    const job = await dataService.updateJobResponse(jobId, responseLog);

    return res.json({
      success: true,
      data: { job },
      message: "PMS job response log updated successfully",
    });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "Error in /pms/jobs/:id/response:");
    return res.status(error.statusCode || 500).json({
      success: false,
      error: `Failed to update PMS job response: ${error.message}`,
    });
  }
}

/**
 * DELETE /pms/jobs/:id
 * Permanently remove a PMS job entry.
 */
export async function deleteJob(req: Request, res: Response) {
  try {
    const jobId = validateJobId(req.params.id);

    const data = await dataService.deleteJobById(jobId);

    return res.json({
      success: true,
      data,
      message: "PMS job deleted successfully",
    });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "Error in DELETE /pms/jobs/:id:");
    return res.status(error.statusCode || 500).json({
      success: false,
      error: `Failed to delete PMS job: ${error.message}`,
    });
  }
}

/**
 * GET /pms/jobs/:id/automation-status
 * Polling endpoint for automation progress tracking
 */
export async function getAutomationStatus(req: Request, res: Response) {
  try {
    const jobId = validateJobId(req.params.id);

    const data = await automationService.getJobAutomationStatus(jobId);

    return res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "Error in /pms/jobs/:id/automation-status:");
    return res.status(error.statusCode || 500).json({
      success: false,
      error: `Failed to fetch automation status: ${error.message}`,
    });
  }
}

/**
 * GET /pms/automation/active
 * Get all active (non-completed) PMS automation jobs for dashboard
 */
export async function getActiveAutomations(req: Request, res: Response) {
  try {
    const { organization_id, location_id } = req.query;
    const organizationFilter =
      organization_id && typeof organization_id === "string"
        ? parseInt(organization_id, 10)
        : undefined;
    const locationFilter =
      location_id && typeof location_id === "string"
        ? parseInt(location_id, 10)
        : undefined;

    const data = await automationService.getActiveJobs(
      organizationFilter,
      !isNaN(locationFilter as number) ? locationFilter : undefined
    );

    return res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "Error in /pms/automation/active:");
    return res.status(500).json({
      success: false,
      error: `Failed to fetch active automation jobs: ${error.message}`,
    });
  }
}

/**
 * POST /pms/parse-paste
 * Parse pasted spreadsheet/CSV text using AI (Haiku) and return structured data.
 * Stateless — no database writes. Used by the manual entry modal.
 */
export async function parsePaste(req: Request, res: Response) {
  try {
    const { rawText, currentMonth } = req.body;

    if (!rawText || typeof rawText !== "string") {
      return res.status(400).json({
        success: false,
        error: "rawText is required and must be a string",
      });
    }

    if (
      !currentMonth ||
      typeof currentMonth !== "string" ||
      !/^\d{4}-\d{2}$/.test(currentMonth)
    ) {
      return res.status(400).json({
        success: false,
        error: "currentMonth is required in YYYY-MM format",
      });
    }

    const rbacReq = req as RBACRequest;
    const orgId = rbacReq.organizationId ?? undefined;

    const result = await pasteParseService.parsePastedData(
      rawText,
      currentMonth,
      orgId
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "Error in /pms/parse-paste:");
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error?.message || "Failed to parse pasted data",
    });
  }
}

/**
 * POST /pms/sanitize-paste
 * Deduplicate and clean parsed PMS rows.
 */
export async function sanitizePaste(req: Request, res: Response) {
  try {
    const { rows } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "rows is required and must be a non-empty array",
      });
    }

    const result = await sanitizationService.sanitizeParsedData(rows);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "Error in /pms/sanitize-paste:");
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error?.message || "Failed to sanitize pasted data",
    });
  }
}

/**
 * POST /pms/jobs/:id/restart
 * Delete all data from a completed run and re-trigger from scratch
 */
export async function restartJob(req: Request, res: Response) {
  try {
    const jobId = validateJobId(req.params.id);

    const data = await retryService.restartMonthlyAgents(jobId);

    return res.json({
      success: true,
      message: "Run restarted",
      data,
    });
  } catch (error: any) {
    return handleError(res, error, "Restart job");
  }
}

/**
 * POST /pms/jobs/:id/retry
 * Retry a failed automation step (pms_parser or monthly_agents)
 */
export async function retryJob(req: Request, res: Response) {
  try {
    const jobId = validateJobId(req.params.id);
    const { stepToRetry } = req.body;

    const data = await retryService.retryFailedStep(jobId, stepToRetry);

    return res.json({
      success: true,
      message: `${
        stepToRetry === "pms_parser" ? "PMS parser" : "Monthly agents"
      } retry initiated successfully`,
      data,
    });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "Error in POST /pms/jobs/:id/retry:");
    return res.status(error.statusCode || 500).json({
      success: false,
      error: `Failed to retry step: ${error.message}`,
    });
  }
}

// =====================================================================
// COLUMN-MAPPING ENDPOINTS
// (See plan: 04272026-no-ticket-pms-column-mapping-ai-inference)
// =====================================================================

/**
 * Type-narrow a `ColumnMapping`-shaped value coming off the wire.
 * We trust the structural shape (the resolver / applyMapping layer
 * surface their own errors) but require the two non-negotiable fields
 * — `headers` and `assignments` — to be arrays.
 */
function isColumnMappingShape(value: unknown): value is ColumnMapping {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.headers) && Array.isArray(v.assignments);
}

/**
 * POST /pms/preview-mapping
 * Body: { headers: string[], sampleRows: Record<string, any>[] }
 *
 * Resolves a mapping for the given file shape via the three-tier resolver
 * chain and applies it to `sampleRows` to produce a preview rollup. The
 * preview lets the UI render the parsed output before the user commits.
 *
 * If the resolved mapping is invalid (both/neither of source and
 * referring_practice mapped) the endpoint still returns 200 with a
 * `mappingError` field so the side drawer can render the warning state.
 */
export async function previewResetMapping(req: Request, res: Response) {
  try {
    const { headers, sampleRows, overrideMapping } = req.body ?? {};

    if (!Array.isArray(headers) || headers.length === 0) {
      return res.status(400).json({
        success: false,
        error: "headers must be a non-empty array of strings",
      });
    }
    if (!Array.isArray(sampleRows)) {
      return res.status(400).json({
        success: false,
        error: "sampleRows must be an array",
      });
    }

    const rbacReq = req as RBACRequest;
    const orgId = rbacReq.organizationId;
    if (!orgId) {
      return res.status(401).json({
        success: false,
        error: "Organization context required",
      });
    }

    // Override path: user edited the mapping in the drawer and clicked Re-process.
    // Skip the resolver chain — apply the supplied mapping directly to sample rows.
    if (overrideMapping) {
      if (
        typeof overrideMapping !== "object" ||
        !Array.isArray((overrideMapping as ColumnMapping).headers) ||
        !Array.isArray((overrideMapping as ColumnMapping).assignments)
      ) {
        return res.status(400).json({
          success: false,
          error:
            "overrideMapping must be a ColumnMapping with headers[] and assignments[]",
        });
      }

      let parsedPreview: MonthlyRollupForJob | null = null;
      let mappingError: string | undefined;
      const dataQualityFlags: string[] = [];
      try {
        parsedPreview = applyMapping(
          sampleRows as Record<string, unknown>[],
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
      const signature = signHeaders(headers as string[]);
      let cacheSource: "org-cache" | "ai-inference" = "ai-inference";
      if (parsedPreview !== null && !mappingError) {
        try {
          await PmsColumnMappingModel.upsertOrgMapping(
            orgId,
            signature,
            overrideMapping as ColumnMapping
          );
          cacheSource = "org-cache";
          logger.info({ detail: JSON.stringify({
                          event: "org-cache-write",
                          orgId,
                          signatureHash: signature,
                          source: "user-override",
                        }) }, "[pms-mapping]");
        } catch (cacheErr: any) {
          logger.warn({ detail: cacheErr?.message || cacheErr }, "[pms-mapping] org-cache write failed:");
          // Non-fatal — preview still works, user just won't get silent apply
          // on the next upload.
        }
      }

      // Wrap the flat array into { monthly_rollup: [...] } shape so the
      // frontend's MonthlyRollupForJob interface matches what it receives.
      return res.json({
        success: true,
        data: {
          mapping: overrideMapping as ColumnMapping,
          source: cacheSource,
          confidence: 1.0,
          signature,
          requireConfirmation: false,
          parsedPreview:
            parsedPreview === null ? null : { monthly_rollup: parsedPreview },
          ...(dataQualityFlags.length ? { dataQualityFlags } : {}),
          ...(mappingError ? { mappingError } : {}),
        },
      });
    }

    const resolved = await resolveMapping(
      orgId,
      headers as string[],
      sampleRows as Record<string, unknown>[]
    );

    let parsedPreview: MonthlyRollupForJob | null = null;
    let mappingError: string | undefined;
    const dataQualityFlags: string[] = [];
    try {
      parsedPreview = applyMapping(
        sampleRows as Record<string, unknown>[],
        resolved.mapping,
        dataQualityFlags
      );
    } catch (err) {
      mappingError =
        err instanceof Error
          ? err.message
          : "Could not apply mapping to preview rows";
      parsedPreview = null;
    }

    return res.json({
      success: true,
      data: {
        mapping: resolved.mapping,
        source: resolved.source,
        confidence: resolved.confidence,
        signature: resolved.signature,
        requireConfirmation: resolved.requireConfirmation ?? false,
        parsedPreview:
          parsedPreview === null ? null : { monthly_rollup: parsedPreview },
        ...(dataQualityFlags.length ? { dataQualityFlags } : {}),
        ...(mappingError ? { mappingError } : {}),
      },
    });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "Error in POST /pms/preview-mapping:");
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error?.message || "Failed to preview column mapping",
    });
  }
}

/**
 * POST /pms/upload-with-mapping
 * Body: { rows: Record<string, any>[], mapping: ColumnMapping, month?: string, domain?: string }
 *   OR: { pasteText: string, mapping: ColumnMapping, month?: string, domain?: string }
 *
 * Persists the user-confirmed mapping into the org cache (clone-on-confirm
 * per D2), applies it to the rows to produce `monthly_rollup`, and creates
 * an approved `pms_jobs` row pre-populated with the parsed result. Hands off
 * to `finalizePmsJob` — skips admin/client approval (the client already
 * reviewed the mapping in the drawer) and fires monthly_agents immediately.
 */
export async function uploadWithMapping(req: Request, res: Response) {
  try {
    const body = req.body ?? {};
    const { mapping } = body;
    const month: string | undefined = body.month;
    const domain: string | undefined =
      typeof body.domain === "string" ? body.domain : undefined;

    if (!isColumnMappingShape(mapping)) {
      return res.status(400).json({
        success: false,
        error: "mapping must be a valid ColumnMapping object",
      });
    }

    let rows: Record<string, unknown>[] = [];
    if (Array.isArray(body.rows)) {
      rows = body.rows as Record<string, unknown>[];
    } else if (typeof body.pasteText === "string" && body.pasteText.length > 0) {
      const tokenized = pasteParseService.pasteTextToRecords(body.pasteText);
      rows = tokenized.rows as unknown as Record<string, unknown>[];
    } else {
      return res.status(400).json({
        success: false,
        error: "Either `rows` (array) or `pasteText` (string) is required",
      });
    }

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No data rows provided",
      });
    }

    const rbacReq = req as RBACRequest;
    const orgId = rbacReq.organizationId;
    if (!orgId) {
      return res.status(401).json({
        success: false,
        error: "Organization context required",
      });
    }

    const headers =
      Array.isArray(mapping.headers) && mapping.headers.length > 0
        ? mapping.headers
        : Object.keys(rows[0] ?? {});
    const signature = signHeaders(headers);

    let monthlyRollup: MonthlyRollupForJob;
    try {
      monthlyRollup = applyMapping(rows, mapping as ColumnMapping);
    } catch (err) {
      return res.status(400).json({
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "Could not apply mapping to rows",
      });
    }

    // Clone-on-confirm: persist this mapping into the org cache.
    const upserted = await PmsColumnMappingModel.upsertOrgMapping(
      orgId,
      signature,
      mapping as ColumnMapping
    );
    const mappingId = upserted.id;

    const passedLocationId =
      typeof body.locationId === "number"
        ? body.locationId
        : typeof body.locationId === "string" && body.locationId
          ? parseInt(body.locationId, 10)
          : null;
    const locationId =
      passedLocationId && !isNaN(passedLocationId)
        ? passedLocationId
        : await resolveLocationId(orgId);

    await assertNoActivePmsAutomation(orgId, locationId);

    const responseLog = {
      monthly_rollup: monthlyRollup,
      mapping_source: "user-confirmed",
      header_signature: signature,
    };
    const actorUserId = rbacReq.userId ?? rbacReq.user?.userId ?? null;

    const job = await db.transaction(async (trx) => {
      const created = await PmsJobModel.create(
        {
          time_elapsed: 0,
          status: "approved",
          organization_id: orgId,
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
      organizationId: orgId,
      locationId,
      domain,
      pmsParserStatus: "completed",
    });

    return res.json({
      success: true,
      data: {
        jobId: job.id,
        mappingId,
        monthlyRollup,
      },
    });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "Error in POST /pms/upload-with-mapping:");
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error?.message || "Failed to process mapped upload",
      code: error.code,
      data: error.activeJob ? { activeJob: error.activeJob } : undefined,
    });
  }
}

/**
 * POST /pms/jobs/:id/reprocess
 * Body: { mapping: ColumnMapping }
 *
 * Re-applies the new mapping to the existing raw rows, upserts the mapping
 * into the org cache, and updates the job in place (no new pms_jobs row).
 * Returns the regenerated rollup.
 */
export async function reprocessJobMapping(req: Request, res: Response) {
  try {
    const jobId = validateJobId(req.params.id);
    const { mapping } = req.body ?? {};

    if (!isColumnMappingShape(mapping)) {
      return res.status(400).json({
        success: false,
        error: "mapping must be a valid ColumnMapping object",
      });
    }

    const job = await PmsJobModel.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        error: "PMS job not found",
      });
    }

    const rbacReq = req as RBACRequest;
    const orgId = rbacReq.organizationId;
    if (!orgId) {
      return res.status(401).json({
        success: false,
        error: "Organization context required",
      });
    }
    if (job.organization_id && job.organization_id !== orgId) {
      return res.status(403).json({
        success: false,
        error: "No access to this job",
      });
    }

    const raw = job.raw_input_data as
      | { rows?: Record<string, unknown>[]; headers?: string[]; signature?: string }
      | null;
    const rawRows = Array.isArray(raw?.rows)
      ? (raw!.rows as Record<string, unknown>[])
      : null;
    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({
        success: false,
        error:
          "This job pre-dates the mapping system and cannot be re-processed.",
      });
    }

    let monthlyRollup: MonthlyRollupForJob;
    try {
      monthlyRollup = applyMapping(rawRows, mapping as ColumnMapping);
    } catch (err) {
      return res.status(400).json({
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "Could not apply mapping to job rows",
      });
    }

    const headers =
      raw?.headers && raw.headers.length > 0
        ? raw.headers
        : Array.isArray(mapping.headers) && mapping.headers.length > 0
          ? mapping.headers
          : Object.keys(rawRows[0] ?? {});
    const signature = raw?.signature ?? signHeaders(headers);

    const upserted = await PmsColumnMappingModel.upsertOrgMapping(
      orgId,
      signature,
      mapping as ColumnMapping
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

    return res.json({
      success: true,
      data: {
        jobId,
        mappingId,
        monthlyRollup,
      },
    });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "Error in POST /pms/jobs/:id/reprocess:");
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error?.message || "Failed to re-process job with new mapping",
    });
  }
}

/**
 * GET /pms/mappings/cache?signature=<hash>
 *
 * Returns the org's cached mapping for the given header signature, falling
 * through to the global library if the org cache misses. Returns null in
 * `data` when neither tier has a hit.
 */
export async function getCachedMapping(req: Request, res: Response) {
  try {
    const signature = req.query.signature;
    if (
      typeof signature !== "string" ||
      signature.length === 0 ||
      !/^[0-9a-f]+$/i.test(signature)
    ) {
      return res.status(400).json({
        success: false,
        error: "signature query param is required (hex string)",
      });
    }

    const rbacReq = req as RBACRequest;
    const orgId = rbacReq.organizationId;
    if (!orgId) {
      return res.status(401).json({
        success: false,
        error: "Organization context required",
      });
    }

    const orgHit = await PmsColumnMappingModel.findByOrgAndSignature(
      orgId,
      signature
    );
    if (orgHit) {
      return res.json({
        success: true,
        data: {
          mapping: orgHit.mapping,
          source: "org-cache" as const,
          requireConfirmation: orgHit.require_confirmation,
        },
      });
    }

    const globalHit = await PmsColumnMappingModel.findGlobalBySignature(
      signature
    );
    if (globalHit) {
      return res.json({
        success: true,
        data: {
          mapping: globalHit.mapping,
          source: "global-library" as const,
          requireConfirmation: globalHit.require_confirmation,
        },
      });
    }

    return res.json({
      success: true,
      data: null,
    });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "Error in GET /pms/mappings/cache:");
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error?.message || "Failed to fetch cached mapping",
    });
  }
}
