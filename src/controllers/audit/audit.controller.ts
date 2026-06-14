import { Request, Response } from "express";
import { validateStartAuditInput, validateAuditIdParam, validateUpdateFields } from "./audit-utils/validationUtils";
import { triggerAuditWorkflow } from "./audit-services/auditWorkflowService";
import { getAuditByIdWithStatus, getAuditById } from "./audit-services/auditRetrievalService";
import { updateAuditFields } from "./audit-services/auditUpdateService";
import { retryAuditById } from "./audit-services/service.audit-retry";
import logger from "../../lib/logger";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_PUBLIC_RETRIES = 3;

export async function startAudit(req: Request, res: Response) {
  try {
    const { domain, practice_search_string } = validateStartAuditInput(req.body);

    logger.info(`[Audit] Starting audit for domain: ${domain}`);

    const auditId = await triggerAuditWorkflow(domain, practice_search_string);

    logger.info(`[Audit] Audit queued: ${auditId}`);

    return res.json({
      success: true,
      audit_id: auditId,
      created_at: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Audit] Start error:");
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
}

export async function getAuditStatus(req: Request, res: Response) {
  try {
    const auditId = validateAuditIdParam(req.params.auditId);

    const response = await getAuditByIdWithStatus(auditId);

    return res.json(response);
  } catch (error: any) {
    logger.error({ err: error }, "[Audit] Status error:");
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
}

export async function getAuditDetails(req: Request, res: Response) {
  try {
    const auditId = validateAuditIdParam(req.params.auditId);

    const response = await getAuditById(auditId);

    return res.json(response);
  } catch (error: any) {
    logger.error({ err: error }, "[Audit] Get error:");
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
}

/**
 * Public retry endpoint — POST /api/audit/:auditId/retry.
 *
 * Shared-secret gated by `requireTrackingKey` middleware (mounted on the
 * route). No body; the retry target is fully identified by the path.
 *
 * Cap: 3 user-initiated retries per audit, enforced atomically in the
 * shared service. Admin rerun uses the same service with `{skipLimit:true,
 * countsTowardLimit:false}` and is mounted on the admin routes instead.
 */
export async function retryAudit(req: Request, res: Response) {
  try {
    const auditId = (req.params.auditId ?? "").trim();
    if (!UUID_REGEX.test(auditId)) {
      return res.status(400).json({ ok: false, error: "invalid_audit_id" });
    }

    const result = await retryAuditById(auditId);

    if (result.ok) {
      return res.json({
        ok: true,
        audit_id: result.auditId,
        retry_count: result.retryCount,
      });
    }

    if (result.reason === "not_found") {
      return res.status(404).json({ ok: false, error: "not_found" });
    }
    if (result.reason === "limit_exceeded") {
      return res.status(429).json({
        ok: false,
        error: "limit_exceeded",
        retry_count: result.retryCount,
        max_retries: MAX_PUBLIC_RETRIES,
      });
    }
    // not_failed
    return res.status(409).json({
      ok: false,
      error: "not_failed",
      status: result.currentStatus,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Audit] Retry error:");
    return res
      .status(500)
      .json({ ok: false, error: error.message || "internal_error" });
  }
}

export async function updateAudit(req: Request, res: Response) {
  try {
    const auditId = validateAuditIdParam(req.params.auditId);
    const filteredData = validateUpdateFields(req.body);

    const updatedFields = await updateAuditFields(auditId, filteredData);

    return res.json({
      success: true,
      updated_fields: updatedFields,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Audit] Update error:");
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
}
