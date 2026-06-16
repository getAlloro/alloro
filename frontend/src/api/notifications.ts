import { apiGet, apiPost, apiPatch, apiDelete } from "./index";

export interface Notification {
  id: number;
  organization_id?: number;
  title: string;
  message?: string;
  type: "task" | "pms" | "agent" | "system" | "ranking";
  location_name?: string;
  read: boolean;
  read_timestamp?: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationsResponse {
  success: boolean;
  notifications: Notification[];
  unreadCount: number;
  total: number;
}

/**
 * Fetch notifications for logged-in client.
 * organizationId is resolved server-side from the JWT token via RBAC middleware.
 */
export const fetchNotifications = async (
  _organizationId: number,
  locationId?: number | null
): Promise<NotificationsResponse> => {
  const params = new URLSearchParams();
  if (locationId) {
    params.append("locationId", String(locationId));
  }
  const qs = params.toString();
  const path = `/notifications${qs ? `?${qs}` : ""}`;
  return apiGet({ path });
};

/**
 * Mark a notification as read
 */
export const markNotificationRead = async (
  notificationId: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for call-site compat; org is derived server-side
  _organizationId: number
): Promise<{ success: boolean; message: string }> => {
  return apiPatch({
    path: `/notifications/${notificationId}/read`,
  });
};

/**
 * Mark all notifications as read
 */
export const markAllNotificationsRead = async (
  _organizationId: number,
  locationId?: number | null
): Promise<{ success: boolean; message: string; count: number }> => {
  const params = new URLSearchParams();
  if (locationId) {
    params.append("locationId", String(locationId));
  }
  const qs = params.toString();
  return apiPatch({
    path: `/notifications/mark-all-read${qs ? `?${qs}` : ""}`,
  });
};

/**
 * Delete all notifications for a user
 */
export const deleteAllNotifications = async (
  _organizationId: number,
  locationId?: number | null
): Promise<{ success: boolean; message: string; count: number }> => {
  const params = new URLSearchParams();
  if (locationId) {
    params.append("locationId", String(locationId));
  }
  const qs = params.toString();
  return apiDelete({
    path: `/notifications/delete-all${qs ? `?${qs}` : ""}`,
  });
};

// =====================================================================
// ADMIN ENDPOINTS
// =====================================================================

export interface AdminNotificationsResponse {
  success: boolean;
  notifications: Notification[];
  total: number;
}

export const fetchAdminNotifications = async (filters: {
  organization_id: number;
  location_id?: number;
  limit?: number;
  offset?: number;
}): Promise<AdminNotificationsResponse> => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== "") {
      params.append(key, String(value));
    }
  });
  const qs = params.toString();
  return apiGet({ path: `/notifications/admin/list${qs ? `?${qs}` : ""}` });
};

export const createAdminNotification = async (data: {
  organization_id: number;
  location_id?: number;
  title: string;
  message?: string;
  type?: string;
}): Promise<{ success: boolean; notificationId?: number; message: string }> => {
  return apiPost({ path: "/notifications", passedData: data });
};
