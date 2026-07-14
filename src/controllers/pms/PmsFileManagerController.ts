import { Response } from "express";
import { LocationScopedRequest } from "../../middleware/rbac";
import * as fileManagerService from "./pms-services/PmsFileManagerService";
import { validateJobId } from "./pms-utils/pms-validator.util";

function contextFromRequest(req: LocationScopedRequest) {
  if (!req.organizationId) {
    throw Object.assign(new Error("Organization context required."), {
      statusCode: 401,
    });
  }

  const locationId = req.locationId ?? parseOptionalNumber(req.query.locationId);
  if (!locationId) {
    throw Object.assign(new Error("Location context required."), {
      statusCode: 400,
    });
  }

  return {
    organizationId: req.organizationId,
    locationId,
    actorUserId: req.userId ?? req.user?.userId ?? null,
  };
}

export async function listFiles(req: LocationScopedRequest, res: Response) {
  try {
    const data = await fileManagerService.listFiles(contextFromRequest(req));
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error, "Failed to list PMS files.");
  }
}

export async function getFileDetail(req: LocationScopedRequest, res: Response) {
  try {
    const data = await fileManagerService.getFileDetail(
      validateJobId(req.params.id),
      contextFromRequest(req)
    );
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error, "Failed to load PMS file.");
  }
}

export async function previewConflicts(req: LocationScopedRequest, res: Response) {
  try {
    const months = Array.isArray(req.body?.months) ? req.body.months : [];
    const data = await fileManagerService.previewConflicts(
      months.map(String),
      contextFromRequest(req)
    );
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error, "Failed to preview PMS file conflicts.");
  }
}

export async function previewUploadFile(req: LocationScopedRequest, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "PMS file is required.",
      });
    }

    const data = await fileManagerService.previewUploadFile(
      req.file,
      contextFromRequest(req),
      typeof req.body?.targetMonth === "string"
        ? req.body.targetMonth
        : undefined,
    );
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error, "Failed to preview PMS upload.");
  }
}

export async function getDownloadUrl(req: LocationScopedRequest, res: Response) {
  try {
    const data = await fileManagerService.getDownloadUrl(
      validateJobId(req.params.id),
      contextFromRequest(req)
    );
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error, "Failed to create PMS file download link.");
  }
}

export async function updateFileData(req: LocationScopedRequest, res: Response) {
  try {
    if (!req.body?.responseLog || typeof req.body.responseLog !== "object") {
      return res.status(400).json({
        success: false,
        error: "responseLog object is required.",
      });
    }

    const data = await fileManagerService.updateFileData(
      validateJobId(req.params.id),
      req.body.responseLog,
      contextFromRequest(req)
    );
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error, "Failed to update PMS file.");
  }
}

export async function softDeleteFile(req: LocationScopedRequest, res: Response) {
  try {
    const data = await fileManagerService.softDeleteFile(
      validateJobId(req.params.id),
      typeof req.body?.reason === "string" ? req.body.reason : null,
      contextFromRequest(req)
    );
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error, "Failed to delete PMS file.");
  }
}

export async function rerunInsights(req: LocationScopedRequest, res: Response) {
  try {
    const data = await fileManagerService.rerunInsights(contextFromRequest(req));
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error, "Failed to start insights refresh.");
  }
}

function sendError(res: Response, error: unknown, fallback: string) {
  const err = error as { statusCode?: number; message?: string; code?: string; activeJob?: unknown };
  return res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || fallback,
    code: err.code,
    data: err.activeJob ? { activeJob: err.activeJob } : undefined,
  });
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}
