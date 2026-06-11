import type { Response } from "express";
import type { AuthRequest } from "../../middleware/auth";
import {
  createOrganizationAuditRun,
  createUrlAuditRun,
  deleteAuditRun,
  deleteAuditRuns,
  getAuditRunDetail,
  listAuditableOrganizationIds,
  listAuditRuns,
} from "../../services/ai-seo-audit/aiSeoAuditService";
import type { AiSeoAuditScope } from "../../services/ai-seo-audit/types";

const VALID_RUN_SCOPES: AiSeoAuditScope[] = [
  "url_only",
  "organization",
  "sitewide",
  "location",
];

export async function createUrlAudit(
  req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    if (!url) {
      return res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "URL is required.",
          details: null,
        },
      });
    }

    const detail = await createUrlAuditRun(url, req.user?.userId ?? null);
    return res.status(202).json({ success: true, data: detail, error: null });
  } catch (error) {
    return handleError(res, error, "CREATE_URL_AUDIT");
  }
}

export async function createOrganizationAudit(
  req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const organizationId = Number(req.params.organizationId);
    if (!Number.isInteger(organizationId) || organizationId <= 0) {
      return res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Valid organizationId is required.",
          details: null,
        },
      });
    }

    const detail = await createOrganizationAuditRun(
      organizationId,
      req.user?.userId ?? null,
    );
    return res.status(202).json({ success: true, data: detail, error: null });
  } catch (error) {
    return handleError(res, error, "CREATE_ORGANIZATION_AUDIT");
  }
}

export async function listRuns(
  req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const organizationId = req.query.organizationId
      ? Number(req.query.organizationId)
      : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const scope = typeof req.query.scope === "string" &&
      VALID_RUN_SCOPES.includes(req.query.scope as AiSeoAuditScope)
      ? (req.query.scope as AiSeoAuditScope)
      : undefined;
    const runs = await listAuditRuns({
      organizationId: Number.isInteger(organizationId) ? organizationId : undefined,
      scope,
      limit: Number.isInteger(limit) ? limit : undefined,
    });
    return res.json({ success: true, data: { runs }, error: null });
  } catch (error) {
    return handleError(res, error, "LIST_AI_SEO_AUDIT_RUNS");
  }
}

export async function getRun(
  req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const runId = req.params.runId;
    if (!runId) {
      return res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "runId is required.",
          details: null,
        },
      });
    }
    const detail = await getAuditRunDetail(runId);
    return res.json({ success: true, data: detail, error: null });
  } catch (error) {
    return handleError(res, error, "GET_AI_SEO_AUDIT_RUN");
  }
}

export async function listAuditableOrganizations(
  _req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const ids = await listAuditableOrganizationIds();
    return res.json({ success: true, data: { organizationIds: ids }, error: null });
  } catch (error) {
    return handleError(res, error, "LIST_AUDITABLE_ORGANIZATIONS");
  }
}

export async function deleteRun(
  req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const runId = req.params.runId;
    if (!runId) {
      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "VALIDATION_ERROR", message: "runId is required.", details: null },
      });
    }
    const deleted = await deleteAuditRun(runId);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Audit run not found.", details: null },
      });
    }
    return res.json({ success: true, data: { id: runId }, error: null });
  } catch (error) {
    return handleError(res, error, "DELETE_AI_SEO_AUDIT_RUN");
  }
}

export async function deleteRuns(
  req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const organizationId = req.query.organizationId
      ? Number(req.query.organizationId)
      : undefined;
    const scope = typeof req.query.scope === "string" &&
      VALID_RUN_SCOPES.includes(req.query.scope as AiSeoAuditScope)
      ? (req.query.scope as AiSeoAuditScope)
      : undefined;
    const deletedCount = await deleteAuditRuns({
      organizationId: Number.isInteger(organizationId) ? organizationId : undefined,
      scope,
    });
    return res.json({ success: true, data: { deletedCount }, error: null });
  } catch (error) {
    return handleError(res, error, "DELETE_AI_SEO_AUDIT_RUNS");
  }
}

function handleError(
  res: Response,
  error: unknown,
  code: string,
): Response {
  const message = error instanceof Error ? error.message : "AI SEO audit request failed.";
  return res.status(message.includes("not found") ? 404 : 500).json({
    success: false,
    data: null,
    error: {
      code,
      message,
      details: null,
    },
  });
}
