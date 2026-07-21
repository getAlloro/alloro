import { Request, Response } from "express";
import * as uploadService from "./pms-services/pms-upload.service";
import * as approvalService from "./pms-services/pms-approval.service";
import * as automationService from "./pms-services/pms-automation.service";
import * as dataService from "./pms-services/pms-data.service";
import * as retryService from "./pms-services/pms-retry.service";
import * as sanitizationService from "./pms-services/pms-paste-analysis.service";
import { coerceBoolean, validateJobId } from "./pms-utils/pms-validator.util";
import { tryParseMonthlyRollupPayload } from "./pms-utils/pms-mapping-validator.util";
import { PmsStatus } from "./pms-utils/pms-constants";
import { RBACRequest, LocationScopedRequest } from "../../middleware/rbac";
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
    const {
      domain,
      manualData,
      entryType,
      locationId: reqLocationId,
      targetMonth,
    } = req.body;
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
      overrideMonthlyRollup,
      typeof targetMonth === "string" ? targetMonth : undefined
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
 * Aggregate PMS key metrics for the CALLER'S organization across all processed
 * jobs.
 *
 * The organization is derived from server context (rbacMiddleware), never from
 * the request (§5.5) — a caller-supplied organization_id previously let any
 * authenticated user read any practice's referral and production figures. The
 * cross-organization read the admin dashboard needs lives behind
 * superAdminMiddleware at GET /api/admin/pms/keyData.
 */
export async function getKeyData(req: Request, res: Response) {
  try {
    const scopedReq = req as LocationScopedRequest;
    const organizationId = scopedReq.organizationId ?? null;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: "Missing organization context",
      });
    }

    // locationScopeMiddleware has already validated the requested location
    // against the caller's accessible set and resolved it onto the request.
    // Re-reading it from the query string here would bypass that check.
    const locationId = scopedReq.locationId ?? undefined;

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
        ? "We're now processing your data and preparing insights. You'll be notified when ready!"
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

    const rbacReq = req as RBACRequest;
    const orgId = rbacReq.organizationId ?? null;
    const result = await sanitizationService.sanitizeParsedData(rows, orgId);

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
