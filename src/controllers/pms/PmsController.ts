import { Request, Response } from "express";
import * as uploadService from "./pms-services/pms-upload.service";
import * as approvalService from "./pms-services/pms-approval.service";
import * as automationService from "./pms-services/pms-automation.service";
import * as dataService from "./pms-services/pms-data.service";
import * as retryService from "./pms-services/pms-retry.service";
import * as pasteParseService from "./pms-services/pms-paste-parse.service";
import * as sanitizationService from "./pms-services/pms-paste-analysis.service";
import * as mappingService from "./pms-services/pms-mapping.service";
import { coerceBoolean, validateJobId } from "./pms-utils/pms-validator.util";
import {
  tryParseMonthlyRollupPayload,
  isColumnMappingShape,
} from "./pms-utils/pms-mapping-validator.util";
import { PmsStatus } from "./pms-utils/pms-constants";
import { RBACRequest } from "../../middleware/rbac";
import type { MonthlyRollupForJob } from "../../utils/pms/applyColumnMapping";
import * as comparisonInsightsService from "./pms-services/pms-comparison-insights.service";
import { monthSortValue } from "../../utils/pms/monthKey";
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

/**
 * POST /pms/upload
 * Upload and process PMS data from CSV, XLS, or XLSX files
 * OR accept manually entered data (JSON body with entryType: 'manual')
 */
export async function uploadPmsData(req: Request, res: Response) {
  try {
    const { domain, manualData, entryType, locationId: reqLocationId } = req.body;
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
      const parsed = tryParseMonthlyRollupPayload(manualData, "manualData");
      if (!parsed.ok) {
        return res.status(400).json({ success: false, error: parsed.error });
      }

      const result = await uploadService.processManualEntry(
        domain,
        parsed.value,
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
      const parsed = tryParseMonthlyRollupPayload(manualData, "manualData");
      if (!parsed.ok) {
        return res.status(400).json({ success: false, error: parsed.error });
      }
      overrideMonthlyRollup = parsed.value;
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
      locationIdRaw !== undefined && !isNaN(locationIdRaw) ? locationIdRaw : undefined;

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
 * POST /pms/comparison-insights
 * Generate a Claude Haiku paragraph comparing two months of referral data.
 * Organization is taken from the JWT (RBAC); the months are re-derived
 * server-side from the authoritative aggregation, never from client numbers.
 */
export async function generateComparisonInsights(req: Request, res: Response) {
  try {
    const rbacReq = req as RBACRequest;
    const organizationId = rbacReq.organizationId ?? null;
    const { monthA, monthB, locationId: reqLocationId } = req.body ?? {};
    const locationId = reqLocationId ? Number(reqLocationId) : null;

    if (!organizationId) {
      return res
        .status(400)
        .json({ success: false, error: "Missing organization context" });
    }
    if (
      typeof monthA !== "string" ||
      typeof monthB !== "string" ||
      !monthA.trim() ||
      !monthB.trim()
    ) {
      return res
        .status(400)
        .json({ success: false, error: "monthA and monthB are required" });
    }
    if (monthSortValue(monthA) === monthSortValue(monthB)) {
      return res.status(400).json({
        success: false,
        error: "Select two different months to compare",
      });
    }

    const data =
      await comparisonInsightsService.generateReferralComparisonInsight({
        organizationId,
        locationId,
        monthA: monthA.trim(),
        monthB: monthB.trim(),
      });

    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, "generate comparison insights");
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
// Business logic lives in pms-services/pms-mapping.service.ts.
// =====================================================================

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

    const data = await mappingService.buildPreviewMapping({
      headers: headers as string[],
      sampleRows: sampleRows as Record<string, unknown>[],
      organizationId: orgId,
      overrideMapping,
    });

    return res.json({
      success: true,
      data,
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

    const rbacReq = req as RBACRequest;
    const orgId = rbacReq.organizationId;
    if (!orgId) {
      return res.status(401).json({
        success: false,
        error: "Organization context required",
      });
    }

    const actorUserId = rbacReq.userId ?? rbacReq.user?.userId ?? null;

    const data = await mappingService.createMappedUpload({
      mapping,
      organizationId: orgId,
      actorUserId,
      rows: body.rows,
      pasteText: body.pasteText,
      month,
      domain,
      locationId: body.locationId,
    });

    return res.json({
      success: true,
      data,
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

    const rbacReq = req as RBACRequest;
    const orgId = rbacReq.organizationId;
    if (!orgId) {
      return res.status(401).json({
        success: false,
        error: "Organization context required",
      });
    }

    const data = await mappingService.reprocessJobWithMapping({
      jobId,
      mapping,
      organizationId: orgId,
    });

    return res.json({
      success: true,
      data,
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

    const data = await mappingService.getCachedMappingForSignature({
      signature,
      organizationId: orgId,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    logger.error({ err: error?.message || error }, "Error in GET /pms/mappings/cache:");
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error?.message || "Failed to fetch cached mapping",
    });
  }
}
