import { Request, Response } from "express";
import { RBACRequest } from "../../middleware/rbac";
import logger from "../../lib/logger";
import * as mappingService from "./pms-services/pms-mapping.service";
import { isColumnMappingShape } from "./pms-utils/pms-mapping-validator.util";
import { validateJobId } from "./pms-utils/pms-validator.util";

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
