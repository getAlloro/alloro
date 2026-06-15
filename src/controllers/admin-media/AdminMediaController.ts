/**
 * Admin Media Controller
 *
 * Handles HTTP request/response for media CRUD operations.
 * Delegates business logic to feature-services, formats responses.
 *
 * Endpoints:
 * - POST   / → uploadMedia (bulk upload with quota check)
 * - GET    / → listMedia (paginated, filtered, usage-tracked)
 * - PATCH  /:mediaId → updateMedia (metadata update)
 * - DELETE /:mediaId → deleteMedia (S3 + DB cleanup)
 */

import { Request, Response } from "express";
import * as mediaUploadService from "./feature-services/service.media-upload";
import * as mediaListService from "./feature-services/service.media-list";
import * as mediaUpdateService from "./feature-services/service.media-update";
import * as mediaDeleteService from "./feature-services/service.media-delete";
import logger from "../../lib/logger";

// =====================================================================
// POST /api/admin/websites/:projectId/media - Upload media (bulk)
// =====================================================================

export async function uploadMedia(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId } = req.params;
    const files = req.files as Express.Multer.File[];

    const result = await mediaUploadService.uploadBulk(projectId, files);

    return res.status(201).json({
      success: true,
      data: result.succeeded,
      failed: result.failed.length > 0 ? result.failed : undefined,
      quota: result.quota,
    });
  } catch (error: any) {
    if (error.statusCode && error.errorCode) {
      const body: Record<string, unknown> = {
        success: false,
        error: error.errorCode,
        message: error.message,
      };
      if (error.quota) {
        body.quota = error.quota;
      }
      return res.status(error.statusCode).json(body);
    }
    logger.error({ err: error }, "[Media] Upload error:");
    return res.status(500).json({
      success: false,
      error: "UPLOAD_ERROR",
      message: error?.message || "Failed to upload media",
    });
  }
}

// =====================================================================
// GET /api/admin/websites/:projectId/media - List media (paginated)
// =====================================================================

export async function listMedia(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId } = req.params;
    const { type, search, page = "1", limit = "50" } = req.query;

    const result = await mediaListService.list(projectId, {
      type: type as string | undefined,
      search: search as string | undefined,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });

    return res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      quota: result.quota,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Media] List error:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch media",
    });
  }
}

// =====================================================================
// PATCH /api/admin/websites/:projectId/media/:mediaId - Update metadata
// =====================================================================

export async function updateMedia(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId, mediaId } = req.params;
    const { display_name, alt_text } = req.body;

    const updated = await mediaUpdateService.updateMetadata(
      projectId,
      mediaId,
      { display_name, alt_text }
    );

    return res.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        error: error.errorCode || "NOT_FOUND",
        message: error.message || "Media not found",
      });
    }
    logger.error({ err: error }, "[Media] Update error:");
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update media",
    });
  }
}

// =====================================================================
// DELETE /api/admin/websites/:projectId/media/:mediaId - Delete media
// =====================================================================

export async function deleteMedia(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { projectId, mediaId } = req.params;
    const { force } = req.query;

    await mediaDeleteService.deleteMedia(
      projectId,
      mediaId,
      force === "true"
    );

    return res.json({
      success: true,
      message: "Media deleted successfully",
    });
  } catch (error: any) {
    if (error.statusCode && error.errorCode) {
      const body: Record<string, unknown> = {
        success: false,
        error: error.errorCode,
        message: error.message,
      };
      if (error.pagesUsing) {
        body.pagesUsing = error.pagesUsing;
      }
      return res.status(error.statusCode).json(body);
    }
    logger.error({ err: error }, "[Media] Delete error:");
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error?.message || "Failed to delete media",
    });
  }
}
