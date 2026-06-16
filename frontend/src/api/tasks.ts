import { apiGet, apiPatch, apiPost, apiDelete } from "./index";
import type {
  ActionItem,
  GroupedActionItemsResponse,
  ActionItemsResponse,
  CreateActionItemRequest,
  UpdateActionItemRequest,
  FetchActionItemsRequest,
} from "../types/tasks";

/**
 * Fetch tasks for logged-in client (grouped by category).
 * organizationId is resolved server-side from the JWT token via RBAC middleware.
 */
export const fetchClientTasks = async (
  _organizationId: number,
  locationId?: number | null
): Promise<GroupedActionItemsResponse> => {
  const params = new URLSearchParams();
  if (locationId) {
    params.append("locationId", String(locationId));
  }
  const qs = params.toString();
  return apiGet({ path: `/tasks${qs ? `?${qs}` : ""}` });
};

/**
 * Mark a USER category task as complete
 */
export const completeTask = async (
  taskId: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for call-site compat; org is derived server-side
  _organizationId: number
): Promise<{ success: boolean; task: ActionItem; message: string }> => {
  return apiPatch({ path: `/tasks/${taskId}/complete` });
};

/**
 * Create a new task (admin only)
 */
export const createTask = async (
  task: CreateActionItemRequest
): Promise<{ success: boolean; task: ActionItem; message: string }> => {
  return apiPost({ path: "/tasks", passedData: task });
};

/**
 * Fetch all tasks with filters (admin only)
 */
export const fetchAllTasks = async (
  filters: FetchActionItemsRequest = {}
): Promise<ActionItemsResponse> => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.append(key, String(value));
    }
  });
  const qs = params.toString();
  return apiGet({ path: `/tasks/admin/all${qs ? `?${qs}` : ""}` });
};

/**
 * Update a task (admin only)
 */
export const updateTask = async (
  taskId: number,
  updates: Omit<UpdateActionItemRequest, "id">
): Promise<{ success: boolean; task: ActionItem; message: string }> => {
  return apiPatch({ path: `/tasks/${taskId}`, passedData: updates });
};

/**
 * Update task category (admin only)
 */
export const updateTaskCategory = async (
  taskId: number,
  category: "ALLORO" | "USER"
): Promise<{ success: boolean; task: ActionItem; message: string }> => {
  return apiPatch({ path: `/tasks/${taskId}/category`, passedData: { category } });
};

/**
 * Archive a task (soft delete)
 */
export const archiveTask = async (
  taskId: number
): Promise<{ success: boolean; message: string }> => {
  return apiDelete({ path: `/tasks/${taskId}` });
};

/**
 * Unarchive a task (restore from archived)
 */
export const unarchiveTask = async (
  taskId: number
): Promise<{ success: boolean; task: ActionItem; message: string }> => {
  return apiPatch({ path: `/tasks/${taskId}`, passedData: { status: "pending" } });
};

/**
 * Bulk archive tasks (admin only)
 */
export const bulkArchiveTasks = async (
  taskIds: number[]
): Promise<{ success: boolean; message: string; count: number }> => {
  return apiPost({ path: "/tasks/bulk/delete", passedData: { taskIds } });
};

/**
 * Bulk unarchive tasks (restore from archived)
 */
export const bulkUnarchiveTasks = async (
  taskIds: number[]
): Promise<{ success: boolean; message: string; count: number }> => {
  return apiPost({ path: "/tasks/bulk/status", passedData: { taskIds, status: "pending" } });
};

/**
 * Bulk approve/unapprove tasks (admin only)
 */
export const bulkApproveTasks = async (
  taskIds: number[],
  is_approved: boolean
): Promise<{ success: boolean; message: string; count: number }> => {
  return apiPost({ path: "/tasks/bulk/approve", passedData: { taskIds, is_approved } });
};

/**
 * Bulk update task status (admin only)
 */
export const bulkUpdateStatus = async (
  taskIds: number[],
  status: "pending" | "in_progress" | "complete" | "archived"
): Promise<{ success: boolean; message: string; count: number }> => {
  return apiPost({ path: "/tasks/bulk/status", passedData: { taskIds, status } });
};

/**
 * Health check
 */
export const healthCheck = async (): Promise<{
  success: boolean;
  status: string;
  timestamp: string;
}> => {
  return apiGet({ path: "/tasks/health" });
};
