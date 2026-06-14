/**
 * NotificationsController - HTTP handler layer for notification endpoints.
 *
 * Thin controller that handles:
 * - Request parsing and validation
 * - Delegating business logic to NotificationService
 * - Data transformation via feature-utils
 * - HTTP response formatting (status codes, response shapes)
 * - Error handling
 *
 * 6 endpoints total:
 * - 4 client endpoints (organization-scoped via RBAC middleware)
 * - 1 admin endpoint (unrestricted)
 * - 1 health check
 */

import { Request, Response } from "express";
import { NotificationService } from "./feature-services";
import { NotificationModel } from "../../models/NotificationModel";
import { LocationScopedRequest } from "../../middleware/rbac";
import {
  validateNotificationId,
  parseNotifications,
  formatNotificationsResponse,
} from "./feature-utils";
import logger from "../../lib/logger";

// TODO: Extract to shared error handling utility during centralized error handling refactor.
// This is intentionally kept inline per the refactor plan to avoid scope creep.
// Duplicated across ~23 route/controller files.
/**
 * Standardized error response handler.
 * Logs the error with context and returns a 500 JSON response.
 *
 * @param res - Express response object
 * @param error - The caught error
 * @param operation - Human-readable operation name for logging
 * @returns Express Response with error payload
 */
function handleError(res: Response, error: unknown, operation: string): Response {
  const err = error as { message?: string };
  logger.error({ err: err?.message || error }, `[NOTIFICATIONS] ${operation} Error:`);
  return res.status(500).json({
    success: false,
    error: `Failed to ${operation.toLowerCase()}`,
    message: err?.message || "Unknown error occurred",
    timestamp: new Date().toISOString(),
  });
}

export class NotificationsController {
  /**
   * GET /api/notifications
   * Fetch latest 10 notifications for the logged-in client.
   */
  static async getNotifications(req: Request, res: Response): Promise<Response> {
    try {
      const scopedReq = req as LocationScopedRequest;
      const organizationId = scopedReq.organizationId;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          error: "Missing organization context",
          message: "Organization ID is required",
        });
      }

      const locationId = scopedReq.locationId || null;
      const accessibleLocationIds = scopedReq.accessibleLocationIds;

      const notifications = await NotificationModel.findByOrganization(
        organizationId,
        { locationId, accessibleLocationIds, limit: 10 }
      );
      const unreadCount = await NotificationModel.countUnreadByOrganization(
        organizationId,
        { locationId, accessibleLocationIds }
      );

      const parsedNotifications = parseNotifications(notifications);
      const response = formatNotificationsResponse(parsedNotifications, unreadCount);
      return res.json(response);
    } catch (error: unknown) {
      return handleError(res, error, "Fetch notifications");
    }
  }

  /**
   * PATCH /api/notifications/:id/read
   * Mark a notification as read.
   */
  static async markAsRead(req: Request, res: Response): Promise<Response> {
    try {
      const idValidation = validateNotificationId(req.params.id);
      if (!idValidation.valid) {
        return res.status(400).json({
          success: false,
          error: "Invalid notification ID",
          message: idValidation.error,
        });
      }

      const scopedReq = req as LocationScopedRequest;
      const organizationId = scopedReq.organizationId;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          error: "Missing organization context",
          message: "Organization ID is required",
        });
      }

      const notification = await NotificationModel.findByIdAndOrganization(
        idValidation.notificationId!,
        organizationId
      );
      if (!notification) {
        return res.status(404).json({
          success: false,
          error: "Notification not found",
          message: "Notification does not exist or does not belong to your organization",
        });
      }
      await NotificationModel.markRead(idValidation.notificationId!);
      return res.json({ success: true, message: "Notification marked as read" });
    } catch (error: unknown) {
      return handleError(res, error, "Mark notification as read");
    }
  }

  /**
   * PATCH /api/notifications/mark-all-read
   * Mark all notifications as read for the organization.
   */
  static async markAllAsRead(req: Request, res: Response): Promise<Response> {
    try {
      const scopedReq = req as LocationScopedRequest;
      const organizationId = scopedReq.organizationId;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          error: "Missing organization context",
          message: "Organization ID is required",
        });
      }

      const locationId = scopedReq.locationId || null;
      const updated = await NotificationModel.markAllReadByOrganization(
        organizationId,
        { locationId, accessibleLocationIds: scopedReq.accessibleLocationIds }
      );
      return res.json({
        success: true,
        message: `${updated} notification(s) marked as read`,
        count: updated,
      });
    } catch (error: unknown) {
      return handleError(res, error, "Mark all notifications as read");
    }
  }

  /**
   * DELETE /api/notifications/delete-all
   * Delete all notifications for the organization.
   */
  static async deleteAll(req: Request, res: Response): Promise<Response> {
    try {
      const scopedReq = req as LocationScopedRequest;
      const organizationId = scopedReq.organizationId;

      if (!organizationId) {
        return res.status(400).json({
          success: false,
          error: "Missing organization context",
          message: "Organization ID is required",
        });
      }

      const locationId = scopedReq.locationId || null;
      const deleted = await NotificationModel.deleteAllByOrganization(
        organizationId,
        { locationId, accessibleLocationIds: scopedReq.accessibleLocationIds }
      );
      return res.json({
        success: true,
        message: `${deleted} notification(s) deleted`,
        count: deleted,
      });
    } catch (error: unknown) {
      return handleError(res, error, "Delete all notifications");
    }
  }

  /**
   * GET /api/notifications/admin/list
   * Fetch notifications for an organization (admin).
   * Query params: organization_id (required), location_id, limit, offset
   */
  static async getAdminNotifications(req: Request, res: Response): Promise<Response> {
    try {
      const { organization_id, location_id, limit, offset } = req.query;

      if (!organization_id) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields",
          message: "organization_id is required",
        });
      }

      const result = await NotificationModel.listAdmin({
        organization_id: parseInt(String(organization_id), 10),
        location_id: location_id ? parseInt(String(location_id), 10) : undefined,
        limit: limit ? parseInt(String(limit), 10) : 50,
        offset: offset ? parseInt(String(offset), 10) : 0,
      });

      return res.json({
        success: true,
        notifications: result.notifications,
        total: result.total,
      });
    } catch (error: unknown) {
      return handleError(res, error, "Fetch admin notifications");
    }
  }

  /**
   * POST /api/notifications
   * Create a notification (admin/system).
   * Body: { organization_id, title, message?, type?, metadata?, location_id? }
   */
  static async createNotification(req: Request, res: Response): Promise<Response> {
    try {
      const { organization_id, location_id, title, message, type, metadata } = req.body;

      if (!organization_id || !title) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields",
          message: "organization_id and title are required",
        });
      }

      const result = await NotificationService.createNotificationForOrganization({
        organization_id: parseInt(String(organization_id), 10),
        location_id: location_id ? parseInt(String(location_id), 10) : undefined,
        title,
        message,
        type,
        metadata,
      });

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: "Failed to create notification",
          message: result.error,
        });
      }

      return res.status(201).json({
        success: true,
        notificationId: result.notificationId,
        message: "Notification created successfully",
      });
    } catch (error: unknown) {
      return handleError(res, error, "Create notification");
    }
  }

  /**
   * DELETE /api/notifications/:id
   * Delete a notification (admin).
   */
  static async deleteNotification(req: Request, res: Response): Promise<Response> {
    try {
      const idValidation = validateNotificationId(req.params.id);
      if (!idValidation.valid) {
        return res.status(400).json({
          success: false,
          error: "Invalid notification ID",
          message: idValidation.error,
        });
      }

      const result = await NotificationService.deleteNotificationById(
        idValidation.notificationId!
      );
      if (!result.success) {
        return res.status(404).json({
          success: false,
          error: "Notification not found",
          message: result.error,
        });
      }

      return res.json({
        success: true,
        message: "Notification deleted successfully",
      });
    } catch (error: unknown) {
      return handleError(res, error, "Delete notification");
    }
  }

  /**
   * GET /api/notifications/health
   * Health check endpoint.
   */
  static healthCheck(_req: Request, res: Response): Response {
    return res.json({
      success: true,
      status: "healthy",
      timestamp: new Date().toISOString(),
    });
  }
}
