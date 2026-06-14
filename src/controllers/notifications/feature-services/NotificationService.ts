/**
 * NotificationService - Business logic layer for the notification system.
 *
 * Responsibilities:
 * - Notification CRUD operations via model layer
 * - Organization ownership verification
 * - Notification creation with org/location scoping
 *
 * All database access goes through NotificationModel — no direct query-builder
 * calls live in this service.
 */

import { NotificationModel, INotification } from "../../../models/NotificationModel";
import { resolveLocationId } from "../../../utils/locationResolver";

interface CreateNotificationResult {
  success: boolean;
  notificationId?: number;
  error?: string;
}

interface DeleteNotificationResult {
  success: boolean;
  error?: string;
}

export class NotificationService {
  /**
   * Create a notification for an organization.
   *
   * @param data - Notification creation data including organization_id, title, message, type, metadata
   * @returns Success with notification ID
   */
  static async createNotificationForOrganization(data: {
    organization_id: number;
    title: string;
    message?: string;
    type?: string;
    metadata?: unknown;
    location_id?: number | null;
  }): Promise<CreateNotificationResult> {
    // Use provided location_id or resolve from organization
    const locationId = data.location_id ?? await resolveLocationId(data.organization_id);

    // Create notification
    const notificationData: Partial<INotification> = {
      organization_id: data.organization_id,
      location_id: locationId,
      title: data.title,
      message: data.message || null,
      type: (data.type || "system") as INotification["type"],
      metadata: data.metadata ? data.metadata as Record<string, unknown> : null,
      read: false,
    };

    const notificationId = await NotificationModel.create(notificationData);
    return { success: true, notificationId };
  }

  /**
   * Delete a single notification by ID (admin operation).
   *
   * Verifies the notification exists before attempting deletion.
   *
   * @param notificationId - The notification ID to delete
   * @returns Success status with error details if not found
   */
  static async deleteNotificationById(
    notificationId: number
  ): Promise<DeleteNotificationResult> {
    // Check if notification exists
    const notification = await NotificationModel.findById(notificationId);

    if (!notification) {
      return {
        success: false,
        error: "Notification does not exist",
      };
    }

    await NotificationModel.deleteById(notificationId);
    return { success: true };
  }
}
